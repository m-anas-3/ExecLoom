import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import {
  claimDueExecutionOutbox,
  claimQueuedExecutionStep,
  completeClaimedExecutionStep,
  createDatabaseClient,
  failOrRetryClaimedExecutionStep,
  recoverStalledExecutionSteps,
  triggerExecutionForWorkflow,
  type DatabaseClient
} from "@execloom/db";
import {
  createExecutionQueue,
  publishExecutionJob,
  type ExecutionJobPayload
} from "@execloom/queue";

import {
  dispatchExecutionOutboxBatch,
  reconcileQueuedExecutionDispatches
} from "./outbox-dispatcher.js";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const runIntegrationTests = process.env.EXECLOOM_RUN_INTEGRATION_TESTS === "1";

describe("reliable execution dispatch", { skip: !runIntegrationTests, concurrency: false }, () => {
  let database: DatabaseClient;
  const users: string[] = [];
  const queues: Array<ReturnType<typeof createExecutionQueue>> = [];

  before(() => {
    database = createDatabaseClient();
  });

  after(async () => {
    for (const queue of queues) {
      await queue.obliterate({ force: true });
      await queue.close();
    }

    for (const userId of users) {
      await deleteUserData(database, userId);
    }

    await database.close();
  });

  it("keeps an initial execution durable when Redis is unavailable", async () => {
    const seeded = await seedWorkflow(database, users, ["only-step"]);
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: { requestId: "redis-down" }
    });
    assert.equal(triggered.kind, "created");

    const result = await dispatchExecutionOutboxBatch({
      dispatcherId: randomUUID(),
      batchSize: 10,
      leaseMs: 1_000,
      executionIds: [triggered.execution.id],
      publish: async () => {
        throw new Error("Redis unavailable");
      }
    });

    assert.deepEqual(result, { claimed: 1, dispatched: 0, failed: 1 });
    const [outbox] = await getOutboxRows(database, triggered.execution.id);
    assert.ok(outbox);
    assert.equal(outbox.dispatched_at, null);
    assert.equal(outbox.dispatch_attempt_count, 1);
    assert.equal(outbox.last_error, "Redis unavailable");

    const detail = await getExecutionState(database, triggered.execution.id);
    assert.equal(detail.execution_status, "queued");
    assert.equal(detail.step_status, "queued");
  });

  it("keeps the next step queued when publication fails", async () => {
    const seeded = await seedWorkflow(database, users, ["first", "second"]);
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: {}
    });
    assert.equal(triggered.kind, "created");

    await dispatchWithNoopPublisher(triggered.execution.id);
    const claim = await claimQueuedExecutionStep(triggered.execution.id);
    assert.equal(claim.kind, "claimed");
    const completed = await completeClaimedExecutionStep({
      executionId: claim.execution.id,
      stepRunId: claim.stepRun.id,
      outputJson: { first: "done" }
    });
    assert.equal(completed.kind, "next_step_queued");

    const failedDispatch = await dispatchExecutionOutboxBatch({
      dispatcherId: randomUUID(),
      batchSize: 10,
      leaseMs: 1_000,
      executionIds: [triggered.execution.id],
      publish: async () => {
        throw new Error("next-step publication failed");
      }
    });
    assert.equal(failedDispatch.failed, 1);

    const state = await getExecutionState(database, triggered.execution.id);
    assert.equal(state.execution_status, "running");
    assert.equal(state.step_status, "queued");
    const rows = await getOutboxRows(database, triggered.execution.id);
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.last_error, "next-step publication failed");
  });

  it("claims duplicate outbox processing only once", async () => {
    const seeded = await seedWorkflow(database, users, ["only-step"]);
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: {}
    });
    assert.equal(triggered.kind, "created");
    let publications = 0;
    const publish = async () => {
      publications += 1;
    };

    const [first, second] = await Promise.all([
      dispatchExecutionOutboxBatch({
        dispatcherId: randomUUID(),
        batchSize: 10,
        leaseMs: 30_000,
        executionIds: [triggered.execution.id],
        publish
      }),
      dispatchExecutionOutboxBatch({
        dispatcherId: randomUUID(),
        batchSize: 10,
        leaseMs: 30_000,
        executionIds: [triggered.execution.id],
        publish
      })
    ]);

    assert.equal(publications, 1);
    assert.equal(first.dispatched + second.dispatched, 1);
    assert.equal(first.claimed + second.claimed, 1);
  });

  it("republishes safely after a dispatcher crashes before marking dispatched", async () => {
    const seeded = await seedWorkflow(database, users, ["only-step"]);
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: {}
    });
    assert.equal(triggered.kind, "created");
    const queue = createTestQueue(queues);
    const crashTime = new Date();
    const [claimed] = await claimDueExecutionOutbox({
      dispatcherId: "crashed-dispatcher",
      now: crashTime,
      leaseExpiredBefore: new Date(crashTime.getTime() - 30_000),
      limit: 1,
      executionIds: [triggered.execution.id]
    });
    assert.ok(claimed);
    const payload = claimed.payloadJson as ExecutionJobPayload;

    await publishExecutionJob(queue, payload, { jobId: claimed.jobId });
    const publishedBeforeCrash = await queue.getJob(claimed.jobId);
    assert.ok(publishedBeforeCrash);

    const recovered = await dispatchExecutionOutboxBatch({
      dispatcherId: "replacement-dispatcher",
      batchSize: 10,
      leaseMs: 1_000,
      now: new Date(crashTime.getTime() + 1_001),
      executionIds: [triggered.execution.id],
      publish: async (record, executionPayload) => {
        await publishExecutionJob(queue, executionPayload, { jobId: record.jobId });
      }
    });

    assert.deepEqual(recovered, { claimed: 1, dispatched: 1, failed: 0 });
    assert.ok(await queue.getJob(claimed.jobId));
    assert.equal((await getOutboxRows(database, triggered.execution.id))[0]?.dispatched_at !== null, true);
  });

  it("continues execution after Redis becomes available again", async () => {
    const seeded = await seedWorkflow(database, users, ["only-step"]);
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: {}
    });
    assert.equal(triggered.kind, "created");

    await dispatchExecutionOutboxBatch({
      dispatcherId: randomUUID(),
      batchSize: 10,
      leaseMs: 1_000,
      executionIds: [triggered.execution.id],
      publish: async () => {
        throw new Error("ECONNREFUSED Redis");
      }
    });
    await database.queryClient`
      update execution_outbox
      set available_at = now()
      where execution_id = ${triggered.execution.id}
    `;

    const queue = createTestQueue(queues);
    const restored = await dispatchExecutionOutboxBatch({
      dispatcherId: randomUUID(),
      batchSize: 10,
      leaseMs: 1_000,
      executionIds: [triggered.execution.id],
      publish: async (record, payload) => {
        await publishExecutionJob(queue, payload, { jobId: record.jobId });
      }
    });
    assert.equal(restored.dispatched, 1);

    const claim = await claimQueuedExecutionStep(triggered.execution.id);
    assert.equal(claim.kind, "claimed");
    const completed = await completeClaimedExecutionStep({
      executionId: claim.execution.id,
      stepRunId: claim.stepRun.id,
      outputJson: { resumed: true }
    });
    assert.equal(completed.kind, "completed");
    assert.equal(completed.execution.status, "succeeded");
  });

  it("removes terminal jobs before resetting their dispatched intent", async () => {
    const seeded = await seedWorkflow(database, users, ["only-step"]);
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: {}
    });
    assert.equal(triggered.kind, "created");
    await dispatchWithNoopPublisher(triggered.execution.id);
    let removedJobId: string | undefined;

    const reconciled = await reconcileQueuedExecutionDispatches({
      limit: 25,
      executionIds: [triggered.execution.id],
      getJobState: async () => "terminal",
      removeTerminalJob: async (jobId) => {
        removedJobId = jobId;
      }
    });

    const [outbox] = await getOutboxRows(database, triggered.execution.id);
    assert.equal(removedJobId, outbox?.job_id);
    assert.equal(reconciled.repaired, 1);
    assert.equal(outbox?.dispatched_at, null);
  });

  it("reconciles missing jobs and persists retry and recovery intents", async () => {
    const seeded = await seedWorkflow(database, users, ["only-step"], {
      maxAttempts: 3,
      backoffMs: 0
    });
    const triggered = await triggerExecutionForWorkflow({
      ownerId: seeded.userId,
      workflowId: seeded.workflowId,
      inputJson: {}
    });
    assert.equal(triggered.kind, "created");
    await dispatchWithNoopPublisher(triggered.execution.id);

    const reconciled = await reconcileQueuedExecutionDispatches({
      limit: 25,
      executionIds: [triggered.execution.id],
      getJobState: async () => "missing",
      removeTerminalJob: async () => undefined
    });
    assert.equal(reconciled.repaired, 1);
    assert.equal((await getOutboxRows(database, triggered.execution.id))[0]?.dispatched_at, null);

    await dispatchWithNoopPublisher(triggered.execution.id);
    const claim = await claimQueuedExecutionStep(triggered.execution.id);
    assert.equal(claim.kind, "claimed");
    const retry = await failOrRetryClaimedExecutionStep({
      executionId: claim.execution.id,
      stepRunId: claim.stepRun.id,
      errorJson: { message: "temporary" },
      retryPolicy: { maxAttempts: 3, backoffMs: 0 }
    });
    assert.equal(retry.kind, "retry_queued");
    assert.equal((await getOutboxRows(database, triggered.execution.id)).length, 2);

    await dispatchWithNoopPublisher(triggered.execution.id);
    const retryClaim = await claimQueuedExecutionStep(triggered.execution.id);
    assert.equal(retryClaim.kind, "claimed");
    await database.queryClient`
      update step_runs
      set started_at = now() - interval '10 minutes'
      where id = ${retryClaim.stepRun.id}
    `;
    const recoveries = await recoverStalledExecutionSteps({
      stalledBefore: new Date(Date.now() - 60_000)
    });
    assert.equal(recoveries.some((result) => result.kind === "retry_queued"), true);
    assert.equal((await getOutboxRows(database, triggered.execution.id)).length, 3);
  });
});

