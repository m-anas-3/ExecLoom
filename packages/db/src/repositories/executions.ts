import { and, asc, eq, sql } from "drizzle-orm";
import {
  assertExecutionTransition,
  assertStepRunTransition
} from "@execloom/workflow-core";

import { withDatabase, type DatabaseClient } from "../client.js";
import {
  executionEvents,
  executions,
  stepRuns,
  workflowVersions,
  workflows
} from "../schema.js";

type WorkflowDefinition = {
  steps?: Array<{
    key?: unknown;
    type?: unknown;
    name?: unknown;
    config?: unknown;
    retry?: unknown;
  }>;
};

export type WorkflowStepRetryPolicyRecord = {
  maxAttempts: number;
  backoffMs: number;
};

export type WorkflowStepDefinitionRecord = {
  key: string;
  type: string;
  name?: string;
  config: Record<string, unknown>;
  retry: WorkflowStepRetryPolicyRecord;
};

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["db"]["transaction"]>[0]>[0];
type ExecutionEventInsert = typeof executionEvents.$inferInsert;

export type TriggerExecutionRecordInput = {
  ownerId: string;
  workflowId: string;
  inputJson: unknown;
};

export async function triggerExecutionForWorkflow(input: TriggerExecutionRecordInput) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [workflow] = await tx
        .select()
        .from(workflows)
        .where(and(eq(workflows.id, input.workflowId), eq(workflows.ownerId, input.ownerId)))
        .limit(1);

      if (!workflow) {
        return { kind: "workflow_not_found" as const };
      }

      if (!workflow.activeVersionId) {
        return { kind: "no_active_version" as const };
      }

      const [version] = await tx
        .select()
        .from(workflowVersions)
        .where(
          and(
            eq(workflowVersions.id, workflow.activeVersionId),
            eq(workflowVersions.status, "published")
          )
        )
        .limit(1);

      if (!version) {
        return { kind: "no_active_version" as const };
      }

      const firstStepKey = getFirstStepKey(version.definitionJson);

      if (!firstStepKey) {
        return { kind: "empty_workflow" as const };
      }

      const [execution] = await tx
        .insert(executions)
        .values({
          workflowVersionId: version.id,
          inputJson: input.inputJson
        })
        .returning();

      if (!execution) {
        throw new Error("Failed to create execution");
      }

      const [stepRun] = await tx
        .insert(stepRuns)
        .values({
          executionId: execution.id,
          stepKey: firstStepKey,
          status: "queued"
        })
        .returning();

      if (!stepRun) {
        throw new Error("Failed to create initial step run");
      }

      const [event] = await tx
        .insert(executionEvents)
        .values({
          executionId: execution.id,
          sequenceNo: 1,
          type: "execution.queued",
          payloadJson: {
            executionId: execution.id,
            workflowVersionId: version.id,
            firstStepKey
          }
        })
        .returning();

      if (!event) {
        throw new Error("Failed to create execution event");
      }

      return {
        kind: "created" as const,
        execution,
        steps: [stepRun],
        events: [event]
      };
    });
  });
}

export async function getExecutionDetailByOwner(executionId: string, ownerId: string) {
  return withDatabase(async ({ db }) => {
    const [execution] = await db
      .select({
        id: executions.id,
        workflowVersionId: executions.workflowVersionId,
        status: executions.status,
        triggerType: executions.triggerType,
        inputJson: executions.inputJson,
        outputJson: executions.outputJson,
        errorJson: executions.errorJson,
        createdAt: executions.createdAt,
        queuedAt: executions.queuedAt,
        startedAt: executions.startedAt,
        endedAt: executions.endedAt
      })
      .from(executions)
      .innerJoin(workflowVersions, eq(executions.workflowVersionId, workflowVersions.id))
      .innerJoin(workflows, eq(workflowVersions.workflowId, workflows.id))
      .where(and(eq(executions.id, executionId), eq(workflows.ownerId, ownerId)))
      .limit(1);

    if (!execution) {
      return null;
    }

    const steps = await db
      .select()
      .from(stepRuns)
      .where(eq(stepRuns.executionId, execution.id))
      .orderBy(asc(stepRuns.createdAt));

    const events = await db
      .select()
      .from(executionEvents)
      .where(eq(executionEvents.executionId, execution.id))
      .orderBy(asc(executionEvents.sequenceNo));

    return {
      execution,
      steps,
      events
    };
  });
}

