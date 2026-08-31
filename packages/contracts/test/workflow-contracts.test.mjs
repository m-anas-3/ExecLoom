import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createWorkflowVersionRequestSchema,
  createWorkflowRequestSchema,
  isSafeHttpStepUrl,
  listWorkflowExecutionsQuerySchema,
  loginRequestSchema,
  registerRequestSchema,
  workflowDefinitionSchema,
  workflowStepTypeSchema
} from "../dist/index.js";

describe("auth contracts", () => {
  it("normalizes register email addresses", () => {
    const parsed = registerRequestSchema.parse({
      email: "USER@Example.COM",
      password: "password123"
    });

    assert.equal(parsed.email, "user@example.com");
  });

  it("rejects short register passwords", () => {
    assert.throws(
      () =>
        registerRequestSchema.parse({
          email: "user@example.com",
          password: "short"
        }),
      /String must contain at least 8/
    );
  });

  it("accepts login credentials", () => {
    const parsed = loginRequestSchema.parse({
      email: "USER@Example.COM",
      password: "password123"
    });

    assert.deepEqual(parsed, {
      email: "user@example.com",
      password: "password123"
    });
  });
});

describe("execution list query contracts", () => {
  it("defaults execution history limit", () => {
    const parsed = listWorkflowExecutionsQuerySchema.parse({});

    assert.equal(parsed.limit, 20);
  });

  it("coerces valid execution history limit values", () => {
    const parsed = listWorkflowExecutionsQuerySchema.parse({
      limit: "50"
    });

    assert.equal(parsed.limit, 50);
  });

  it("accepts valid execution history status filters", () => {
    const parsed = listWorkflowExecutionsQuerySchema.parse({
      status: "failed"
    });

    assert.deepEqual(parsed, {
      limit: 20,
      status: "failed"
    });
  });

  it("accepts valid execution history cursors", () => {
    const parsed = listWorkflowExecutionsQuerySchema.parse({
      cursor: "00000000-0000-4000-8000-000000000001"
    });

    assert.deepEqual(parsed, {
      limit: 20,
      cursor: "00000000-0000-4000-8000-000000000001"
    });
  });

  it("rejects invalid execution history limit values", () => {
    assert.throws(
      () =>
        listWorkflowExecutionsQuerySchema.parse({
          limit: "101"
        }),
      /Number must be less than or equal to 100/
    );
  });

  it("rejects invalid execution history status filters", () => {
    assert.throws(
      () =>
        listWorkflowExecutionsQuerySchema.parse({
          status: "paused"
        }),
      /Invalid enum value/
    );
  });

  it("rejects invalid execution history cursors", () => {
    assert.throws(
      () =>
        listWorkflowExecutionsQuerySchema.parse({
          cursor: "not-a-uuid"
        }),
      /Invalid uuid/
    );
  });
});

describe("workflow step types", () => {
  it("accepts supported step types", () => {
    assert.equal(workflowStepTypeSchema.parse("noop"), "noop");
    assert.equal(workflowStepTypeSchema.parse("delay"), "delay");
    assert.equal(workflowStepTypeSchema.parse("http"), "http");
  });

  it("rejects unsupported step types", () => {
    assert.throws(() => workflowStepTypeSchema.parse("email"), /Invalid enum value/);
  });
});

