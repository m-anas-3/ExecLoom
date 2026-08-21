export type ExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const executionTerminalStatuses: ReadonlySet<ExecutionStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled"
]);

export function isExecutionTerminal(status: ExecutionStatus): boolean {
  return executionTerminalStatuses.has(status);
}
