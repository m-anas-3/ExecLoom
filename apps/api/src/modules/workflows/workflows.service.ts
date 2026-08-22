import type {
  CreateWorkflowRequest,
  WorkflowDetailResponse,
  WorkflowResponse,
  WorkflowVersionResponse
} from "@execloom/contracts";
import {
  createWorkflowWithInitialVersion,
  findUserById,
  getWorkflowDetailByOwner,
  listWorkflowsByOwner,
  publishLatestDraftVersion
} from "@execloom/db";

type WorkflowRecord = Awaited<ReturnType<typeof listWorkflowsByOwner>>[number];
type WorkflowVersionRecord = NonNullable<
  Awaited<ReturnType<typeof getWorkflowDetailByOwner>>
>["versions"][number];

export class WorkflowServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function createWorkflow(
  ownerId: string,
  input: CreateWorkflowRequest
): Promise<WorkflowDetailResponse> {
  const owner = await findUserById(ownerId);

  if (!owner) {
    throw new WorkflowServiceError(404, "OWNER_NOT_FOUND", "Workflow owner was not found");
  }

  const created = await createWorkflowWithInitialVersion({
    ownerId,
    name: input.name,
    description: input.description,
    inputSchemaJson: input.inputSchema,
    definitionJson: input.definition
  });

  return {
    workflow: mapWorkflow(created.workflow),
    versions: [mapWorkflowVersion(created.version)]
  };
}

export async function listWorkflows(ownerId: string): Promise<WorkflowResponse[]> {
  const rows = await listWorkflowsByOwner(ownerId);

  return rows.map(mapWorkflow);
}

export async function getWorkflow(
  ownerId: string,
  workflowId: string
): Promise<WorkflowDetailResponse> {
  const detail = await getWorkflowDetailByOwner(workflowId, ownerId);

  if (!detail) {
    throw new WorkflowServiceError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
  }

  return {
    workflow: mapWorkflow(detail.workflow),
    versions: detail.versions.map(mapWorkflowVersion)
  };
}

export async function publishWorkflow(
  ownerId: string,
  workflowId: string
): Promise<WorkflowDetailResponse> {
  const published = await publishLatestDraftVersion(workflowId, ownerId);

  if (!published) {
    throw new WorkflowServiceError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
  }

  if (!published.version) {
    throw new WorkflowServiceError(
      409,
      "NO_DRAFT_VERSION",
      "Workflow does not have a draft version to publish"
    );
  }

  return {
    workflow: mapWorkflow(published.workflow),
    versions: [mapWorkflowVersion(published.version)]
  };
}

function mapWorkflow(workflow: WorkflowRecord): WorkflowResponse {
  return {
    id: workflow.id,
    ownerId: workflow.ownerId,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    activeVersionId: workflow.activeVersionId,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
    archivedAt: workflow.archivedAt?.toISOString() ?? null
  };
}

function mapWorkflowVersion(version: WorkflowVersionRecord): WorkflowVersionResponse {
  return {
    id: version.id,
    workflowId: version.workflowId,
    versionNo: version.versionNo,
    status: version.status,
    inputSchema: version.inputSchemaJson as Record<string, unknown>,
    definition: version.definitionJson as WorkflowVersionResponse["definition"],
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
    retiredAt: version.retiredAt?.toISOString() ?? null
  };
}
