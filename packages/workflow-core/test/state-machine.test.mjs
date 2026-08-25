import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertExecutionTransition,
  assertStepRunTransition,
  canTransitionExecution,
  canTransitionStepRun,
  isExecutionTerminal,
  isStepRunTerminal
} from "../dist/index.js";

describe("execution state transitions", () => {
  it("allows valid execution transitions", () => {
    assert.equal(canTransitionExecution("queued", "running"), true);
    assert.equal(canTransitionExecution("running", "succeeded"), true);
    assert.equal(canTransitionExecution("running", "failed"), true);
    assert.equal(canTransitionExecution("running", "cancelled"), true);
  });

  it("rejects invalid execution transitions", () => {
    assert.equal(canTransitionExecution("succeeded", "running"), false);
    assert.throws(
      () => assertExecutionTransition("succeeded", "running"),
      /Invalid execution transition/
    );
  });

  it("identifies terminal execution states", () => {
    assert.equal(isExecutionTerminal("queued"), false);
    assert.equal(isExecutionTerminal("running"), false);
    assert.equal(isExecutionTerminal("succeeded"), true);
    assert.equal(isExecutionTerminal("failed"), true);
    assert.equal(isExecutionTerminal("cancelled"), true);
  });
});

describe("step run state transitions", () => {
  it("allows valid step run transitions", () => {
    assert.equal(canTransitionStepRun("pending", "queued"), true);
    assert.equal(canTransitionStepRun("queued", "running"), true);
    assert.equal(canTransitionStepRun("running", "succeeded"), true);
    assert.equal(canTransitionStepRun("running", "retrying"), true);
    assert.equal(canTransitionStepRun("retrying", "queued"), true);
  });

  it("rejects invalid step run transitions", () => {
    assert.equal(canTransitionStepRun("succeeded", "running"), false);
    assert.throws(
      () => assertStepRunTransition("succeeded", "running"),
      /Invalid step run transition/
    );
  });

  it("identifies terminal step run states", () => {
    assert.equal(isStepRunTerminal("pending"), false);
    assert.equal(isStepRunTerminal("queued"), false);
    assert.equal(isStepRunTerminal("running"), false);
    assert.equal(isStepRunTerminal("retrying"), false);
    assert.equal(isStepRunTerminal("succeeded"), true);
    assert.equal(isStepRunTerminal("failed"), true);
    assert.equal(isStepRunTerminal("skipped"), true);
    assert.equal(isStepRunTerminal("cancelled"), true);
  });
});
