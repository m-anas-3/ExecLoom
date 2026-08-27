export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type StepRunStatus =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "retrying"
  | "failed"
  | "skipped"
  | "cancelled";

export const executionTerminalStatuses: ReadonlySet<ExecutionStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled"
]);

export const stepRunTerminalStatuses: ReadonlySet<StepRunStatus> = new Set([
  "succeeded",
  "failed",
  "skipped",
  "cancelled"
]);

export const allowedExecutionTransitions: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: []
};

export const allowedStepRunTransitions: Readonly<Record<StepRunStatus, readonly StepRunStatus[]>> = {
  pending: ["queued", "skipped", "cancelled"],
  queued: ["running", "skipped", "cancelled"],
  running: ["succeeded", "retrying", "failed", "cancelled"],
  retrying: ["queued", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  skipped: [],
  cancelled: []
};

export function isExecutionTerminal(status: ExecutionStatus): boolean {
  return executionTerminalStatuses.has(status);
}

export function isStepRunTerminal(status: StepRunStatus): boolean {
  return stepRunTerminalStatuses.has(status);
}

export function canTransitionExecution(
  from: ExecutionStatus,
  to: ExecutionStatus
): boolean {
  return allowedExecutionTransitions[from].includes(to);
}

export function canTransitionStepRun(from: StepRunStatus, to: StepRunStatus): boolean {
  return allowedStepRunTransitions[from].includes(to);
}

export function assertExecutionTransition(
  from: ExecutionStatus,
  to: ExecutionStatus
): void {
  if (!canTransitionExecution(from, to)) {
    throw new Error(`Invalid execution transition: ${from} -> ${to}`);
  }
}

export function assertStepRunTransition(from: StepRunStatus, to: StepRunStatus): void {
  if (!canTransitionStepRun(from, to)) {
    throw new Error(`Invalid step run transition: ${from} -> ${to}`);
  }
}
