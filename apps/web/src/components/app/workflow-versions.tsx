import { FilePenLine, GitBranch } from "lucide-react";

import type { WorkflowDetailResponse, WorkflowVersionResponse } from "@execloom/contracts";

import { JsonBlock } from "@/components/app/json-block";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function WorkflowVersions({
  selectedVersion,
  workflowDetail,
  onLoadVersion,
  onSelectVersion
}: {
  selectedVersion: WorkflowVersionResponse | null;
  workflowDetail: WorkflowDetailResponse | null;
  onLoadVersion: (version: WorkflowVersionResponse) => void;
  onSelectVersion: (versionId: string) => void;
}) {
  const versions = workflowDetail?.versions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="size-4" />
          Workflow Versions
        </CardTitle>
        <CardDescription>{versions.length} immutable definitions</CardDescription>
      </CardHeader>
      <CardContent>
        {selectedVersion && workflowDetail ? (
          <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
            <div className="grid content-start gap-2">
              {versions.map((version) => {
                const isActive = workflowDetail.workflow.activeVersionId === version.id;

                return (
                  <button
                    key={version.id}
                    type="button"
                    className={cn(
                      "grid gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                      selectedVersion.id === version.id
                        ? "border-neutral-950 bg-neutral-950 text-white"
                        : "border-neutral-200 hover:border-neutral-300"
                    )}
                    onClick={() => onSelectVersion(version.id)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Version {version.versionNo}</span>
                      {isActive ? <Badge variant="green">active</Badge> : null}
                    </span>
                    <StatusBadge status={version.status} />
                  </button>
                );
              })}
            </div>

            <div className="grid min-w-0 gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Version {selectedVersion.versionNo}</p>
                  <p className="text-xs text-neutral-600">
                    Created {formatDate(selectedVersion.createdAt)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onLoadVersion(selectedVersion)}>
                  <FilePenLine className="size-4" />
                  Load in Editor
                </Button>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <JsonBlock label="Input Schema" value={selectedVersion.inputSchema} />
                <JsonBlock label="Definition" value={selectedVersion.definition} />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Select a workflow to inspect its versions.</p>
        )}
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