async function dispatchWithNoopPublisher(executionId: string) {
  return dispatchExecutionOutboxBatch({
    dispatcherId: randomUUID(),
    batchSize: 25,
    leaseMs: 1_000,
    executionIds: [executionId],
    publish: async () => undefined
  });
}

function createTestQueue(queues: Array<ReturnType<typeof createExecutionQueue>>) {
  const queue = createExecutionQueue(undefined, `execloom-outbox-test-${randomUUID()}`);
  queues.push(queue);
  return queue;
}

async function seedWorkflow(
  database: DatabaseClient,
  users: string[],
  stepKeys: string[],
  retry = { maxAttempts: 1, backoffMs: 0 }
) {
  const userId = randomUUID();
  const workflowId = randomUUID();
  const versionId = randomUUID();
  users.push(userId);
  await database.queryClient.begin(async (sql) => {
    await sql`
      insert into users (id, email, password_hash)
      values (${userId}, ${`outbox-${userId}@example.com`}, 'not-used')
    `;
    await sql`
      insert into workflows (id, owner_id, name, status)
      values (${workflowId}, ${userId}, 'Outbox integration workflow', 'published')
    `;
    await sql`
      insert into workflow_versions (
        id,
        workflow_id,
        version_no,
        status,
        input_schema_json,
        definition_json,
        published_at
      )
      values (
        ${versionId},
        ${workflowId},
        1,
        'published',
        ${JSON.stringify({})}::jsonb,
        ${JSON.stringify({
          steps: stepKeys.map((key) => ({
            key,
            type: "noop",
            config: {},
            retry
          }))
        })}::jsonb,
        now()
      )
    `;
    await sql`
      update workflows
      set active_version_id = ${versionId}
      where id = ${workflowId}
    `;
  });

  return { userId, workflowId, versionId };
}

