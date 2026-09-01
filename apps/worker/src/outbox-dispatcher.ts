import {
  executionJobPayloadSchema,
  type ExecutionJobPayload
} from "@execloom/queue";
import {
  buildExecutionDispatchJobId,
  claimDueExecutionOutbox,
  ensureQueuedStepDispatch,
  getExecutionOutboxByJobId,
  listQueuedStepDispatchCandidates,
  markExecutionOutboxDispatched,
  markExecutionOutboxFailed,
  type ClaimedExecutionOutboxRecord
} from "@execloom/db";

export type PublishExecutionOutboxRecord = (
  record: ClaimedExecutionOutboxRecord,
  payload: ExecutionJobPayload
) => Promise<void>;

export type ReconciledQueueJobState = "missing" | "pending" | "terminal";

export async function dispatchExecutionOutboxBatch(input: {
  dispatcherId: string;
  batchSize: number;
  leaseMs: number;
  publish: PublishExecutionOutboxRecord;
  now?: Date;
  executionIds?: string[];
}) {
  const now = input.now ?? new Date();
  const records = await claimDueExecutionOutbox({
    dispatcherId: input.dispatcherId,
    now,
    leaseExpiredBefore: new Date(now.getTime() - input.leaseMs),
    limit: input.batchSize,
    executionIds: input.executionIds
  });
  let dispatched = 0;
  let failed = 0;

  for (const record of records) {
    try {
      const payload = parseExecutionJobPayload(record.payloadJson);
      await input.publish(record, payload);
      await markExecutionOutboxDispatched({
        outboxId: record.id,
        dispatcherId: input.dispatcherId,
        dispatchedAt: new Date()
      });
      dispatched += 1;
    } catch (error) {
      const availableAt = new Date(
        Date.now() + getOutboxDispatchBackoffMs(record.dispatchAttemptCount)
      );
      await markExecutionOutboxFailed({
        outboxId: record.id,
        dispatcherId: input.dispatcherId,
        availableAt,
        error: error instanceof Error ? error.message : "Unknown dispatch error"
      });
      failed += 1;
    }
  }

  return { claimed: records.length, dispatched, failed };
}

export async function reconcileQueuedExecutionDispatches(input: {
  limit: number;
  getJobState: (jobId: string) => Promise<ReconciledQueueJobState>;
  removeTerminalJob: (jobId: string) => Promise<void>;
  executionIds?: string[];
}) {
  const candidates = await listQueuedStepDispatchCandidates(
    input.limit,
    input.executionIds
  );
  let repaired = 0;

  for (const candidate of candidates) {
    const attemptNo = candidate.attemptCount + 1;
    const jobId = buildExecutionDispatchJobId(
      candidate.executionId,
      candidate.stepRunId,
      attemptNo
    );
    const outbox = await getExecutionOutboxByJobId(jobId);

    if (outbox && !outbox.dispatchedAt) {
      continue;
    }

    const jobState = await input.getJobState(jobId);

    if (jobState === "pending") {
      continue;
    }

    if (jobState === "terminal") {
      await input.removeTerminalJob(jobId);
    }

    const result = await ensureQueuedStepDispatch({
      executionId: candidate.executionId,
      workflowVersionId: candidate.workflowVersionId,
      stepRunId: candidate.stepRunId,
      attemptNo,
      resetDispatched: Boolean(outbox?.dispatchedAt)
    });

    if (result.kind === "created" || result.kind === "reset") {
      repaired += 1;
    }
  }

  return { inspected: candidates.length, repaired };
}

export function getOutboxDispatchBackoffMs(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 6));
  return Math.min(1_000 * 2 ** exponent, 60_000);
}

function parseExecutionJobPayload(payload: unknown): ExecutionJobPayload {
  return executionJobPayloadSchema.parse(payload);
}
