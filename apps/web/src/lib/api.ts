import type {
  AuthResponse,
  CreateWorkflowRequest,
  CurrentUserResponse,
  ExecutionDetailResponse,
  ExecutionListResponse,
  ExecutionStatus,
  TriggerExecutionRequest,
  WorkflowDetailResponse,
  WorkflowResponse
} from "@execloom/contracts";

const apiBasePath = "/api/backend";

export type ApiSession = {
  accessToken: string;
  user: AuthResponse["user"];
};

export type WorkflowListResponse = {
  workflows: WorkflowResponse[];
};

type ApiErrorBody = {
  code?: string;
  message?: string;
};

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export async function register(email: string, password: string): Promise<ApiSession> {
  return authRequest("/auth/register", email, password);
}

export async function login(email: string, password: string): Promise<ApiSession> {
  return authRequest("/auth/login", email, password);
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return apiRequest<CurrentUserResponse>("/auth/me", {
    accessToken
  });
}

export async function listWorkflows(accessToken: string): Promise<WorkflowListResponse> {
  return apiRequest<WorkflowListResponse>("/workflows", {
    accessToken
  });
}

export async function getWorkflow(
  accessToken: string,
  workflowId: string
): Promise<WorkflowDetailResponse> {
  return apiRequest<WorkflowDetailResponse>(`/workflows/${workflowId}`, {
    accessToken
  });
}

export async function createWorkflow(
  accessToken: string,
  input: CreateWorkflowRequest
): Promise<WorkflowDetailResponse> {
  return apiRequest<WorkflowDetailResponse>("/workflows", {
    accessToken,
    method: "POST",
    body: input
  });
}

export async function publishWorkflow(
  accessToken: string,
  workflowId: string
): Promise<WorkflowDetailResponse> {
  return apiRequest<WorkflowDetailResponse>(`/workflows/${workflowId}/publish`, {
    accessToken,
    method: "POST"
  });
}

export async function triggerWorkflow(
  accessToken: string,
  workflowId: string,
  input: TriggerExecutionRequest
): Promise<ExecutionDetailResponse> {
  return apiRequest<ExecutionDetailResponse>(`/workflows/${workflowId}/executions`, {
    accessToken,
    method: "POST",
    body: input
  });
}

export async function listWorkflowExecutions(
  accessToken: string,
  workflowId: string,
  input: {
    status?: ExecutionStatus;
    cursor?: string;
  } = {}
): Promise<ExecutionListResponse> {
  const params = new URLSearchParams({
    limit: "20"
  });

  if (input.status) {
    params.set("status", input.status);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  return apiRequest<ExecutionListResponse>(
    `/workflows/${workflowId}/executions?${params.toString()}`,
    {
      accessToken
    }
  );
}

export async function getExecution(
  accessToken: string,
  executionId: string
): Promise<ExecutionDetailResponse> {
  return apiRequest<ExecutionDetailResponse>(`/executions/${executionId}`, {
    accessToken
  });
}

export async function cancelExecution(
  accessToken: string,
  executionId: string
): Promise<ExecutionDetailResponse> {
  return apiRequest<ExecutionDetailResponse>(`/executions/${executionId}/cancel`, {
    accessToken,
    method: "POST"
  });
}

async function authRequest(
  path: "/auth/register" | "/auth/login",
  email: string,
  password: string
): Promise<ApiSession> {
  const auth = await apiRequest<AuthResponse>(path, {
    method: "POST",
    body: {
      email,
      password
    }
  });

  return {
    accessToken: auth.accessToken,
    user: auth.user
  };
}

async function apiRequest<T>(
  path: string,
  options: {
    accessToken?: string;
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const response = await fetch(`${apiBasePath}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    let errorBody: ApiErrorBody = {};

    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      errorBody = {};
    }

    throw new ApiError(
      response.status,
      errorBody.code ?? "REQUEST_FAILED",
      errorBody.message ?? "Request failed"
    );
  }

  return response.json() as Promise<T>;
}