export async function claimQueuedExecutionStep(executionId: string) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [execution] = await tx
        .select()
        .from(executions)
        .where(eq(executions.id, executionId))
        .limit(1);

      if (!execution) {
        return { kind: "execution_not_found" as const };
      }

      if (execution.status !== "queued" && execution.status !== "running") {
        return {
          kind: "execution_not_claimable" as const,
          status: execution.status
        };
      }

      const [stepRun] = await tx
        .select()
        .from(stepRuns)
        .where(and(eq(stepRuns.executionId, execution.id), eq(stepRuns.status, "queued")))
        .orderBy(asc(stepRuns.createdAt))
        .limit(1);

      if (!stepRun) {
        return { kind: "step_not_found" as const };
      }

      const [version] = await tx
        .select({
          definitionJson: workflowVersions.definitionJson
        })
        .from(workflowVersions)
        .where(eq(workflowVersions.id, execution.workflowVersionId))
        .limit(1);

      if (!version) {
        return { kind: "workflow_version_not_found" as const };
      }

      const stepDefinition = getStepDefinition(version.definitionJson, stepRun.stepKey);

      if (!stepDefinition) {
        return { kind: "step_definition_not_found" as const };
      }

      assertStepRunTransition(stepRun.status, "running");

      const now = new Date();
      const nextSequenceNo = await getNextEventSequenceNo(tx, execution.id);
      const eventValues: ExecutionEventInsert[] = [];

      let runningExecution = execution;

      if (execution.status === "queued") {
        assertExecutionTransition(execution.status, "running");

        const [startedExecution] = await tx
          .update(executions)
          .set({
            status: "running",
            startedAt: now
          })
          .where(and(eq(executions.id, execution.id), eq(executions.status, "queued")))
          .returning();

        if (!startedExecution) {
          return { kind: "execution_claim_lost" as const };
        }

        runningExecution = startedExecution;
        eventValues.push({
          executionId: execution.id,
          sequenceNo: nextSequenceNo,
          type: "execution.started",
          payloadJson: {
            executionId: execution.id
          }
        });
      }

      const [runningStep] = await tx
        .update(stepRuns)
        .set({
          status: "running",
          attemptCount: stepRun.attemptCount + 1,
          errorJson: null,
          startedAt: now
        })
        .where(and(eq(stepRuns.id, stepRun.id), eq(stepRuns.status, "queued")))
        .returning();

      if (!runningStep) {
        return { kind: "step_claim_lost" as const };
      }

      eventValues.push({
        executionId: execution.id,
        sequenceNo: nextSequenceNo + eventValues.length,
        type: "step.started",
        payloadJson: {
          executionId: execution.id,
          stepRunId: runningStep.id,
          stepKey: runningStep.stepKey,
          attemptNo: runningStep.attemptCount
        }
      });

      await tx.insert(executionEvents).values(eventValues);

      return {
        kind: "claimed" as const,
        execution: runningExecution,
        stepRun: runningStep,
        stepDefinition
      };
    });
  });
}

