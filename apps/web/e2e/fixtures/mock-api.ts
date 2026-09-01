import type {
  CredentialResponse,
  ExecutionDetailResponse,
  ExecutionResponse,
  WorkflowDetailResponse,
  WorkflowResponse,
  WorkflowVersionResponse
} from "@execloom/contracts";
import type { Page, Route } from "@playwright/test";

const now = "2026-08-21T13:30:00.000Z";
const ownerId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const executionId = "44444444-4444-4444-8444-444444444444";
const credentialId = "55555555-5555-4555-8555-555555555555";

type MockState = {
  workflowDetail: WorkflowDetailResponse | null;
  executionDetail: ExecutionDetailResponse | null;
  executionReads: number;
  credentials: CredentialResponse[];
};

export async function installMockApi(page: Page, options: { seedWorkflow?: boolean } = {}) {
  const state: MockState = {
    workflowDetail: options.seedWorkflow ? createSeedWorkflow() : null,
    executionDetail: null,
    executionReads: 0,
    credentials: []
  };

  await page.route("**/api/backend/**", async (route) => {
    await handleApiRoute(route, state);
  });

  return {
    state,
    workflowId,
    executionId,
    credentialId
  };
}

export async function installAuthenticatedSession(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("execloom.accessToken", "mock-access-token");
  });
}

