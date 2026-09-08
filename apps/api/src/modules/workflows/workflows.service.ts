import type {
  CreateWorkflowVersionRequest,
  CreateWorkflowRequest,
  WorkflowDetailResponse,
  WorkflowResponse,
  WorkflowVersionResponse
} from "@execloom/contracts";
import { validateWorkflowDefinitionSemantics } from "@execloom/workflow-core";
import {
  createDraftWorkflowVersion,
  createWorkflowWithInitialVersion,
  findUserById,
  getWorkflowDetailByOwner,
  listCredentialRecordsByOwner,
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
    message: string,
    public readonly details?: unknown
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

  validateDefinitionSemantics(input.definition);
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
  validateDefinitionSemantics(input.definition);
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
    validateDefinitionSemantics(
      draft.definitionJson as CreateWorkflowRequest["definition"]
    );
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
      (step.type === "http" || step.type === "ai") && step.config.credentialId
        ? [step.config.credentialId]
        : []
    )
  );

  if (referencedIds.size === 0) {
    return;
  }

  const credentials = await listCredentialRecordsByOwner(ownerId);
  const availableById = new Map(credentials.map((credential) => [credential.id, credential]));
  const unavailableId = [...referencedIds].find((id) => !availableById.has(id));

  if (unavailableId) {
    throw new WorkflowServiceError(
      400,
      "CREDENTIAL_UNAVAILABLE",
      "Workflow references a credential that is unavailable"
    );
  }

  const invalidAiCredential = definition.steps.find(
    (step) =>
      step.type === "ai" &&
      availableById.get(step.config.credentialId)?.type !== "bearer_token"
  );

  if (invalidAiCredential) {
    throw new WorkflowServiceError(
      400,
      "AI_CREDENTIAL_TYPE_INVALID",
      "AI steps require a Bearer Token credential"
    );
  }
}

function validateDefinitionSemantics(
  definition: CreateWorkflowRequest["definition"]
): void {
  const issues = validateWorkflowDefinitionSemantics(definition.steps);

  if (issues.length > 0) {
    throw new WorkflowServiceError(
      400,
      "WORKFLOW_DEFINITION_INVALID",
      "Workflow definition contains invalid expressions or output schemas",
      issues
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
