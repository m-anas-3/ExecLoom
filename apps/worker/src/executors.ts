import type { WorkflowStepDefinitionRecord } from "@execloom/db";

export type StepExecutionInput = {
  step: WorkflowStepDefinitionRecord;
  executionInput: unknown;
  stepInput: unknown;
};

export async function executeWorkflowStep(input: StepExecutionInput): Promise<unknown> {
  switch (input.step.type) {
    case "noop":
      return {
        type: "noop",
        completed: true,
        input: input.stepInput
      };

    case "delay":
      return executeDelayStep(input.step);

    case "http":
      return executeHttpStep(input.step);

    default:
      throw new Error(`Unsupported workflow step type: ${input.step.type}`);
  }
}

async function executeDelayStep(step: WorkflowStepDefinitionRecord): Promise<unknown> {
  const ms = getDelayMs(step.config);

  await sleep(ms);

  return {
    type: "delay",
    completed: true,
    delayedForMs: ms
  };
}

function getDelayMs(config: Record<string, unknown>): number {
  const rawMs = config.ms;

  if (rawMs === undefined) {
    return 1_000;
  }

  if (typeof rawMs !== "number" || !Number.isInteger(rawMs) || rawMs < 0 || rawMs > 30_000) {
    throw new Error("Delay step config.ms must be an integer between 0 and 30000");
  }

  return rawMs;
}

async function executeHttpStep(step: WorkflowStepDefinitionRecord): Promise<unknown> {
  const config = getHttpConfig(step.config);
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, config.timeoutMs);

  let response: Response;

  try {
    response = await fetch(config.url, {
      method: config.method,
      headers: config.headers,
      body: config.body === undefined ? undefined : JSON.stringify(config.body),
      signal: abortController.signal
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(`HTTP step timed out after ${config.timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new Error(`HTTP step failed with status ${response.status}`);
  }

  return {
    type: "http",
    completed: true,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody
  };
}

function getHttpConfig(config: Record<string, unknown>) {
  const url = config.url;
  const method = config.method ?? "GET";
  const headers = config.headers ?? {};

  if (typeof url !== "string" || url.length === 0) {
    throw new Error("HTTP step config.url must be a non-empty string");
  }

  if (!isAllowedHttpUrl(url)) {
    throw new Error("HTTP step config.url must use http or https");
  }

  if (typeof method !== "string" || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error("HTTP step config.method must be one of GET, POST, PUT, PATCH, DELETE");
  }

  if (!isStringRecord(headers)) {
    throw new Error("HTTP step config.headers must be an object with string values");
  }

  return {
    url,
    method,
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: config.body,
    timeoutMs: getHttpTimeoutMs(config)
  };
}

function getHttpTimeoutMs(config: Record<string, unknown>): number {
  const rawTimeoutMs = config.timeoutMs;

  if (rawTimeoutMs === undefined) {
    return 10_000;
  }

  if (
    typeof rawTimeoutMs !== "number" ||
    !Number.isInteger(rawTimeoutMs) ||
    rawTimeoutMs < 1 ||
    rawTimeoutMs > 60_000
  ) {
    throw new Error("HTTP step config.timeoutMs must be an integer between 1 and 60000");
  }

  return rawTimeoutMs;
}

function isAllowedHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
