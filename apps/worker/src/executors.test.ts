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

  it("rejects unsupported step types", async () => {
    const step = createStep({
      type: "http"
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
    config: input.config ?? {}
  };
}