async function getOutboxRows(database: DatabaseClient, executionId: string) {
  return database.queryClient<
    Array<{
      id: string;
      job_id: string;
      dispatch_attempt_count: number;
      dispatched_at: Date | null;
      last_error: string | null;
    }>
  >`
    select id, job_id, dispatch_attempt_count, dispatched_at, last_error
    from execution_outbox
    where execution_id = ${executionId}
    order by created_at
  `;
}

async function getExecutionState(database: DatabaseClient, executionId: string) {
  const [state] = await database.queryClient<
    Array<{ execution_status: string; step_status: string }>
  >`
    select executions.status as execution_status, step_runs.status as step_status
    from executions
    inner join step_runs on step_runs.execution_id = executions.id
    where executions.id = ${executionId}
    order by step_runs.created_at desc
    limit 1
  `;
  assert.ok(state);
  return state;
}

async function deleteUserData(database: DatabaseClient, userId: string) {
  await database.queryClient`
    delete from execution_outbox
    where execution_id in (
      select executions.id
      from executions
      inner join workflow_versions on executions.workflow_version_id = workflow_versions.id
      inner join workflows on workflow_versions.workflow_id = workflows.id
      where workflows.owner_id = ${userId}
    )
  `;
  await database.queryClient`
    delete from execution_events
    where execution_id in (
      select executions.id
      from executions
      inner join workflow_versions on executions.workflow_version_id = workflow_versions.id
      inner join workflows on workflow_versions.workflow_id = workflows.id
      where workflows.owner_id = ${userId}
    )
  `;
  await database.queryClient`
    delete from step_runs
    where execution_id in (
      select executions.id
      from executions
      inner join workflow_versions on executions.workflow_version_id = workflow_versions.id
      inner join workflows on workflow_versions.workflow_id = workflows.id
      where workflows.owner_id = ${userId}
    )
  `;
  await database.queryClient`
    delete from executions
    where workflow_version_id in (
      select workflow_versions.id
      from workflow_versions
      inner join workflows on workflow_versions.workflow_id = workflows.id
      where workflows.owner_id = ${userId}
    )
  `;
  await database.queryClient`
    delete from workflow_versions
    where workflow_id in (select id from workflows where owner_id = ${userId})
  `;
  await database.queryClient`delete from workflows where owner_id = ${userId}`;
  await database.queryClient`delete from users where id = ${userId}`;
}
