import {
  createWorkflowRequestSchema,
  triggerExecutionRequestSchema,
  type CreateWorkflowRequest,
  type TriggerExecutionRequest
} from "@execloom/contracts";

export type WorkflowTemplate = {
  label: string;
  description: string;
  definition: CreateWorkflowRequest["definition"];
  executionInput: TriggerExecutionRequest["input"];
};

const defaultWorkflowInputSchema: Record<string, unknown> = {};

export const workflowTemplates: WorkflowTemplate[] = [
  {
    label: "Noop + Delay",
    description: "Two simple local steps for testing the worker pipeline.",
    definition: {
      steps: [
        {
          key: "start",
          type: "noop",
          config: {},
          retry: {
            maxAttempts: 1,
            backoffMs: 0
          }
        },
        {
          key: "wait",
          type: "delay",
          config: {
            ms: 1000
          },
          retry: {
            maxAttempts: 1,
            backoffMs: 0
          }
        }
      ]
    },
    executionInput: {
      source: "web"
    }
  },
  {
    label: "HTTP GET",
    description: "One outbound HTTP step with timeout and retry metadata.",
    definition: {
      steps: [
        {
          key: "fetch-example",
          type: "http",
          config: {
            url: "https://example.com",
            method: "GET",
            headers: {},
            timeoutMs: 5000
          },
          retry: {
            maxAttempts: 2,
            backoffMs: 1000
          }
        }
      ]
    },
    executionInput: {
      source: "web",
      requestId: "manual-test"
    }
  }
];

export const defaultWorkflowTemplate = workflowTemplates[0]!;
export const defaultWorkflowInputSchemaText = formatJson(defaultWorkflowInputSchema);
export const defaultWorkflowDefinitionText = formatJson(defaultWorkflowTemplate.definition);
export const defaultExecutionInputText = formatJson(defaultWorkflowTemplate.executionInput);

export function buildCreateWorkflowRequest(input: {
  name: string;
  description: string;
  inputSchemaText: string;
  definitionText: string;
}): CreateWorkflowRequest {
  const candidate = {
    name: input.name,
    description: input.description || undefined,
    inputSchema: parseJsonObject(input.inputSchemaText, "Input schema"),
    definition: parseJsonObject(input.definitionText, "Definition")
  };
  const result = createWorkflowRequestSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(formatValidationIssues("Workflow", result.error.issues));
  }

  return result.data;
}

export function buildTriggerExecutionRequest(inputText: string): TriggerExecutionRequest {
  const candidate = {
    input: parseJsonObject(inputText, "Execution input")
  };
  const result = triggerExecutionRequestSchema.safeParse(candidate);

  if (!result.success) {
    throw new Error(formatValidationIssues("Execution input", result.error.issues));
  }

  return result.data;
}

export function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

export function parseJsonObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }

  if (!isJsonObject(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed;
}

function formatValidationIssues(
  label: string,
  issues: Array<{
    path: readonly unknown[];
    message: string;
  }>
) {
  const details = issues
    .slice(0, 4)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : label;

      return `${path}: ${issue.message}`;
    })
    .join("; ");

  return details ? `${label} is invalid: ${details}` : `${label} is invalid`;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
