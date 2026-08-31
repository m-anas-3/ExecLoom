import { Plus } from "lucide-react";
import type { FormEvent } from "react";

import type { WorkflowResponse } from "@execloom/contracts";

import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function WorkflowSidebar({
  isBusy,
  newWorkflowDescription,
  newWorkflowName,
  selectedWorkflowId,
  workflows,
  onCreateWorkflow,
  onNewWorkflowDescriptionChange,
  onNewWorkflowNameChange,
  onSelectWorkflow
}: {
  isBusy: boolean;
  newWorkflowDescription: string;
  newWorkflowName: string;
  selectedWorkflowId: string | null;
  workflows: WorkflowResponse[];
  onCreateWorkflow: (event: FormEvent<HTMLFormElement>) => void;
  onNewWorkflowDescriptionChange: (description: string) => void;
  onNewWorkflowNameChange: (name: string) => void;
  onSelectWorkflow: (workflowId: string) => void;
}) {
  return (
    <aside className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>New Workflow</CardTitle>
          <CardDescription>Create a demo workflow with noop and delay steps.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onCreateWorkflow}>
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                value={newWorkflowName}
                onChange={(event) => onNewWorkflowNameChange(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Input
                id="workflow-description"
                value={newWorkflowDescription}
                onChange={(event) => onNewWorkflowDescriptionChange(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={isBusy}>
              <Plus className="size-4" />
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

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
    </aside>
  );
}
