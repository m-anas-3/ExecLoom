import { config as loadDotenv } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Worker as BullWorker } from "bullmq";

import { loadConfig } from "@execloom/config";
import {
  claimQueuedExecutionStep,
  completeClaimedExecutionStep,
  failOrRetryClaimedExecutionStep,
  recoverStalledExecutionSteps,
  resolveCredentialSecretForOwner
} from "@execloom/db";
import {
  createExecutionQueue,
  createRedisConnectionOptions,
  executionJobPayloadSchema,
  executionJobName,
  publishExecutionJob,
  executionQueueName
} from "@execloom/queue";

import { executeWorkflowStep, type ResolvedHttpCredential } from "./executors.js";
import {
  dispatchExecutionOutboxBatch,
  reconcileQueuedExecutionDispatches
} from "./outbox-dispatcher.js";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const config = loadConfig();
const dispatcherId = randomUUID();
const executionQueue = createExecutionQueue(config.REDIS_URL);

console.log("Worker booting", {
  nodeEnv: config.NODE_ENV,
  redisConfigured: Boolean(config.REDIS_URL),
  databaseConfigured: Boolean(config.DATABASE_URL)
});

const executionWorker = new BullWorker(
  executionQueueName,
  async (job) => {
    const payload = executionJobPayloadSchema.parse(job.data);

    console.log("Execution job received", {
      jobId: job.id,
      executionId: payload.executionId,
      workflowVersionId: payload.workflowVersionId,
      attemptsMade: job.attemptsMade
    });

    const claim = await claimQueuedExecutionStep(payload.executionId);

    if (claim.kind !== "claimed") {
      console.log("Execution job skipped", {
        executionId: payload.executionId,
        result: claim.kind
      });
      return;
    }

    let output: unknown;

    try {
      const credential = await resolveStepCredential(
        claim.stepDefinition,
        claim.workflowOwnerId
      );
      output = await executeWorkflowStep({
        step: claim.stepDefinition,
        executionInput: claim.execution.inputJson,
        stepInput: claim.stepRun.inputJson ?? claim.execution.inputJson,
        credential
      });
    } catch (error) {
      const failure = await failOrRetryClaimedExecutionStep({
        executionId: claim.execution.id,
        stepRunId: claim.stepRun.id,
        errorJson: serializeError(error),
        retryPolicy: claim.stepDefinition.retry
      });

      if (failure.kind === "retry_queued") {
        console.warn("Execution step retry persisted", {
          executionId: payload.executionId,
          stepRunId: failure.stepRun.id,
          retryDelayMs: failure.retryDelayMs,
          error: error instanceof Error ? error.message : "Unknown error"
        });

        return;
      }

      console.error("Execution job failed during step execution", {
        executionId: payload.executionId,
        result: failure.kind,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      return;
    }

    const result = await completeClaimedExecutionStep({
      executionId: claim.execution.id,
      stepRunId: claim.stepRun.id,
      outputJson: output
    });

    console.log("Execution job processed", {
      executionId: payload.executionId,
      result: result.kind
    });
  },
  {
    connection: createRedisConnectionOptions(config.REDIS_URL),
    concurrency: 5
  }
);

let recoveryRunning = false;
let dispatchRunning = false;
let reconciliationRunning = false;

const dispatchTimer = setInterval(() => {
  void dispatchOutbox();
}, config.OUTBOX_DISPATCH_INTERVAL_MS);
dispatchTimer.unref();
void dispatchOutbox();

const reconciliationTimer = setInterval(() => {
  void reconcileOutbox();
}, config.OUTBOX_RECONCILE_INTERVAL_MS);
reconciliationTimer.unref();
void reconcileOutbox();

const recoveryTimer = setInterval(() => {
  void recoverStalledSteps();
}, config.WORKER_RECOVERY_INTERVAL_MS);
recoveryTimer.unref();
void recoverStalledSteps();

executionWorker.on("ready", () => {
  console.log("Execution worker ready", {
    queue: executionQueueName
  });
});

executionWorker.on("completed", (job) => {
  console.log("Execution job completed", {
    jobId: job.id
  });
});

executionWorker.on("failed", (job, error) => {
  console.error("Execution job failed", {
    jobId: job?.id,
    error: error.message
  });
});

executionWorker.on("error", (error) => {
  console.error("Execution worker connection error", {
    error: error.message
  });
});

executionQueue.on("error", (error) => {
  console.error("Execution dispatcher connection error", {
    error: error.message
  });
});

async function shutdown() {
  console.log("Worker shutting down");
  clearInterval(dispatchTimer);
  clearInterval(reconciliationTimer);
  clearInterval(recoveryTimer);
  await executionWorker.close();
  await executionQueue.close();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: "Unknown error",
    value: error
  };
}

async function recoverStalledSteps() {
  if (recoveryRunning) {
    return;
  }

  recoveryRunning = true;

  try {
    const stalledBefore = new Date(Date.now() - config.WORKER_STALLED_STEP_TIMEOUT_MS);
    const recoveries = await recoverStalledExecutionSteps({
      stalledBefore
    });

    if (recoveries.length > 0) {
      console.warn("Recovered stalled execution steps", {
        count: recoveries.length,
        stalledBefore: stalledBefore.toISOString()
      });
    }
  } catch (error) {
    console.error("Failed to recover stalled execution steps", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    recoveryRunning = false;
  }
}

async function dispatchOutbox() {
  if (dispatchRunning) {
    return;
  }

  dispatchRunning = true;

  try {
    const result = await dispatchExecutionOutboxBatch({
      dispatcherId,
      batchSize: config.OUTBOX_DISPATCH_BATCH_SIZE,
      leaseMs: config.OUTBOX_DISPATCH_LEASE_MS,
      publish: async (record, payload) => {
        if (record.jobName !== executionJobName) {
          throw new Error(`Unsupported outbox job name: ${record.jobName}`);
        }

        await publishExecutionJob(executionQueue, payload, {
          jobId: record.jobId
        });
      }
    });

    if (result.claimed > 0) {
      console.log("Execution outbox batch processed", result);
    }
  } catch (error) {
    console.error("Execution outbox dispatch failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    dispatchRunning = false;
  }
}

async function reconcileOutbox() {
  if (reconciliationRunning) {
    return;
  }

  reconciliationRunning = true;

  try {
    const result = await reconcileQueuedExecutionDispatches({
      limit: config.OUTBOX_DISPATCH_BATCH_SIZE,
      getJobState: async (jobId) => {
        const job = await executionQueue.getJob(jobId);

        if (!job) {
          return "missing";
        }

        const state = await job.getState();

        if (state === "completed" || state === "failed") {
          return "terminal";
        }

        return state === "unknown" ? "missing" : "pending";
      },
      removeTerminalJob: async (jobId) => {
        const job = await executionQueue.getJob(jobId);

        if (job) {
          await job.remove();
        }
      }
    });

    if (result.repaired > 0) {
      console.warn("Repaired missing execution dispatches", result);
      void dispatchOutbox();
    }
  } catch (error) {
    console.error("Execution outbox reconciliation failed", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
  } finally {
    reconciliationRunning = false;
  }
}

async function resolveStepCredential(
  step: { type: string; config: Record<string, unknown> },
  ownerId: string
): Promise<ResolvedHttpCredential | undefined> {
  if (step.type !== "http" || step.config.credentialId === undefined) {
    return undefined;
  }

  if (typeof step.config.credentialId !== "string") {
    throw new Error("HTTP step credential id is invalid");
  }

  const credential = await resolveCredentialSecretForOwner(
    step.config.credentialId,
    ownerId
  );

  if (!credential) {
    throw new Error("HTTP step credential is unavailable");
  }

  return credential;
}
