import type { WorkflowResponse } from "@execloom/contracts";

import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WorkflowList({
  selectedWorkflowId,
  workflows,
  onSelectWorkflow
}: {
  selectedWorkflowId: string | null;
  workflows: WorkflowResponse[];
  onSelectWorkflow: (workflowId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflows</CardTitle>
        <CardDescription>{workflows.length} total</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {workflows.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
            No workflows yet.
          </p>
        ) : (
          workflows.map((workflowItem) => (
            <button
              key={workflowItem.id}
              className={cn(
                "grid gap-2 rounded-md border p-3 text-left transition-colors",
                selectedWorkflowId === workflowItem.id
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-200 bg-white hover:border-neutral-300"
              )}
              onClick={() => onSelectWorkflow(workflowItem.id)}
            >
              <span className="text-sm font-medium">{workflowItem.name}</span>
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-xs opacity-70">{workflowItem.id}</span>
                <StatusBadge status={workflowItem.status} />
              </span>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
