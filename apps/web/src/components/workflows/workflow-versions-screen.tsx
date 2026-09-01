"use client";

import type { WorkflowDetailResponse, WorkflowVersionResponse } from "@execloom/contracts";
import { GitBranch, LoaderCircle, PencilLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { JsonBlock } from "@/components/app/json-block";
import { StatusBadge } from "@/components/app/status-badge";
import { WorkflowCanvas } from "@/components/workflow-editor/workflow-canvas";
import { InlineNotice } from "@/components/ui/inline-notice";
import { WorkflowPageHeader } from "@/components/workflows/workflow-page-header";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, getWorkflow } from "@/lib/api";
import { definitionToWorkflowGraph } from "@/lib/workflow-graph";
import { cn } from "@/lib/utils";

export function WorkflowVersionsScreen({ workflowId }: { workflowId: string }) {
  const { accessToken } = useAuth();
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void getWorkflow(accessToken, workflowId)
      .then((detail) => {
        if (!cancelled) {
          setWorkflowDetail(detail);
          setSelectedVersionId(
            detail.workflow.activeVersionId ?? detail.versions[0]?.id ?? null
          );
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(getErrorMessage(requestError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, workflowId]);

  const selectedVersion = useMemo(
    () =>
      workflowDetail?.versions.find((version) => version.id === selectedVersionId) ??
      workflowDetail?.versions[0] ??
      null,
    [selectedVersionId, workflowDetail]
  );

  if (isLoading) {
    return (
      <main className="grid min-h-[520px] place-items-center">
        <LoaderCircle className="size-5 animate-spin text-neutral-500" aria-label="Loading versions" />
      </main>
    );
  }

  if (!workflowDetail || !selectedVersion) {
    return (
      <main className="grid min-h-[520px] place-items-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-neutral-950">Unable to open version history</p>
          <p className="mt-1 text-sm text-neutral-600">{error ?? "No workflow versions found."}</p>
          <Link href="/workflows" className="mt-4 inline-flex text-sm font-medium underline">
            Back to workflows
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-neutral-50 xl:min-h-screen">
      <WorkflowPageHeader
        workflow={workflowDetail.workflow}
        activeSection="versions"
        meta={`${workflowDetail.versions.length} immutable ${workflowDetail.versions.length === 1 ? "version" : "versions"}`}
      />

      <div className="mx-auto max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-8">
        <InlineNotice variant="info" title="Versions are immutable">
          Editing a previous version creates a new draft and preserves execution history.
        </InlineNotice>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="self-start overflow-hidden rounded-md border border-neutral-200 bg-white">
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            <GitBranch className="size-4 text-neutral-500" />
            <p className="text-sm font-semibold text-neutral-900">
              {workflowDetail.versions.length}{" "}
              {workflowDetail.versions.length === 1 ? "version" : "versions"}
            </p>
          </div>
          <div className="max-h-[calc(100vh-160px)] overflow-y-auto p-2">
            {workflowDetail.versions.map((version) => (
              <VersionButton
                key={version.id}
                version={version}
                active={workflowDetail.workflow.activeVersionId === version.id}
                selected={selectedVersion.id === version.id}
                onSelect={() => setSelectedVersionId(version.id)}
              />
            ))}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-neutral-950">
                  Version {selectedVersion.versionNo}
                </p>
                <StatusBadge status={selectedVersion.status} />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Created {formatDate(selectedVersion.createdAt)} · {selectedVersion.definition.steps.length} {selectedVersion.definition.steps.length === 1 ? "step" : "steps"}
              </p>
            </div>
            <Link
              href={`/workflows/${workflowId}?baseVersion=${selectedVersion.id}`}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
            >
              <PencilLine className="size-3.5" />
              Edit as new draft
            </Link>
          </div>

          <div className="h-[240px] border-b border-neutral-200 sm:h-[400px]" data-testid="version-graph-preview">
            <WorkflowCanvas
              graph={definitionToWorkflowGraph(selectedVersion.definition)}
              selectedNodeId={null}
              readOnly
            />
          </div>

          <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Step order</p>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                {selectedVersion.definition.steps.map((step, index) => (
                  <div
                    key={step.key}
                    className="grid grid-cols-[36px_minmax(0,1fr)_100px] items-center gap-3 border-b border-neutral-200 px-3 py-2.5 text-sm last:border-b-0"
                  >
                    <span className="text-xs text-neutral-400">{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-neutral-900">
                        {step.name || step.key}
                      </span>
                      <span className="block truncate font-mono text-xs text-neutral-500">
                        {step.key}
                      </span>
                    </span>
                    <span className="text-xs text-neutral-600">{formatStepType(step.type)}</span>
                  </div>
                ))}
              </div>
            </div>
            <JsonBlock label="Input schema" value={selectedVersion.inputSchema} />
          </div>
        </section>
      </div>
    </main>
  );
}

function VersionButton({
  version,
  active,
  selected,
  onSelect
}: {
  version: WorkflowVersionResponse;
  active: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "mb-1 grid w-full gap-2 rounded-md border px-3 py-3 text-left last:mb-0",
        selected
          ? "border-brand/40 bg-brand-soft/60 text-neutral-950"
          : "border-transparent hover:border-neutral-200 hover:bg-neutral-50"
      )}
      onClick={onSelect}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">Version {version.versionNo}</span>
        {active ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            Active
          </span>
        ) : null}
      </span>
      <span className="text-xs text-neutral-500">
        {version.definition.steps.length} {version.definition.steps.length === 1 ? "step" : "steps"} · {formatDate(version.createdAt)}
      </span>
    </button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStepType(type: WorkflowVersionResponse["definition"]["steps"][number]["type"]) {
  const labels = {
    noop: "No-op",
    delay: "Delay",
    http: "HTTP Request"
  } as const;

  return labels[type];
}

function getErrorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Unable to load workflow versions.";
}