describe("workflow definition contracts", () => {
  it("accepts a linear noop and delay workflow", () => {
    const parsed = workflowDefinitionSchema.parse({
      steps: [
        {
          key: "start",
          type: "noop",
          config: {}
        },
        {
          key: "wait",
          type: "delay",
          config: {
            ms: 100
          }
        }
      ]
    });

    assert.deepEqual(parsed.steps[0]?.retry, {
      maxAttempts: 1,
      backoffMs: 0
    });
    assert.deepEqual(parsed.steps[1]?.retry, {
      maxAttempts: 1,
      backoffMs: 0
    });
  });

  it("accepts explicit retry policy on workflow steps", () => {
    const parsed = workflowDefinitionSchema.parse({
      steps: [
        {
          key: "notify",
          type: "http",
          retry: {
            maxAttempts: 3,
            backoffMs: 2_000
          },
          config: {
            url: "https://api.example.com/notify"
          }
        }
      ]
    });

    assert.deepEqual(parsed.steps[0]?.retry, {
      maxAttempts: 3,
      backoffMs: 2_000
    });
  });

  it("accepts http steps with default method and headers", () => {
    const parsed = workflowDefinitionSchema.parse({
      steps: [
        {
          key: "notify",
          type: "http",
          config: {
            url: "https://api.example.com/notify"
          }
        }
      ]
    });

    assert.deepEqual(parsed.steps[0]?.config, {
      url: "https://api.example.com/notify",
      method: "GET",
      headers: {},
      timeoutMs: 10_000
    });
  });

  it("accepts http steps with explicit timeout", () => {
    const parsed = workflowDefinitionSchema.parse({
      steps: [
        {
          key: "notify",
          type: "http",
          config: {
            url: "https://api.example.com/notify",
            timeoutMs: 5_000
          }
        }
      ]
    });

    assert.equal(parsed.steps[0]?.config.timeoutMs, 5_000);
  });

  it("rejects http steps without a URL", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: [
            {
              key: "notify",
              type: "http",
              config: {}
            }
          ]
        }),
      /Required/
    );
  });

  it("rejects http steps with unsupported URL protocols", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: [
            {
              key: "notify",
              type: "http",
              config: {
                url: "ftp://api.example.com/notify"
              }
            }
          ]
        }),
      /URL must use http or https/
    );
  });

  it("rejects http steps targeting local or private network hosts", () => {
    const blockedUrls = [
      "http://localhost:3000/notify",
      "http://api.localhost/notify",
      "http://127.0.0.1/notify",
      "http://10.0.0.1/notify",
      "http://100.64.0.1/notify",
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/notify",
      "http://192.168.1.1/notify",
      "http://[::]/notify",
      "http://[::1]/notify",
      "http://[fe80::1]/notify",
      "http://[fc00::1]/notify",
      "http://[::ffff:127.0.0.1]/notify"
    ];

    for (const url of blockedUrls) {
      assert.throws(
        () =>
          workflowDefinitionSchema.parse({
            steps: [
              {
                key: "notify",
                type: "http",
                config: {
                  url
                }
              }
            ]
          }),
        /cannot target local or private network hosts/
      );
    }
  });

  it("classifies safe and unsafe http step URLs", () => {
    assert.equal(isSafeHttpStepUrl("https://api.example.com/tasks"), true);
    assert.equal(isSafeHttpStepUrl("http://example.com/tasks"), true);
    assert.equal(isSafeHttpStepUrl("ftp://api.example.com/tasks"), false);
    assert.equal(isSafeHttpStepUrl("http://localhost:3000/tasks"), false);
    assert.equal(isSafeHttpStepUrl("http://127.0.0.1/tasks"), false);
  });

  it("rejects delay steps with invalid timing", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: [
            {
              key: "wait",
              type: "delay",
              config: {
                ms: -1
              }
            }
          ]
        }),
      /Number must be greater than or equal to 0/
    );
  });

  it("rejects http steps with invalid timeout", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: [
            {
              key: "notify",
              type: "http",
              config: {
                url: "https://api.example.com/notify",
                timeoutMs: 0
              }
            }
          ]
        }),
      /Number must be greater than or equal to 1/
    );
  });

  it("rejects an empty workflow", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: []
        }),
      /Array must contain at least 1/
    );
  });

  it("defaults optional JSON fields when creating workflows", () => {
    const parsed = createWorkflowRequestSchema.parse({
      name: "Demo workflow",
      definition: {
        steps: [
          {
            key: "start",
            type: "noop"
          }
        ]
      }
    });

    assert.deepEqual(parsed.inputSchema, {});
    assert.deepEqual(parsed.definition.steps[0]?.config, {});
    assert.deepEqual(parsed.definition.steps[0]?.retry, {
      maxAttempts: 1,
      backoffMs: 0
    });
  });

  it("validates immutable workflow version input", () => {
    const parsed = createWorkflowVersionRequestSchema.parse({
      definition: {
        steps: [
          {
            key: "next",
            type: "noop"
          }
        ]
      }
    });

    assert.deepEqual(parsed.inputSchema, {});
    assert.equal(parsed.definition.steps[0]?.key, "next");
  });

  it("rejects workflow versions without steps", () => {
    assert.throws(
      () =>
        createWorkflowVersionRequestSchema.parse({
          definition: {
            steps: []
          }
        }),
      /Array must contain at least 1/
    );
  });

  it("rejects retry policies with invalid attempts", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: [
            {
              key: "start",
              type: "noop",
              retry: {
                maxAttempts: 0
              }
            }
          ]
        }),
      /Number must be greater than or equal to 1/
    );
  });

  it("rejects retry policies with invalid backoff", () => {
    assert.throws(
      () =>
        workflowDefinitionSchema.parse({
          steps: [
            {
              key: "start",
              type: "noop",
              retry: {
                backoffMs: -1
              }
            }
          ]
        }),
      /Number must be greater than or equal to 0/
    );
  });
});
