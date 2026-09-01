import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  or,
  sql
} from "drizzle-orm";

import { withDatabase, type DatabaseClient } from "../client.js";
import { executionOutbox, executions, stepRuns } from "../schema.js";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["db"]["transaction"]>[0]>[0];
const executionRunJobName = "execution.run";

export type CreateExecutionDispatchIntentInput = {
  executionId: string;
  workflowVersionId: string;
  stepRunId: string;
  attemptNo: number;
  availableAt?: Date;
};

export type ClaimedExecutionOutboxRecord = typeof executionOutbox.$inferSelect;

export function buildExecutionDispatchJobId(
  executionId: string,
  stepRunId: string,
  attemptNo: number
): string {
  return `execution-${executionId}-step-${stepRunId}-attempt-${attemptNo}`;
}

export async function createExecutionDispatchIntent(
  tx: DatabaseTransaction,
  input: CreateExecutionDispatchIntentInput
) {
  const payload = {
    executionId: input.executionId,
    workflowVersionId: input.workflowVersionId
  };

  const [record] = await tx
    .insert(executionOutbox)
    .values({
      executionId: input.executionId,
      stepRunId: input.stepRunId,
      attemptNo: input.attemptNo,
      jobId: buildExecutionDispatchJobId(
        input.executionId,
        input.stepRunId,
        input.attemptNo
      ),
      jobName: executionRunJobName,
      payloadJson: payload,
      availableAt: input.availableAt ?? new Date()
    })
    .onConflictDoNothing({
      target: [executionOutbox.stepRunId, executionOutbox.attemptNo]
    })
    .returning();

  return record ?? null;
}

export async function discardPendingExecutionDispatches(
  tx: DatabaseTransaction,
  executionId: string,
  reason: string
) {
  const now = new Date();

  return tx
    .update(executionOutbox)
    .set({
      discardedAt: now,
      lockedAt: null,
      lockedBy: null,
      lastError: reason,
      updatedAt: now
    })
    .where(
      and(
        eq(executionOutbox.executionId, executionId),
        isNull(executionOutbox.dispatchedAt),
        isNull(executionOutbox.discardedAt)
      )
    );
}

export async function claimDueExecutionOutbox(input: {
  dispatcherId: string;
  now: Date;
  leaseExpiredBefore: Date;
  limit: number;
  executionIds?: string[];
}): Promise<ClaimedExecutionOutboxRecord[]> {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const records = await tx
        .select()
        .from(executionOutbox)
        .where(
          and(
            isNull(executionOutbox.dispatchedAt),
            isNull(executionOutbox.discardedAt),
            input.executionIds
              ? inArray(executionOutbox.executionId, input.executionIds)
              : undefined,
            lte(executionOutbox.availableAt, input.now),
            or(
              isNull(executionOutbox.lockedAt),
              lte(executionOutbox.lockedAt, input.leaseExpiredBefore)
            )
          )
        )
        .orderBy(asc(executionOutbox.availableAt), asc(executionOutbox.createdAt))
        .limit(input.limit)
        .for("update", { skipLocked: true });

      if (records.length === 0) {
        return [];
      }

      return tx
        .update(executionOutbox)
        .set({
          lockedAt: input.now,
          lockedBy: input.dispatcherId,
          dispatchAttemptCount: sql`${executionOutbox.dispatchAttemptCount} + 1`,
          updatedAt: input.now
        })
        .where(inArray(executionOutbox.id, records.map(({ id }) => id)))
        .returning();
    });
  });
}

export async function markExecutionOutboxDispatched(input: {
  outboxId: string;
  dispatcherId: string;
  dispatchedAt: Date;
}) {
  return withDatabase(async ({ db }) => {
    const [record] = await db
      .update(executionOutbox)
      .set({
        dispatchedAt: input.dispatchedAt,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: input.dispatchedAt
      })
      .where(
        and(
          eq(executionOutbox.id, input.outboxId),
          eq(executionOutbox.lockedBy, input.dispatcherId),
          isNull(executionOutbox.dispatchedAt),
          isNull(executionOutbox.discardedAt)
        )
      )
      .returning();

    return record ?? null;
  });
}

