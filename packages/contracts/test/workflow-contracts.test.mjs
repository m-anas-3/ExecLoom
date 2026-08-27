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
  });

  it("rejects unsupported step types", () => {
    assert.throws(() => workflowStepTypeSchema.parse("http"), /Invalid enum value/);
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
