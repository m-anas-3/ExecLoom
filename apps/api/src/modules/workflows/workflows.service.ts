import type {
  CreateWorkflowVersionRequest,
  CreateWorkflowRequest,
  WorkflowDetailResponse,
  WorkflowResponse,
  WorkflowVersionResponse
} from "@execloom/contracts";
import {
  createDraftWorkflowVersion,
  createWorkflowWithInitialVersion,
  findUserById,
  getWorkflowDetailByOwner,
  listCredentialIdsByOwner,
  listWorkflowsByOwner,
  publishLatestDraftVersion
} from "@execloom/db";

type WorkflowListRecord = Awaited<ReturnType<typeof listWorkflowsByOwner>>[number];
type WorkflowRecord = NonNullable<
  Awaited<ReturnType<typeof getWorkflowDetailByOwner>>
>["workflow"];
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

  await validateCredentialReferences(ownerId, input.definition);

  const created = await createWorkflowWithInitialVersion({
    ownerId,
    name: input.name,
    description: input.description,
    inputSchemaJson: input.inputSchema,
    definitionJson: input.definition
  });

  return {
    workflow: mapWorkflow(created.workflow, null),
    versions: [mapWorkflowVersion(created.version)]
  };
}

export async function listWorkflows(ownerId: string): Promise<WorkflowResponse[]> {
  const rows = await listWorkflowsByOwner(ownerId);

  return rows.map((row) => mapWorkflow(row, row.activeVersionNo));
}

export async function createWorkflowVersion(
  ownerId: string,
  workflowId: string,
  input: CreateWorkflowVersionRequest
): Promise<WorkflowDetailResponse> {
  await validateCredentialReferences(ownerId, input.definition);

  const created = await createDraftWorkflowVersion({
    ownerId,
    workflowId,
    inputSchemaJson: input.inputSchema,
    definitionJson: input.definition
  });

  if (!created) {
    throw new WorkflowServiceError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
  }

  return getWorkflow(ownerId, workflowId);
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
    workflow: mapWorkflow(
      detail.workflow,
      detail.versions.find((version) => version.id === detail.workflow.activeVersionId)
        ?.versionNo ?? null
    ),
    versions: detail.versions.map(mapWorkflowVersion)
  };
}

export async function publishWorkflow(
  ownerId: string,
  workflowId: string
): Promise<WorkflowDetailResponse> {
  const detail = await getWorkflowDetailByOwner(workflowId, ownerId);

  if (!detail) {
    throw new WorkflowServiceError(404, "WORKFLOW_NOT_FOUND", "Workflow was not found");
  }

  const draft = detail.versions.find((version) => version.status === "draft");

  if (draft) {
    await validateCredentialReferences(
      ownerId,
      draft.definitionJson as CreateWorkflowRequest["definition"]
    );
  }

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

  return getWorkflow(ownerId, workflowId);
}

async function validateCredentialReferences(
  ownerId: string,
  definition: CreateWorkflowRequest["definition"]
): Promise<void> {
  const referencedIds = new Set(
    definition.steps.flatMap((step) =>
      step.type === "http" && step.config.credentialId
        ? [step.config.credentialId]
        : []
    )
  );

  if (referencedIds.size === 0) {
    return;
  }

  const availableIds = new Set(await listCredentialIdsByOwner(ownerId));
  const unavailableId = [...referencedIds].find((id) => !availableIds.has(id));

  if (unavailableId) {
    throw new WorkflowServiceError(
      400,
      "CREDENTIAL_UNAVAILABLE",
      "Workflow references a credential that is unavailable"
    );
  }
}

function mapWorkflow(
  workflow: WorkflowRecord | WorkflowListRecord,
  activeVersionNo: number | null
): WorkflowResponse {
  return {
    id: workflow.id,
    ownerId: workflow.ownerId,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    activeVersionId: workflow.activeVersionId,
    activeVersionNo,
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
