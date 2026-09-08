import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError
} from "openai";

import { isSafeHttpStepUrl } from "@execloom/contracts";
import type { WorkflowStepDefinitionRecord } from "@execloom/db";
import {
  resolveWorkflowTemplate,
  stepExecutionResultVersion,
  validateStructuredOutput,
  validateStructuredOutputSchema,
  WorkflowExpressionError,
  type StepExecutionResult,
  type WorkflowExpressionContext
} from "@execloom/workflow-core";

export type StepExecutionInput = {
  step: WorkflowStepDefinitionRecord;
  executionInput: unknown;
  stepInput: unknown;
  expressionContext?: WorkflowExpressionContext;
  credential?: ResolvedStepCredential;
};

export type ResolvedStepCredential = {
  type: "api_key" | "bearer_token";
  headerName: string | null;
  secret: string;
};

type OpenAIResponseResult = {
  id: string;
  model: string;
  status?: string;
  output_text: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  } | null;
};

export type OpenAIResponsesClient = {
  create: (input: {
    model: string;
    instructions: string;
    input: string;
    max_output_tokens: number;
    store: false;
    text: {
      format: {
        type: "json_schema";
        name: string;
        schema: Record<string, unknown>;
        strict: true;
      };
    };
  }) => Promise<OpenAIResponseResult>;
};

export type StepExecutionDependencies = {
  createOpenAIClient?: (
    credential: ResolvedStepCredential,
    timeoutMs: number
  ) => OpenAIResponsesClient;
};

export class StepExecutionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "StepExecutionError";
  }
}

export async function executeWorkflowStep(
  input: StepExecutionInput,
  dependencies: StepExecutionDependencies = {}
): Promise<StepExecutionResult> {
  const startedAt = performance.now();

  try {
    switch (input.step.type) {
      case "noop":
        return createResult(input.step.type, input.stepInput, startedAt);

      case "delay":
        return executeDelayStep(input, startedAt);

      case "http":
        return executeHttpStep(input, startedAt);

      case "ai":
        return executeAiStep(input, dependencies, startedAt);

      default:
        throw new StepExecutionError(
          `Unsupported workflow step type: ${input.step.type}`,
          "STEP_TYPE_UNSUPPORTED",
          false
        );
    }
  } catch (error) {
    if (error instanceof StepExecutionError) {
      throw error;
    }

    if (error instanceof WorkflowExpressionError) {
      throw new StepExecutionError(error.message, "EXPRESSION_RESOLUTION_FAILED", false);
    }

    throw error;
  }
}

export function isRetryableStepExecutionError(error: unknown): boolean {
  return error instanceof StepExecutionError && error.retryable;
}

async function executeDelayStep(
  input: StepExecutionInput,
  startedAt: number
): Promise<StepExecutionResult> {
  const ms = getDelayMs(input.step.config);
  await sleep(ms);

  return createResult(input.step.type, input.stepInput, startedAt, {
    delayedForMs: ms
  });
}

function getDelayMs(config: Record<string, unknown>): number {
  const rawMs = config.ms;

  if (rawMs === undefined) {
    return 1_000;
  }

  if (typeof rawMs !== "number" || !Number.isInteger(rawMs) || rawMs < 0 || rawMs > 30_000) {
    throw new StepExecutionError(
      "Delay step config.ms must be an integer between 0 and 30000",
      "DELAY_CONFIG_INVALID",
      false
    );
  }

  return rawMs;
}

async function executeHttpStep(
  input: StepExecutionInput,
  startedAt: number
): Promise<StepExecutionResult> {
  const config = getHttpConfig(
    input.step.config,
    getExpressionContext(input),
    input.credential
  );
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
  } catch {
    if (abortController.signal.aborted) {
      throw new StepExecutionError(
        `HTTP step timed out after ${config.timeoutMs}ms`,
        "HTTP_TIMEOUT",
        true
      );
    }

    throw new StepExecutionError(
      "HTTP step could not reach the remote service",
      "HTTP_CONNECTION_FAILED",
      true
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseBody = await readResponseBody(response);

  if (!response.ok) {
    throw new StepExecutionError(
      `HTTP step failed with status ${response.status}`,
      "HTTP_RESPONSE_FAILED",
      isTransientHttpStatus(response.status)
    );
  }

  return createResult(input.step.type, responseBody, startedAt, {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries())
  });
}

