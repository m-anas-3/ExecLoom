# Workflow Data And Structured AI

ExecLoom maps execution input and prior step results into later steps through a small, strict expression language. The same runtime result contract supports HTTP responses and structured AI output without changing the linear scheduler.

## Expression Context

Every claimed step receives this logical context:

```ts
{
  trigger: execution.inputJson,
  steps: {
    "step-key": {
      output: unknown,
      metadata: Record<string, unknown>
    }
  }
}
```

Supported references include:

```text
{{ trigger.customerId }}
{{ steps.fetch-customer.output.email }}
{{ steps.analyze.output.score }}
{{ steps.fetch-customer.metadata.status }}
```

HTTP URL strings, HTTP header values, recursive HTTP body values, and AI prompts support expressions. A whole-value expression preserves its JSON type, so an object, array, number, boolean, or null can flow into an HTTP body. Interpolation inside a larger string accepts scalar values only.

Expressions are parsed as property paths and never evaluated as JavaScript. Missing paths, malformed syntax, unsafe prototype path segments, current-step references, and future-step references fail validation or execution. This keeps behavior deterministic and avoids exposing an `eval` boundary.

## Result Contract

New step runs store a versioned result envelope:

```json
{
  "output": {},
  "metadata": {
    "resultVersion": 1,
    "stepType": "http",
    "durationMs": 42
  }
}
```

`output` is business data and becomes the next step's input. `metadata` contains operational details such as HTTP status or AI token usage. The final execution output is the final step's business output. Historical step rows without the envelope are normalized as legacy output when expressions or the execution detail UI read them.

The envelope lives in the existing JSONB column, so this feature does not require a database migration.

## Structured OpenAI Step

The AI step uses the official OpenAI SDK and the Responses API:

1. The API verifies that the referenced credential belongs to the workflow owner and is a Bearer-token credential.
2. The worker resolves prompt expressions from the execution context.
3. The worker validates the configured JSON Schema locally.
4. The provider request uses strict JSON Schema output and disables provider-side response storage.
5. The worker parses and validates the returned JSON again before marking the step successful.
6. The result metadata records provider, response ID, model, token usage, and duration without including the secret.

The OpenAI SDK's automatic retry is disabled. ExecLoom owns retries through durable step state and the transactional outbox, which avoids multiplying SDK retries by workflow retries. Connection failures, timeouts, HTTP 408, 409, 429, and 5xx responses are retryable. Configuration, expression, credential, and output-validation errors are permanent.

## Main Code Paths

| Concern | Location |
| --- | --- |
| Step contracts | `packages/contracts/src/index.ts` |
| Expression parser and resolver | `packages/workflow-core/src/expressions.ts` |
| Definition semantic validation | `packages/workflow-core/src/workflow-validation.ts` |
| JSON Schema validation | `packages/workflow-core/src/json-schema.ts` |
| Result envelope compatibility | `packages/workflow-core/src/results.ts` |
| Prior result loading and step transitions | `packages/db/src/repositories/executions.ts` |
| HTTP and OpenAI execution | `apps/worker/src/executors.ts` |
| Editor configuration | `apps/web/src/components/workflow-editor/workflow-inspector.tsx` |

## Current Boundaries

- Expressions support data lookup, not functions, arithmetic, conditionals, or arbitrary code.
- HTTP header values support expressions; header names do not.
- A step can reference only the trigger and earlier successful steps in the linear chain.
- The first AI provider integration is OpenAI. Provider-neutral abstractions can be introduced when a second provider creates a real shared requirement.
- Structured output requires an object-root JSON Schema compatible with strict provider output.

## Interview Explanation

Expressions are a deliberately small data-mapping layer, not a scripting language. Static validation catches references that cannot exist in the ordered workflow, while runtime resolution catches missing values in a particular execution. Results separate business output from operational metadata so later steps consume stable data without losing observability. OpenAI output is constrained and validated at both the provider and worker boundaries. Workflow-owned retries remain the single retry policy, and encrypted credentials are resolved only inside the worker.