async function handleApiRoute(route: Route, state: MockState) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace(/^\/api\/backend/, "");
  const method = request.method();

  if ((path === "/auth/register" || path === "/auth/login") && method === "POST") {
    const body = request.postDataJSON() as { email: string };

    if (path === "/auth/login" && body.email === "wrong@example.com") {
      await json(route, { code: "INVALID_CREDENTIALS", message: "Invalid credentials" }, 401);
      return;
    }

    if (path === "/auth/register" && body.email === "taken@example.com") {
      await json(route, { code: "EMAIL_IN_USE", message: "Email already in use" }, 409);
      return;
    }

    await json(route, {
      accessToken: "mock-access-token",
      tokenType: "Bearer",
      user: { id: ownerId, email: body.email.toLowerCase(), createdAt: now }
    }, path === "/auth/register" ? 201 : 200);
    return;
  }

  if (path === "/auth/me" && method === "GET") {
    await json(route, {
      user: { id: ownerId, email: "builder@example.com", createdAt: now }
    });
    return;
  }

  if (path === "/credentials" && method === "GET") {
    await json(route, { credentials: state.credentials });
    return;
  }

  if (path === "/credentials" && method === "POST") {
    const body = request.postDataJSON() as {
      name: string;
      type: "api_key" | "bearer_token";
      headerName?: string;
    };
    const credential: CredentialResponse = {
      id: credentialId,
      ownerId,
      name: body.name,
      type: body.type,
      headerName: body.type === "api_key" ? body.headerName ?? "x-api-key" : null,
      createdAt: now,
      updatedAt: now
    };
    state.credentials = [credential, ...state.credentials];
    await json(route, credential, 201);
    return;
  }

  if (path === `/credentials/${credentialId}` && method === "PATCH") {
    const body = request.postDataJSON() as { name?: string; headerName?: string };
    const existing = state.credentials.find((credential) => credential.id === credentialId);

    if (!existing) {
      await json(route, { code: "CREDENTIAL_NOT_FOUND", message: "Credential not found" }, 404);
      return;
    }

    const updated = {
      ...existing,
      ...(body.name ? { name: body.name } : {}),
      ...(body.headerName ? { headerName: body.headerName } : {}),
      updatedAt: now
    };
    state.credentials = state.credentials.map((credential) =>
      credential.id === credentialId ? updated : credential
    );
    await json(route, updated);
    return;
  }

  if (path === `/credentials/${credentialId}` && method === "DELETE") {
    state.credentials = state.credentials.filter((credential) => credential.id !== credentialId);
    await route.fulfill({ status: 204 });
    return;
  }

  if (path === "/workflows" && method === "GET") {
    await json(route, {
      workflows: state.workflowDetail ? [state.workflowDetail.workflow] : []
    });
    return;
  }

  if (path === "/workflows" && method === "POST") {
    const body = request.postDataJSON() as {
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
      definition: WorkflowVersionResponse["definition"];
    };
    const version = createVersion(body.definition, body.inputSchema, "draft");
    const workflow = createWorkflowRecord(body.name, body.description ?? null);
    state.workflowDetail = { workflow, versions: [version] };
    await json(route, state.workflowDetail, 201);
    return;
  }

  if (path === `/workflows/${workflowId}` && method === "GET") {
    await json(route, state.workflowDetail ?? { code: "NOT_FOUND", message: "Workflow not found" }, state.workflowDetail ? 200 : 404);
    return;
  }

  if (path === `/workflows/${workflowId}/versions` && method === "POST") {
    if (!state.workflowDetail) {
      await json(route, { code: "NOT_FOUND", message: "Workflow not found" }, 404);
      return;
    }

    const body = request.postDataJSON() as {
      inputSchema: Record<string, unknown>;
      definition: WorkflowVersionResponse["definition"];
    };
    state.workflowDetail.versions = state.workflowDetail.versions.map((version) =>
      version.status === "draft"
        ? { ...version, status: "retired", retiredAt: now }
        : version
    );
    const version = createVersion(
      body.definition,
      body.inputSchema,
      "draft",
      state.workflowDetail.versions.length + 1
    );
    state.workflowDetail.versions.unshift(version);
    state.workflowDetail.workflow.updatedAt = now;
    await json(route, state.workflowDetail, 201);
    return;
  }

  if (path === `/workflows/${workflowId}/publish` && method === "POST") {
    if (!state.workflowDetail) {
      await json(route, { code: "NOT_FOUND", message: "Workflow not found" }, 404);
      return;
    }

    const draft = state.workflowDetail.versions.find((version) => version.status === "draft");

    if (!draft) {
      await json(route, { code: "NO_DRAFT_VERSION", message: "No draft version" }, 409);
      return;
    }

    state.workflowDetail.versions = state.workflowDetail.versions.map((version) => {
      if (version.id === draft.id) {
        return { ...version, status: "published", publishedAt: now };
      }

      if (version.status === "published") {
        return { ...version, status: "retired", retiredAt: now };
      }

      return version;
    });
    state.workflowDetail.workflow = {
      ...state.workflowDetail.workflow,
      status: "published",
      activeVersionId: draft.id,
      activeVersionNo: draft.versionNo,
      updatedAt: now
    };
    await json(route, state.workflowDetail);
    return;
  }

  if (path === `/workflows/${workflowId}/executions` && method === "POST") {
    if (!state.workflowDetail?.workflow.activeVersionId) {
      await json(route, { code: "NO_ACTIVE_VERSION", message: "No active version" }, 409);
      return;
    }

    const body = request.postDataJSON() as { input: Record<string, unknown> };
    const activeVersion = state.workflowDetail.versions.find(
      (version) => version.id === state.workflowDetail?.workflow.activeVersionId
    )!;
    state.executionDetail = createQueuedExecution(activeVersion, body.input);
    state.executionReads = 0;
    await json(route, state.executionDetail, 202);
    return;
  }

  if (path === `/workflows/${workflowId}/executions` && method === "GET") {
    const status = url.searchParams.get("status");
    const executions = state.executionDetail ? [state.executionDetail.execution] : [];
    await json(route, {
      executions: status
        ? executions.filter((execution) => execution.status === status)
        : executions,
      nextCursor: null
    });
    return;
  }

  if (path === `/executions/${executionId}` && method === "GET") {
    if (!state.executionDetail) {
      await json(route, { code: "NOT_FOUND", message: "Execution not found" }, 404);
      return;
    }

    state.executionReads += 1;

    if (state.executionReads >= 2 && state.executionDetail.execution.status !== "cancelled") {
      state.executionDetail = completeExecution(state.executionDetail);
    }

    await json(route, state.executionDetail);
    return;
  }

  if (path === `/executions/${executionId}/cancel` && method === "POST") {
    if (!state.executionDetail) {
      await json(route, { code: "NOT_FOUND", message: "Execution not found" }, 404);
      return;
    }

    state.executionDetail = {
      ...state.executionDetail,
      execution: { ...state.executionDetail.execution, status: "cancelled", endedAt: now },
      steps: state.executionDetail.steps.map((step) => ({ ...step, status: "cancelled" }))
    };
    await json(route, state.executionDetail);
    return;
  }

  await json(route, { code: "MOCK_ROUTE_NOT_FOUND", message: `${method} ${path}` }, 404);
}

