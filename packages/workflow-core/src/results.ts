export const stepExecutionResultVersion = 1 as const;

export type StepExecutionResultMetadata = Record<string, unknown> & {
  resultVersion: typeof stepExecutionResultVersion;
  stepType: string;
  durationMs: number;
};

export type StepExecutionResult = {
  output: unknown;
  metadata: StepExecutionResultMetadata;
};

export function isStepExecutionResult(value: unknown): value is StepExecutionResult {
  if (!isPlainObject(value) || !("output" in value) || !isPlainObject(value.metadata)) {
    return false;
  }

  return (
    value.metadata.resultVersion === stepExecutionResultVersion &&
    typeof value.metadata.stepType === "string" &&
    typeof value.metadata.durationMs === "number"
  );
}

export function normalizeStepExecutionResult(value: unknown): StepExecutionResult {
  if (isStepExecutionResult(value)) {
    return value;
  }

  return {
    output: value,
    metadata: {
      resultVersion: stepExecutionResultVersion,
      stepType: "legacy",
      durationMs: 0
    }
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