function getHttpConfig(
  config: Record<string, unknown>,
  context: WorkflowExpressionContext,
  credential?: ResolvedStepCredential
) {
  const url = resolveWorkflowTemplate(config.url, context);
  const method = config.method ?? "GET";
  const headers = resolveHttpHeaders(config.headers ?? {}, context);
  const body = resolveWorkflowTemplate(config.body, context);

  if (typeof url !== "string" || url.length === 0) {
    throw new StepExecutionError(
      "HTTP step URL must resolve to a non-empty string",
      "HTTP_URL_INVALID",
      false
    );
  }

  if (!isSafeHttpStepUrl(url)) {
    throw new StepExecutionError(
      "HTTP step URL must resolve to an http or https URL outside local and private networks",
      "HTTP_URL_UNSAFE",
      false
    );
  }

  if (typeof method !== "string" || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new StepExecutionError(
      "HTTP step method is invalid",
      "HTTP_METHOD_INVALID",
      false
    );
  }

  const requestHeaders = new Headers({
    "content-type": "application/json"
  });

  for (const [name, value] of Object.entries(headers)) {
    requestHeaders.set(name, value);
  }

  if (credential?.type === "api_key") {
    if (!credential.headerName) {
      throw new StepExecutionError(
        "API key credential does not have a header name",
        "HTTP_CREDENTIAL_INVALID",
        false
      );
    }

    requestHeaders.set(credential.headerName, credential.secret);
  } else if (credential?.type === "bearer_token") {
    requestHeaders.set("authorization", `Bearer ${credential.secret}`);
  }

  return {
    url,
    method,
    headers: Object.fromEntries(requestHeaders.entries()),
    body,
    timeoutMs: getIntegerConfig(config.timeoutMs, 10_000, 1, 60_000, "HTTP timeout")
  };
}

function resolveHttpHeaders(
  headers: unknown,
  context: WorkflowExpressionContext
): Record<string, string> {
  if (!isPlainObject(headers)) {
    throw new StepExecutionError(
      "HTTP step headers must be an object",
      "HTTP_HEADERS_INVALID",
      false
    );
  }

  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => {
      const resolved = resolveWorkflowTemplate(value, context);

      if (
        typeof resolved !== "string" &&
        typeof resolved !== "number" &&
        typeof resolved !== "boolean"
      ) {
        throw new StepExecutionError(
          `HTTP header "${name}" must resolve to a string, number, or boolean`,
          "HTTP_HEADERS_INVALID",
          false
        );
      }

      return [name, String(resolved)];
    })
  );
}

async function executeAiStep(
  input: StepExecutionInput,
  dependencies: StepExecutionDependencies,
  startedAt: number
): Promise<StepExecutionResult> {
  const config = getAiConfig(input.step, getExpressionContext(input));

  if (!input.credential || input.credential.type !== "bearer_token") {
    throw new StepExecutionError(
      "AI step requires an available Bearer Token credential",
      "AI_CREDENTIAL_INVALID",
      false
    );
  }

  const schemaResult = validateStructuredOutputSchema(config.outputSchema);

  if (!schemaResult.valid) {
    throw new StepExecutionError(
      `AI output schema is invalid: ${schemaResult.errors.join("; ")}`,
      "AI_OUTPUT_SCHEMA_INVALID",
      false
    );
  }

  const client = (dependencies.createOpenAIClient ?? createOpenAIClient)(
    input.credential,
    config.timeoutMs
  );
  let response: OpenAIResponseResult;

  try {
    response = await client.create({
      model: config.model,
      instructions: config.systemPrompt,
      input: config.userPrompt,
      max_output_tokens: config.maxOutputTokens,
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: createOutputSchemaName(input.step.key),
          schema: config.outputSchema,
          strict: true
        }
      }
    });
  } catch (error) {
    throw toOpenAIExecutionError(error);
  }

  if (response.status && response.status !== "completed") {
    throw new StepExecutionError(
      `OpenAI response ended with status ${response.status}`,
      "AI_RESPONSE_INCOMPLETE",
      false
    );
  }

  let output: unknown;

  try {
    output = JSON.parse(response.output_text);
  } catch {
    throw new StepExecutionError(
      "OpenAI response did not contain valid structured JSON",
      "AI_OUTPUT_INVALID",
      false
    );
  }

  const outputValidation = validateStructuredOutput(config.outputSchema, output);

  if (!outputValidation.valid) {
    throw new StepExecutionError(
      `OpenAI response failed output validation: ${outputValidation.errors.join("; ")}`,
      "AI_OUTPUT_INVALID",
      false
    );
  }

  return createResult(input.step.type, output, startedAt, {
    provider: "openai",
    responseId: response.id,
    model: response.model,
    inputTokens: response.usage?.input_tokens ?? null,
    outputTokens: response.usage?.output_tokens ?? null,
    totalTokens: response.usage?.total_tokens ?? null
  });
}

