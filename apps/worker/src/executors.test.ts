import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APIConnectionTimeoutError } from "openai";

import type { WorkflowStepDefinitionRecord } from "@execloom/db";

import {
  executeWorkflowStep,
  isRetryableStepExecutionError,
  type OpenAIResponsesClient
} from "./executors.js";

describe("executeWorkflowStep", () => {
  it("executes noop steps with the provided step input", async () => {
    const step = createStep({
      type: "noop"
    });
    const stepInput = {
      customerId: "customer_123"
    };

    const output = await executeWorkflowStep({
      step,
      executionInput: {},
      stepInput
    });

    assert.deepEqual(output.output, stepInput);
    assert.equal(output.metadata.resultVersion, 1);
    assert.equal(output.metadata.stepType, "noop");
  });

  it("executes delay steps with explicit milliseconds", async () => {
    const step = createStep({
      type: "delay",
      config: {
        ms: 0
      }
    });

    const output = await executeWorkflowStep({
      step,
      executionInput: {},
      stepInput: {}
    });

    assert.deepEqual(output.output, {});
    assert.equal(output.metadata.stepType, "delay");
    assert.equal(output.metadata.delayedForMs, 0);
  });

  it("rejects invalid delay config", async () => {
    const step = createStep({
      type: "delay",
      config: {
        ms: -1
      }
    });

    await assert.rejects(
      executeWorkflowStep({
        step,
        executionInput: {},
        stepInput: {}
      }),
      /Delay step config\.ms/
    );
  });

  it("executes http steps", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    globalThis.fetch = async (url, init) => {
      requests.push({
        url: String(url),
        init
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "content-type": "application/json",
          "x-request-id": "request_123"
        }
      });
    };

    try {
      const output = await executeWorkflowStep({
        step: createStep({
          type: "http",
          config: {
            url: "https://api.example.com/tasks",
            method: "POST",
            headers: {
              authorization: "Bearer test-token"
            },
            body: {
              taskId: "task_123"
            },
            timeoutMs: 5_000
          }
        }),
        executionInput: {},
        stepInput: {}
      });

      assert.deepEqual(requests, [
        {
          url: "https://api.example.com/tasks",
          init: {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer test-token"
            },
            body: JSON.stringify({
              taskId: "task_123"
            }),
            signal: requests[0]?.init?.signal
          }
        }
      ]);
      assert.deepEqual(output.output, { ok: true });
      assert.equal(output.metadata.stepType, "http");
      assert.equal(output.metadata.status, 201);
      assert.deepEqual(output.metadata.headers, {
        "content-type": "application/json",
        "x-request-id": "request_123"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("injects API key credentials after manual headers", async () => {
    const originalFetch = globalThis.fetch;
    let requestHeaders: RequestInit["headers"];

    globalThis.fetch = async (_url, init) => {
      requestHeaders = init?.headers;
      return new Response(null, { status: 204 });
    };

    try {
      await executeWorkflowStep({
        step: createStep({
          type: "http",
          config: {
            url: "https://api.example.com/tasks",
            headers: {
              "X-API-Key": "manual-value"
            },
            credentialId: "11111111-1111-4111-8111-111111111111"
          }
        }),
        executionInput: {},
        stepInput: {},
        credential: {
          type: "api_key",
          headerName: "x-api-key",
          secret: "credential-value"
        }
      });

      assert.equal(new Headers(requestHeaders).get("x-api-key"), "credential-value");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("injects Bearer credentials without returning the secret", async () => {
    const originalFetch = globalThis.fetch;
    let requestHeaders: RequestInit["headers"];

    globalThis.fetch = async (_url, init) => {
      requestHeaders = init?.headers;
      return Response.json({ ok: true });
    };

    try {
      const output = await executeWorkflowStep({
        step: createStep({
          type: "http",
          config: {
            url: "https://api.example.com/tasks",
            headers: {
              Authorization: "Bearer manual-value"
            },
            credentialId: "11111111-1111-4111-8111-111111111111"
          }
        }),
        executionInput: {},
        stepInput: {},
        credential: {
          type: "bearer_token",
          headerName: null,
          secret: "credential-value"
        }
      });

      assert.equal(
        new Headers(requestHeaders).get("authorization"),
        "Bearer credential-value"
      );
      assert.equal(JSON.stringify(output).includes("credential-value"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("times out slow http steps", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });

    try {
      await assert.rejects(
        executeWorkflowStep({
          step: createStep({
            type: "http",
            config: {
              url: "https://api.example.com/slow",
              timeoutMs: 1
            }
          }),
          executionInput: {},
          stepInput: {}
        }),
        /HTTP step timed out after 1ms/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects invalid http timeout config", async () => {
    await assert.rejects(
      executeWorkflowStep({
        step: createStep({
          type: "http",
          config: {
            url: "https://api.example.com/tasks",
            timeoutMs: 0
          }
        }),
        executionInput: {},
        stepInput: {}
      }),
      /HTTP timeout must be an integer/
    );
  });

  it("rejects failed http responses", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () =>
      new Response("server error", {
        status: 500
      });

    try {
      await assert.rejects(
        executeWorkflowStep({
          step: createStep({
            type: "http",
            config: {
              url: "https://api.example.com/fail"
            }
          }),
          executionInput: {},
          stepInput: {}
        }),
        /HTTP step failed with status 500/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects invalid http config", async () => {
    await assert.rejects(
      executeWorkflowStep({
        step: createStep({
          type: "http",
          config: {
            url: "ftp://api.example.com/tasks"
          }
        }),
        executionInput: {},
        stepInput: {}
      }),
      /HTTP step URL must resolve/
    );
  });

  it("rejects http steps targeting local or private network hosts", async () => {
    const blockedUrls = [
      "http://localhost:4000/tasks",
      "http://127.0.0.1/tasks",
      "http://10.0.0.1/tasks",
      "http://100.64.0.1/tasks",
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/tasks",
      "http://192.168.1.10/tasks",
      "http://[::1]/tasks"
    ];

    for (const url of blockedUrls) {
      await assert.rejects(
        executeWorkflowStep({
          step: createStep({
            type: "http",
            config: {
              url
            }
          }),
          executionInput: {},
          stepInput: {}
        }),
        /outside local and private networks/
      );
    }
  });

  it("rejects unsupported step types", async () => {
    const step = createStep({
      type: "email"
    });

    await assert.rejects(
      executeWorkflowStep({
        step,
        executionInput: {},
        stepInput: {}
      }),
      /Unsupported workflow step type/
    );
  });

  it("resolves trigger and previous-step values into HTTP requests", async () => {
    const originalFetch = globalThis.fetch;
    let request: { url: string; headers: Headers; body?: string } | undefined;

    globalThis.fetch = async (url, init) => {
      request = {
        url: String(url),
        headers: new Headers(init?.headers),
        body: typeof init?.body === "string" ? init.body : undefined
      };
      return Response.json({ accepted: true });
    };

    try {
      await executeWorkflowStep({
        step: createStep({
          type: "http",
          config: {
            url: "https://api.example.com/customers/{{ trigger.customerId }}",
            method: "POST",
            headers: {
              "x-customer-email": "{{ steps.fetch-customer.output.email }}",
              "x-customer-score": "{{ steps.analyze.output.score }}"
            },
            body: {
              score: "{{ steps.analyze.output.score }}",
              profile: "{{ steps.fetch-customer.output.profile }}"
            }
          }
        }),
        executionInput: { customerId: "cus_123" },
        stepInput: {},
        expressionContext: {
          trigger: { customerId: "cus_123" },
          steps: {
            "fetch-customer": {
              output: { email: "a@example.com", profile: { region: "pk" } }
            },
            analyze: { output: { score: 94 } }
          }
        }
      });

      assert.equal(request?.url, "https://api.example.com/customers/cus_123");
      assert.equal(request?.headers.get("x-customer-email"), "a@example.com");
      assert.equal(request?.headers.get("x-customer-score"), "94");
      assert.deepEqual(JSON.parse(request?.body ?? ""), {
        score: 94,
        profile: { region: "pk" }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("executes an OpenAI step with structured output and redacted metadata", async () => {
    let request: Parameters<OpenAIResponsesClient["create"]>[0] | undefined;
    const credential = {
      type: "bearer_token" as const,
      headerName: null,
      secret: "sk-secret-value"
    };
    const output = await executeWorkflowStep(
      {
        step: createStep({
          type: "ai",
          config: {
            credentialId: "11111111-1111-4111-8111-111111111111",
            model: "gpt-test",
            systemPrompt: "Analyze customer {{ trigger.customerId }}",
            userPrompt: "Email: {{ steps.fetch.output.email }}",
            outputSchema: {
              type: "object",
              properties: { score: { type: "number" } },
              required: ["score"],
              additionalProperties: false
            },
            timeoutMs: 1_000,
            maxOutputTokens: 500
          }
        }),
        executionInput: { customerId: "cus_123" },
        stepInput: {},
        expressionContext: {
          trigger: { customerId: "cus_123" },
          steps: { fetch: { output: { email: "a@example.com" } } }
        },
        credential
      },
      {
        createOpenAIClient: () => ({
          create: async (input) => {
            request = input;
            return {
              id: "resp_123",
              model: "gpt-test-2026-01-01",
              status: "completed",
              output_text: JSON.stringify({ score: 95 }),
              usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 }
            };
          }
        })
      }
    );

    assert.equal(request?.instructions, "Analyze customer cus_123");
    assert.equal(request?.input, "Email: a@example.com");
    assert.equal(request?.store, false);
    assert.equal(request?.text.format.strict, true);
    assert.deepEqual(output.output, { score: 95 });
    assert.deepEqual(
      {
        provider: output.metadata.provider,
        responseId: output.metadata.responseId,
        model: output.metadata.model,
        inputTokens: output.metadata.inputTokens,
        outputTokens: output.metadata.outputTokens,
        totalTokens: output.metadata.totalTokens
      },
      {
        provider: "openai",
        responseId: "resp_123",
        model: "gpt-test-2026-01-01",
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25
      }
    );
    assert.equal(JSON.stringify({ request, output }).includes(credential.secret), false);
  });

  it("rejects invalid AI output without retrying", async () => {
    let caught: unknown;

    try {
      await executeWorkflowStep(
        {
          step: createStep({
            type: "ai",
            config: {
              credentialId: "11111111-1111-4111-8111-111111111111",
              model: "gpt-test",
              userPrompt: "Analyze",
              outputSchema: {
                type: "object",
                properties: { score: { type: "number" } },
                required: ["score"],
                additionalProperties: false
              }
            }
          }),
          executionInput: {},
          stepInput: {},
          credential: {
            type: "bearer_token",
            headerName: null,
            secret: "secret"
          }
        },
        {
          createOpenAIClient: () => ({
            create: async () => ({
              id: "resp_invalid",
              model: "gpt-test",
              status: "completed",
              output_text: JSON.stringify({ score: "high" })
            })
          })
        }
      );
    } catch (error) {
      caught = error;
    }

    assert.match(caught instanceof Error ? caught.message : "", /failed output validation/);
    assert.equal(isRetryableStepExecutionError(caught), false);
  });

  it("classifies OpenAI timeouts as retryable without exposing provider details", async () => {
    let caught: unknown;

    try {
      await executeWorkflowStep(
        {
          step: createStep({
            type: "ai",
            config: {
              credentialId: "11111111-1111-4111-8111-111111111111",
              model: "gpt-test",
              userPrompt: "Analyze",
              outputSchema: {
                type: "object",
                properties: { score: { type: "number" } },
                required: ["score"],
                additionalProperties: false
              }
            }
          }),
          executionInput: {},
          stepInput: {},
          credential: {
            type: "bearer_token",
            headerName: null,
            secret: "secret"
          }
        },
        {
          createOpenAIClient: () => ({
            create: async () => {
              throw new APIConnectionTimeoutError({ message: "provider detail" });
            }
          })
        }
      );
    } catch (error) {
      caught = error;
    }

    assert.equal(caught instanceof Error ? caught.message : "", "OpenAI request timed out");
    assert.equal(isRetryableStepExecutionError(caught), true);
  });
});

function createStep(input: {
  type: string;
  config?: Record<string, unknown>;
}): WorkflowStepDefinitionRecord {
  return {
    key: "step_1",
    type: input.type,
    config: input.config ?? {},
    retry: {
      maxAttempts: 1,
      backoffMs: 0
    }
  };
}
