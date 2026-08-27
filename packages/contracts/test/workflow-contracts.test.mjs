import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createWorkflowRequestSchema,
  workflowDefinitionSchema,
  workflowStepTypeSchema
} from "../dist/index.js";

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
    const workflow = {
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
    };

    assert.deepEqual(workflowDefinitionSchema.parse(workflow), workflow);
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
  });
});