export async function completeClaimedExecutionStep(input: {
  executionId: string;
  stepRunId: string;
  outputJson: unknown;
}) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [execution] = await tx
        .select()
        .from(executions)
        .where(eq(executions.id, input.executionId))
        .limit(1);

      if (!execution) {
        return { kind: "execution_not_found" as const };
      }

      if (execution.status !== "running") {
        return { kind: "execution_not_completable" as const, status: execution.status };
      }

      const [stepRun] = await tx
        .select()
        .from(stepRuns)
        .where(and(eq(stepRuns.id, input.stepRunId), eq(stepRuns.executionId, execution.id)))
        .limit(1);

      if (!stepRun) {
        return { kind: "step_not_found" as const };
      }

      if (stepRun.status !== "running") {
        return { kind: "step_not_completable" as const, status: stepRun.status };
      }

      const [version] = await tx
        .select({
          definitionJson: workflowVersions.definitionJson
        })
        .from(workflowVersions)
        .where(eq(workflowVersions.id, execution.workflowVersionId))
        .limit(1);

      if (!version) {
        return { kind: "workflow_version_not_found" as const };
      }

      const nextStepDefinition = getNextStepDefinition(version.definitionJson, stepRun.stepKey);

      assertStepRunTransition(stepRun.status, "succeeded");

      const completedAt = new Date();
      const nextSequenceNo = await getNextEventSequenceNo(tx, execution.id);

      const [completedStep] = await tx
        .update(stepRuns)
        .set({
          status: "succeeded",
          outputJson: input.outputJson,
          errorJson: null,
          endedAt: completedAt
        })
        .where(and(eq(stepRuns.id, stepRun.id), eq(stepRuns.status, "running")))
        .returning();

      if (!completedStep) {
        throw new Error("Failed to complete claimed step");
      }

      if (nextStepDefinition) {
        assertStepRunTransition("pending", "queued");

        const [nextStepRun] = await tx
          .insert(stepRuns)
          .values({
            executionId: execution.id,
            stepKey: nextStepDefinition.key,
            status: "queued",
            inputJson: input.outputJson,
            queuedAt: completedAt
          })
          .returning();

        if (!nextStepRun) {
          throw new Error("Failed to queue next step run");
        }

        await tx.insert(executionEvents).values([
          {
            executionId: execution.id,
            sequenceNo: nextSequenceNo,
            type: "step.succeeded",
            payloadJson: {
              executionId: execution.id,
              stepRunId: completedStep.id,
              stepKey: completedStep.stepKey,
              attemptNo: completedStep.attemptCount
            }
          },
          {
            executionId: execution.id,
            sequenceNo: nextSequenceNo + 1,
            type: "step.queued",
            payloadJson: {
              executionId: execution.id,
              stepRunId: nextStepRun.id,
              stepKey: nextStepRun.stepKey,
              previousStepKey: completedStep.stepKey
            }
          }
        ]);

        return {
          kind: "next_step_queued" as const,
          execution,
          stepRun: completedStep,
          nextStepRun,
          nextStepDefinition
        };
      }

      assertExecutionTransition(execution.status, "succeeded");

      const [completedExecution] = await tx
        .update(executions)
        .set({
          status: "succeeded",
          outputJson: {
            completed: true,
            completedStepKey: completedStep.stepKey
          },
          endedAt: completedAt
        })
        .where(and(eq(executions.id, execution.id), eq(executions.status, "running")))
        .returning();

      if (!completedExecution) {
        throw new Error("Failed to complete claimed execution");
      }

      await tx.insert(executionEvents).values([
        {
          executionId: execution.id,
          sequenceNo: nextSequenceNo,
          type: "step.succeeded",
          payloadJson: {
            executionId: execution.id,
            stepRunId: completedStep.id,
            stepKey: completedStep.stepKey,
            attemptNo: completedStep.attemptCount
          }
        },
        {
          executionId: execution.id,
          sequenceNo: nextSequenceNo + 1,
          type: "execution.completed",
          payloadJson: {
            executionId: execution.id,
            status: completedExecution.status
          }
        }
      ]);

      return {
        kind: "completed" as const,
        execution: completedExecution,
        stepRun: completedStep
      };
    });
  });
}

