import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createWorkflowRequestSchema,
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
