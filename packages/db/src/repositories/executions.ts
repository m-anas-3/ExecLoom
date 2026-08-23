import { and, asc, eq } from "drizzle-orm";

import { withDatabase } from "../client.js";
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
  }>;
};

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

function getFirstStepKey(definitionJson: unknown): string | null {
  const definition = definitionJson as WorkflowDefinition;
  const firstStepKey = definition.steps?.[0]?.key;

  return typeof firstStepKey === "string" && firstStepKey.length > 0 ? firstStepKey : null;
}
