import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WorkflowStepDefinitionRecord } from "@execloom/db";

import { executeWorkflowStep } from "./executors.js";

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

    assert.deepEqual(output, {
      type: "noop",
      completed: true,
      input: stepInput
    });
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

    assert.deepEqual(output, {
      type: "delay",
      completed: true,
      delayedForMs: 0
    });
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
      assert.deepEqual(output, {
        type: "http",
        completed: true,
        status: 201,
        headers: {
          "content-type": "application/json",
          "x-request-id": "request_123"
        },
        body: {
          ok: true
        }
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
      /HTTP step config\.timeoutMs/
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
      /HTTP step config\.url/
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
        /cannot target local or private network hosts/
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
