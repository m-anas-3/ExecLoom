import { History, RefreshCw } from "lucide-react";

import type { ExecutionResponse, ExecutionStatus } from "@execloom/contracts";

import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const statusFilters: Array<ExecutionStatus | "all"> = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled"
];

export function ExecutionHistory({
  executions,
  isBusy,
  nextCursor,
  selectedExecutionId,
  selectedWorkflowId,
  statusFilter,
  onCancelActive,
  onLoadMore,
  onRefresh,
  onSelectExecution,
  onStatusFilterChange
}: {
  executions: ExecutionResponse[];
  isBusy: boolean;
  nextCursor: string | null;
  selectedExecutionId: string | null;
  selectedWorkflowId: string | null;
  statusFilter: ExecutionStatus | "all";
  onCancelActive: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onSelectExecution: (executionId: string) => void;
  onStatusFilterChange: (filter: ExecutionStatus | "all") => void;
}) {
  const hasActiveExecution = executions.some(
    (execution) => execution.status === "queued" || execution.status === "running"
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Execution History</CardTitle>
          <CardDescription>Latest workflow runs from the API.</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isBusy || !selectedWorkflowId}
          onClick={onRefresh}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((filter) => (
            <Button
              key={filter}
              type="button"
              variant={statusFilter === filter ? "default" : "outline"}
              size="sm"
              disabled={isBusy}
              onClick={() => onStatusFilterChange(filter)}
            >
              {filter}
            </Button>
          ))}
        </div>

        <div className="overflow-hidden rounded-md border border-neutral-200">
          <div className="grid grid-cols-[1fr_120px_170px] bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-600">
            <span>Execution</span>
            <span>Status</span>
            <span>Created</span>
          </div>
          {executions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-neutral-600">No executions found.</p>
          ) : (
            executions.map((execution) => (
              <button
                key={execution.id}
                className={cn(
                  "grid grid-cols-[1fr_120px_170px] items-center border-t border-neutral-200 px-4 py-3 text-left text-sm transition-colors hover:bg-neutral-50",
                  selectedExecutionId === execution.id ? "bg-neutral-50" : ""
                )}
                onClick={() => onSelectExecution(execution.id)}
              >
                <span className="truncate font-mono text-xs text-neutral-700">
                  {execution.id}
                </span>
                <StatusBadge status={execution.status} />
                <span className="text-xs text-neutral-600">{formatDate(execution.createdAt)}</span>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-between gap-3">
          <Button variant="outline" disabled={isBusy || !nextCursor} onClick={onLoadMore}>
            <History className="size-4" />
            Load More
          </Button>
          {hasActiveExecution ? (
            <Button variant="destructive" disabled={isBusy} onClick={onCancelActive}>
              Cancel Active
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