function createSeedWorkflow(): WorkflowDetailResponse {
  const definition: WorkflowVersionResponse["definition"] = {
    steps: [
      {
        key: "check-api",
        name: "Check API",
        type: "http",
        config: {
          method: "GET",
          url: "https://example.com",
          headers: {},
          timeoutMs: 10_000
        },
        retry: { maxAttempts: 2, backoffMs: 1_000 }
      },
      {
        key: "record-success",
        name: "Record success",
        type: "noop",
        config: {},
        retry: { maxAttempts: 1, backoffMs: 0 }
      }
    ],
    layout: {
      positions: {
        "check-api": { x: 360, y: 220 },
        "record-success": { x: 680, y: 220 }
      }
    }
  };
  const version = createVersion(definition, {}, "published");

  return {
    workflow: {
      ...createWorkflowRecord("API health monitor", "Checks a public endpoint."),
      status: "published",
      activeVersionId: version.id,
      activeVersionNo: version.versionNo
    },
    versions: [version]
  };
}

function createWorkflowRecord(name: string, description: string | null): WorkflowResponse {
  return {
    id: workflowId,
    ownerId,
    name,
    description,
    status: "draft",
    activeVersionId: null,
    activeVersionNo: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };
}

function createVersion(
  definition: WorkflowVersionResponse["definition"],
  inputSchema: Record<string, unknown>,
  status: WorkflowVersionResponse["status"],
  versionNo = 1
): WorkflowVersionResponse {
  return {
    id: versionNo === 1 ? versionId : `33333333-3333-4333-8333-${String(versionNo).padStart(12, "0")}`,
    workflowId,
    versionNo,
    status,
    inputSchema,
    definition,
    createdAt: now,
    publishedAt: status === "published" ? now : null,
    retiredAt: status === "retired" ? now : null
  };
}

function createQueuedExecution(
  version: WorkflowVersionResponse,
  input: Record<string, unknown>
): ExecutionDetailResponse {
  const execution: ExecutionResponse = {
    id: executionId,
    workflowVersionId: version.id,
    status: "queued",
    triggerType: "manual",
    input,
    output: null,
    error: null,
    createdAt: now,
    queuedAt: now,
    startedAt: null,
    endedAt: null
  };

  return {
    execution,
    steps: version.definition.steps.map((step, index) => ({
      id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
      executionId,
      stepKey: step.key,
      status: "queued",
      attemptCount: 0,
      input: null,
      output: null,
      error: null,
      createdAt: now,
      queuedAt: now,
      startedAt: null,
      endedAt: null
    })),
    events: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        executionId,
        sequenceNo: 1,
        type: "execution.queued",
        payload: {},
        createdAt: now
      }
    ]
  };
}

function completeExecution(detail: ExecutionDetailResponse): ExecutionDetailResponse {
  if (detail.execution.status === "succeeded") {
    return detail;
  }

  return {
    execution: {
      ...detail.execution,
      status: "succeeded",
      output: { completed: true },
      startedAt: now,
      endedAt: "2026-08-21T13:30:02.000Z"
    },
    steps: detail.steps.map((step) => ({
      ...step,
      status: "succeeded",
      attemptCount: 1,
      input: detail.execution.input,
      output: { ok: true },
      startedAt: now,
      endedAt: "2026-08-21T13:30:02.000Z"
    })),
    events: [
      ...detail.events,
      {
        id: "77777777-7777-4777-8777-777777777777",
        executionId,
        sequenceNo: 2,
        type: "execution.succeeded",
        payload: { completed: true },
        createdAt: "2026-08-21T13:30:02.000Z"
      }
    ]
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
  });
}