export async function failOrRetryClaimedExecutionStep(input: {
  executionId: string;
  stepRunId: string;
  errorJson: unknown;
  retryPolicy: WorkflowStepRetryPolicyRecord;
}) {
  return withDatabase(async ({ db }) => {
    return db.transaction(async (tx) => {
      const [execution] = await tx
        .select()
        .from(executions)
        .where(eq(executions.id, input.executionId))
        .limit(1);

      if (!execution) {
        return { kind: "execution_not_found" as const };
      }

      if (execution.status !== "running") {
        return { kind: "execution_not_failable" as const, status: execution.status };
      }

      const [stepRun] = await tx
        .select()
        .from(stepRuns)
        .where(and(eq(stepRuns.id, input.stepRunId), eq(stepRuns.executionId, execution.id)))
        .limit(1);

      if (!stepRun) {
        return { kind: "step_not_found" as const };
      }

      if (stepRun.status !== "running") {
        return { kind: "step_not_failable" as const, status: stepRun.status };
      }

      if (stepRun.attemptCount < input.retryPolicy.maxAttempts) {
        assertStepRunTransition(stepRun.status, "retrying");
        assertStepRunTransition("retrying", "queued");

        const retryAt = new Date();
        const nextSequenceNo = await getNextEventSequenceNo(tx, execution.id);

        const [retryingStep] = await tx
          .update(stepRuns)
          .set({
            status: "retrying",
            errorJson: input.errorJson
          })
          .where(and(eq(stepRuns.id, stepRun.id), eq(stepRuns.status, "running")))
          .returning();

        if (!retryingStep) {
          throw new Error("Failed to mark claimed step as retrying");
        }

        const [queuedStep] = await tx
          .update(stepRuns)
          .set({
            status: "queued",
            queuedAt: retryAt,
            startedAt: null,
            endedAt: null
          })
          .where(and(eq(stepRuns.id, retryingStep.id), eq(stepRuns.status, "retrying")))
          .returning();

        if (!queuedStep) {
          throw new Error("Failed to requeue failed step");
        }

        await tx.insert(executionEvents).values([
          {
            executionId: execution.id,
            sequenceNo: nextSequenceNo,
            type: "step.retrying",
            payloadJson: {
              executionId: execution.id,
              stepRunId: queuedStep.id,
              stepKey: queuedStep.stepKey,
              attemptNo: stepRun.attemptCount,
              maxAttempts: input.retryPolicy.maxAttempts,
              backoffMs: input.retryPolicy.backoffMs,
              error: input.errorJson
            }
          },
          {
            executionId: execution.id,
            sequenceNo: nextSequenceNo + 1,
            type: "step.queued",
            payloadJson: {
              executionId: execution.id,
              stepRunId: queuedStep.id,
              stepKey: queuedStep.stepKey,
              reason: "retry"
            }
          }
        ]);

        return {
          kind: "retry_queued" as const,
          execution,
          stepRun: queuedStep,
          retryDelayMs: input.retryPolicy.backoffMs
        };
      }

      assertStepRunTransition(stepRun.status, "failed");
      assertExecutionTransition(execution.status, "failed");

      const failedAt = new Date();
      const nextSequenceNo = await getNextEventSequenceNo(tx, execution.id);

      const [failedStep] = await tx
        .update(stepRuns)
        .set({
          status: "failed",
          errorJson: input.errorJson,
          endedAt: failedAt
        })
        .where(and(eq(stepRuns.id, stepRun.id), eq(stepRuns.status, "running")))
        .returning();

      if (!failedStep) {
        throw new Error("Failed to mark claimed step as failed");
      }

      const [failedExecution] = await tx
        .update(executions)
        .set({
          status: "failed",
          errorJson: input.errorJson,
          endedAt: failedAt
        })
        .where(and(eq(executions.id, execution.id), eq(executions.status, "running")))
        .returning();

      if (!failedExecution) {
        throw new Error("Failed to mark claimed execution as failed");
      }

      await tx.insert(executionEvents).values([
        {
          executionId: execution.id,
          sequenceNo: nextSequenceNo,
          type: "step.failed",
          payloadJson: {
            executionId: execution.id,
            stepRunId: failedStep.id,
            stepKey: failedStep.stepKey,
            attemptNo: failedStep.attemptCount,
            error: input.errorJson
          }
        },
        {
          executionId: execution.id,
          sequenceNo: nextSequenceNo + 1,
          type: "execution.failed",
          payloadJson: {
            executionId: execution.id,
            error: input.errorJson
          }
        }
      ]);

      return {
        kind: "failed" as const,
        execution: failedExecution,
        stepRun: failedStep
      };
    });
  });
}

