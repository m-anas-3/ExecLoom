import type { WorkflowStepDefinitionRecord } from "@execloom/db";

export type StepExecutionInput = {
  step: WorkflowStepDefinitionRecord;
  executionInput: unknown;
  stepInput: unknown;
};

export async function executeWorkflowStep(input: StepExecutionInput): Promise<unknown> {
  switch (input.step.type) {
    case "noop":
      return {
        type: "noop",
        completed: true,
        input: input.stepInput
      };

    case "delay":
      return executeDelayStep(input.step);

    default:
      throw new Error(`Unsupported workflow step type: ${input.step.type}`);
  }
}

async function executeDelayStep(step: WorkflowStepDefinitionRecord): Promise<unknown> {
  const ms = getDelayMs(step.config);

  await sleep(ms);

  return {
    type: "delay",
    completed: true,
    delayedForMs: ms
  };
}

function getDelayMs(config: Record<string, unknown>): number {
  const rawMs = config.ms;

  if (rawMs === undefined) {
    return 1_000;
  }

  if (typeof rawMs !== "number" || !Number.isInteger(rawMs) || rawMs < 0 || rawMs > 30_000) {
    throw new Error("Delay step config.ms must be an integer between 0 and 30000");
  }

  return rawMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