function getAiConfig(
  step: WorkflowStepDefinitionRecord,
  context: WorkflowExpressionContext
) {
  const model = step.config.model;
  const systemPrompt = resolveWorkflowTemplate(step.config.systemPrompt ?? "", context);
  const userPrompt = resolveWorkflowTemplate(step.config.userPrompt, context);
  const outputSchema = step.config.outputSchema;

  if (typeof model !== "string" || model.trim().length === 0 || model.length > 200) {
    throw new StepExecutionError("AI step model is invalid", "AI_CONFIG_INVALID", false);
  }

  if (typeof systemPrompt !== "string" || typeof userPrompt !== "string" || !userPrompt) {
    throw new StepExecutionError(
      "AI prompts must resolve to strings and the user prompt cannot be empty",
      "AI_PROMPT_INVALID",
      false
    );
  }

  if (!isPlainObject(outputSchema)) {
    throw new StepExecutionError(
      "AI output schema must be an object",
      "AI_OUTPUT_SCHEMA_INVALID",
      false
    );
  }

  return {
    model: model.trim(),
    systemPrompt,
    userPrompt,
    outputSchema,
    timeoutMs: getIntegerConfig(step.config.timeoutMs, 60_000, 1, 240_000, "AI timeout"),
    maxOutputTokens: getIntegerConfig(
      step.config.maxOutputTokens,
      2_000,
      1,
      32_000,
      "AI max output tokens"
    )
  };
}

function createOpenAIClient(
  credential: ResolvedStepCredential,
  timeoutMs: number
): OpenAIResponsesClient {
  const client = new OpenAI({
    apiKey: credential.secret,
    maxRetries: 0,
    timeout: timeoutMs
  });

  return client.responses;
}

function toOpenAIExecutionError(error: unknown): StepExecutionError {
  if (error instanceof APIConnectionTimeoutError) {
    return new StepExecutionError("OpenAI request timed out", "AI_TIMEOUT", true);
  }

  if (error instanceof APIConnectionError) {
    return new StepExecutionError(
      "OpenAI could not be reached",
      "AI_CONNECTION_FAILED",
      true
    );
  }

  if (error instanceof APIError) {
    const status = error.status;
    return new StepExecutionError(
      status ? `OpenAI request failed with status ${status}` : "OpenAI request failed",
      "AI_REQUEST_FAILED",
      status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500)
    );
  }

  return new StepExecutionError("OpenAI request failed", "AI_REQUEST_FAILED", false);
}

function createResult(
  stepType: string,
  output: unknown,
  startedAt: number,
  metadata: Record<string, unknown> = {}
): StepExecutionResult {
  return {
    output,
    metadata: {
      resultVersion: stepExecutionResultVersion,
      stepType,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...metadata
    }
  };
}

function getExpressionContext(input: StepExecutionInput): WorkflowExpressionContext {
  return input.expressionContext ?? {
    trigger: input.executionInput,
    steps: {}
  };
}

function createOutputSchemaName(stepKey: string): string {
  const normalized = stepKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
  return `${normalized || "ai_step"}_output`;
}

function getIntegerConfig(
  value: unknown,
  defaultValue: number,
  minimum: number,
  maximum: number,
  label: string
): number {
  const resolved = value ?? defaultValue;

  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new StepExecutionError(
      `${label} must be an integer between ${minimum} and ${maximum}`,
      "STEP_CONFIG_INVALID",
      false
    );
  }

  return resolved;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
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
