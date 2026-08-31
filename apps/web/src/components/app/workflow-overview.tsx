import { Play, Rocket } from "lucide-react";

import type { WorkflowDetailResponse, WorkflowResponse } from "@execloom/contracts";

import { Metric } from "@/components/app/metric";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function WorkflowOverview({
  executionCount,
  isBusy,
  selectedWorkflow,
  workflowDetail,
  onPublish,
  onRun
}: {
  executionCount: number;
  isBusy: boolean;
  selectedWorkflow: WorkflowResponse | null;
  workflowDetail: WorkflowDetailResponse | null;
  onPublish: () => void;
  onRun: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{selectedWorkflow?.name ?? "Workflow"}</CardTitle>
          <CardDescription>
            {selectedWorkflow?.description ?? "Select or create a workflow."}
          </CardDescription>
        </div>
        {selectedWorkflow ? <StatusBadge status={selectedWorkflow.status} /> : null}
      </CardHeader>
      <CardContent>
        {selectedWorkflow ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={isBusy} onClick={onPublish}>
                <Rocket className="size-4" />
                Publish
              </Button>
              <Button disabled={isBusy || selectedWorkflow.status !== "published"} onClick={onRun}>
                <Play className="size-4" />
                Run
              </Button>
            </div>

            <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
              <Metric label="Versions" value={String(workflowDetail?.versions.length ?? 0)} />
              <Metric
                label="Active Version"
                value={selectedWorkflow.activeVersionId ? "Yes" : "No"}
              />
              <Metric label="Executions" value={String(executionCount)} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Create a workflow to begin.</p>
        )}
      </CardContent>
    </Card>
  );
}