export async function markExecutionOutboxFailed(input: {
  outboxId: string;
  dispatcherId: string;
  availableAt: Date;
  error: string;
}) {
  return withDatabase(async ({ db }) => {
    const now = new Date();
    const [record] = await db
      .update(executionOutbox)
      .set({
        availableAt: input.availableAt,
        lockedAt: null,
        lockedBy: null,
        lastError: input.error.slice(0, 2_000),
        updatedAt: now
      })
      .where(
        and(
          eq(executionOutbox.id, input.outboxId),
          eq(executionOutbox.lockedBy, input.dispatcherId),
          isNull(executionOutbox.dispatchedAt),
          isNull(executionOutbox.discardedAt)
        )
      )
      .returning();

    return record ?? null;
  });
}

export async function listQueuedStepDispatchCandidates(
  limit = 25,
  executionIds?: string[]
) {
  return withDatabase(async ({ db }) => {
    return db
      .select({
        executionId: executions.id,
        workflowVersionId: executions.workflowVersionId,
        executionStatus: executions.status,
        stepRunId: stepRuns.id,
        stepStatus: stepRuns.status,
        attemptCount: stepRuns.attemptCount
      })
      .from(stepRuns)
      .innerJoin(executions, eq(stepRuns.executionId, executions.id))
      .where(
        and(
          eq(stepRuns.status, "queued"),
          executionIds ? inArray(executions.id, executionIds) : undefined,
          inArray(executions.status, ["queued", "running"])
        )
      )
      .orderBy(asc(stepRuns.queuedAt), asc(stepRuns.createdAt))
      .limit(limit);
  });
}

export async function getExecutionOutboxByJobId(jobId: string) {
  return withDatabase(async ({ db }) => {
    const [record] = await db
      .select()
      .from(executionOutbox)
      .where(eq(executionOutbox.jobId, jobId))
      .limit(1);

    return record ?? null;
  });
}

export async function ensureQueuedStepDispatch(input: {
  executionId: string;
  workflowVersionId: string;
  stepRunId: string;
  attemptNo: number;
  resetDispatched: boolean;
}) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({
          executionStatus: executions.status,
          stepStatus: stepRuns.status,
          attemptCount: stepRuns.attemptCount
        })
        .from(stepRuns)
        .innerJoin(executions, eq(stepRuns.executionId, executions.id))
        .where(
          and(
            eq(stepRuns.id, input.stepRunId),
            eq(stepRuns.executionId, input.executionId)
          )
        )
        .limit(1)
        .for("update", { of: stepRuns });

      if (
        !candidate ||
        candidate.stepStatus !== "queued" ||
        (candidate.executionStatus !== "queued" && candidate.executionStatus !== "running") ||
        candidate.attemptCount + 1 !== input.attemptNo
      ) {
        return { kind: "not_queued" as const };
      }

      const jobId = buildExecutionDispatchJobId(
        input.executionId,
        input.stepRunId,
        input.attemptNo
      );
      const [existing] = await tx
        .select()
        .from(executionOutbox)
        .where(eq(executionOutbox.jobId, jobId))
        .limit(1)
        .for("update");

      if (existing) {
        if (!input.resetDispatched || existing.discardedAt) {
          return { kind: "exists" as const, record: existing };
        }

        const now = new Date();
        const [reset] = await tx
          .update(executionOutbox)
          .set({
            availableAt: now,
            lockedAt: null,
            lockedBy: null,
            dispatchedAt: null,
            lastError: "Queue reconciliation requested republication",
            updatedAt: now
          })
          .where(eq(executionOutbox.id, existing.id))
          .returning();

        return { kind: "reset" as const, record: reset ?? existing };
      }

      const record = await createExecutionDispatchIntent(tx, input);
      return { kind: "created" as const, record };
    });
  });
}
