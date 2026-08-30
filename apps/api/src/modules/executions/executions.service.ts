import type {
  ExecutionDetailResponse,
  ExecutionEventResponse,
  ExecutionListResponse,
  ExecutionResponse,
  ListWorkflowExecutionsQuery,
  StepRunResponse,
  TriggerExecutionRequest
} from "@execloom/contracts";
import {
  cancelExecutionByOwner,
  getExecutionDetailByOwner,
  listExecutionsByWorkflowAndOwner,
  triggerExecutionForWorkflow
} from "@execloom/db";
import { enqueueExecutionJob } from "@execloom/queue";

type ExecutionDetailRecord = NonNullable<Awaited<ReturnType<typeof getExecutionDetailByOwner>>>;
type ExecutionRecord = ExecutionDetailRecord["execution"];
type ExecutionListRecord = NonNullable<
  Awaited<ReturnType<typeof listExecutionsByWorkflowAndOwner>>
>[number];
type StepRunRecord = ExecutionDetailRecord["steps"][number];
type ExecutionEventRecord = ExecutionDetailRecord["events"][number];

export class ExecutionServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function triggerExecution(
  ownerId: string,
  workflowId: string,
  input: TriggerExecutionRequest
): Promise<ExecutionDetailResponse> {
  const result = await triggerExecutionForWorkflow({
    ownerId,
    workflowId,
    inputJson: input.input
  });

  if (result.kind === "workflow_not_found") {
    throw new ExecutionServiceError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
  }

  if (result.kind === "no_active_version") {
    throw new ExecutionServiceError(
      409,
      "NO_ACTIVE_VERSION",
      "Workflow must have an active published version before it can run"
    );
  }

  if (result.kind === "empty_workflow") {
    throw new ExecutionServiceError(
      409,
      "EMPTY_WORKFLOW",
      "Workflow version must contain at least one step"
    );
  }

  await enqueueExecutionJob({
    executionId: result.execution.id,
    workflowVersionId: result.execution.workflowVersionId
  });

  return {
    execution: mapExecution(result.execution),
    steps: result.steps.map(mapStepRun),
    events: result.events.map(mapExecutionEvent)
  };
}

export async function getExecution(
  ownerId: string,
  executionId: string
): Promise<ExecutionDetailResponse> {
  const detail = await getExecutionDetailByOwner(executionId, ownerId);

  if (!detail) {
    throw new ExecutionServiceError(404, "EXECUTION_NOT_FOUND", "Execution was not found");
  }

  return {
    execution: mapExecution(detail.execution),
    steps: detail.steps.map(mapStepRun),
    events: detail.events.map(mapExecutionEvent)
  };
}

export async function listWorkflowExecutions(
  ownerId: string,
  workflowId: string,
  query: ListWorkflowExecutionsQuery
): Promise<ExecutionListResponse> {
  const executions = await listExecutionsByWorkflowAndOwner({
    workflowId,
    ownerId,
    limit: query.limit
  });

  if (!executions) {
    throw new ExecutionServiceError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
  }

  return {
    executions: executions.map(mapExecution)
  };
}

export async function cancelExecution(
  ownerId: string,
  executionId: string
): Promise<ExecutionDetailResponse> {
  const result = await cancelExecutionByOwner(executionId, ownerId);

  if (result.kind === "execution_not_found") {
    throw new ExecutionServiceError(404, "EXECUTION_NOT_FOUND", "Execution was not found");
  }

  if (result.kind === "execution_not_cancellable") {
    throw new ExecutionServiceError(
      409,
      "EXECUTION_NOT_CANCELLABLE",
      `Execution cannot be cancelled from status ${result.status}`
    );
  }

  if (result.kind === "execution_cancel_lost") {
    throw new ExecutionServiceError(
      409,
      "EXECUTION_CANCEL_LOST",
      "Execution status changed before it could be cancelled"
    );
  }

  return {
    execution: mapExecution(result.execution),
    steps: result.steps.map(mapStepRun),
    events: result.events.map(mapExecutionEvent)
  };
}

function mapExecution(execution: ExecutionRecord | ExecutionListRecord): ExecutionResponse {
  return {
    id: execution.id,
    workflowVersionId: execution.workflowVersionId,
    status: execution.status,
    triggerType: execution.triggerType,
    input: execution.inputJson as Record<string, unknown>,
    output: execution.outputJson ?? null,
    error: execution.errorJson ?? null,
    createdAt: execution.createdAt.toISOString(),
    queuedAt: execution.queuedAt.toISOString(),
    startedAt: execution.startedAt?.toISOString() ?? null,
    endedAt: execution.endedAt?.toISOString() ?? null
  };
}

function mapStepRun(stepRun: StepRunRecord): StepRunResponse {
  return {
    id: stepRun.id,
    executionId: stepRun.executionId,
    stepKey: stepRun.stepKey,
    status: stepRun.status,
    attemptCount: stepRun.attemptCount,
    input: stepRun.inputJson ?? null,
    output: stepRun.outputJson ?? null,
    error: stepRun.errorJson ?? null,
    createdAt: stepRun.createdAt.toISOString(),
    queuedAt: stepRun.queuedAt?.toISOString() ?? null,
    startedAt: stepRun.startedAt?.toISOString() ?? null,
    endedAt: stepRun.endedAt?.toISOString() ?? null
  };
}

function mapExecutionEvent(event: ExecutionEventRecord): ExecutionEventResponse {
  return {
    id: event.id,
    executionId: event.executionId,
    sequenceNo: event.sequenceNo,
    type: event.type,
    payload: event.payloadJson as Record<string, unknown>,
    createdAt: event.createdAt.toISOString()
  };
}