export async function failClaimedExecutionStep(input: {
  executionId: string;
  stepRunId: string;
  errorJson: unknown;
}) {
  return failOrRetryClaimedExecutionStep({
    ...input,
    retryPolicy: defaultStepRetryPolicy
  });
}

function getFirstStepKey(definitionJson: unknown): string | null {
  const definition = definitionJson as WorkflowDefinition;
  const firstStepKey = definition.steps?.[0]?.key;

  return typeof firstStepKey === "string" && firstStepKey.length > 0 ? firstStepKey : null;
}

function getStepDefinition(
  definitionJson: unknown,
  stepKey: string
): WorkflowStepDefinitionRecord | null {
  const definition = definitionJson as WorkflowDefinition;
  const step = definition.steps?.find((candidate) => candidate.key === stepKey);

  if (!step || typeof step.key !== "string" || typeof step.type !== "string") {
    return null;
  }

  return {
    key: step.key,
    type: step.type,
    name: typeof step.name === "string" ? step.name : undefined,
    config: isJsonObject(step.config) ? step.config : {},
    retry: getStepRetryPolicy(step.retry)
  };
}

function getNextStepDefinition(
  definitionJson: unknown,
  currentStepKey: string
): WorkflowStepDefinitionRecord | null {
  const definition = definitionJson as WorkflowDefinition;
  const currentStepIndex = definition.steps?.findIndex((step) => step.key === currentStepKey) ?? -1;

  if (currentStepIndex < 0) {
    return null;
  }

  const nextStep = definition.steps?.[currentStepIndex + 1];

  if (!nextStep || typeof nextStep.key !== "string") {
    return null;
  }

  return getStepDefinition(definitionJson, nextStep.key);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultStepRetryPolicy: WorkflowStepRetryPolicyRecord = {
  maxAttempts: 1,
  backoffMs: 0
};

function getStepRetryPolicy(value: unknown): WorkflowStepRetryPolicyRecord {
  if (!isJsonObject(value)) {
    return defaultStepRetryPolicy;
  }

  const maxAttempts =
    typeof value.maxAttempts === "number" &&
    Number.isInteger(value.maxAttempts) &&
    value.maxAttempts >= 1 &&
    value.maxAttempts <= 10
      ? value.maxAttempts
      : defaultStepRetryPolicy.maxAttempts;

  const backoffMs =
    typeof value.backoffMs === "number" &&
    Number.isInteger(value.backoffMs) &&
    value.backoffMs >= 0 &&
    value.backoffMs <= 300_000
      ? value.backoffMs
      : defaultStepRetryPolicy.backoffMs;

  return {
    maxAttempts,
    backoffMs
  };
}

async function getNextEventSequenceNo(
  tx: DatabaseTransaction,
  executionId: string
): Promise<number> {
  const [eventSequence] = await tx
    .select({
      maxSequenceNo: sql<number>`coalesce(max(${executionEvents.sequenceNo}), 0)`
    })
    .from(executionEvents)
    .where(eq(executionEvents.executionId, executionId));

  return Number(eventSequence?.maxSequenceNo ?? 0) + 1;
}
