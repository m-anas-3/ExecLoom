"use client";

import type {
  ExecutionDetailResponse,
  ExecutionStatus,
  StepRunResponse,
  WorkflowDetailResponse
} from "@execloom/contracts";
import {
  ArrowLeft,
  Ban,
  LoaderCircle
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { JsonBlock } from "@/components/app/json-block";
import { StatusBadge } from "@/components/app/status-badge";
import { WorkflowCanvas } from "@/components/workflow-editor/workflow-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowPageHeader } from "@/components/workflows/workflow-page-header";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, cancelExecution, getExecution, getWorkflow } from "@/lib/api";
import { formatJson } from "@/lib/json-authoring";
import { definitionToWorkflowGraph } from "@/lib/workflow-graph";
import { cn } from "@/lib/utils";

const executionPollIntervalMs = 3_000;

export function ExecutionDetailScreen({
  workflowId,
  executionId
}: {
  workflowId: string;
  executionId: string;
}) {
  const { accessToken } = useAuth();
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [executionDetail, setExecutionDetail] = useState<ExecutionDetailResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshExecution = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const detail = await getExecution(accessToken, executionId);
      setExecutionDetail(detail);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }, [accessToken, executionId]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.all([getWorkflow(accessToken, workflowId), getExecution(accessToken, executionId)])
      .then(([workflow, execution]) => {
        if (!cancelled) {
          setWorkflowDetail(workflow);
          setExecutionDetail(execution);
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
  }, [accessToken, executionId, workflowId]);

  const executionStatus = executionDetail?.execution.status;

  useEffect(() => {
    if (!executionStatus || !isActiveStatus(executionStatus)) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    async function poll() {
      await refreshExecution();

      if (!cancelled) {
        timeoutId = window.setTimeout(() => void poll(), executionPollIntervalMs);
      }
    }

    timeoutId = window.setTimeout(() => void poll(), executionPollIntervalMs);

    return () => {
      cancelled = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [executionStatus, refreshExecution]);

  const version = useMemo(
    () =>
      workflowDetail?.versions.find(
        (workflowVersion) =>
          workflowVersion.id === executionDetail?.execution.workflowVersionId
      ) ?? null,
    [executionDetail?.execution.workflowVersionId, workflowDetail]
  );
  const statusByStepKey = useMemo(
    () =>
      new Map(
        executionDetail?.steps.map((step) => [step.stepKey, step.status] as const) ?? []
      ),
    [executionDetail]
  );

  async function cancelCurrentExecution() {
    if (!accessToken || !executionDetail || !isActiveStatus(executionDetail.execution.status)) {
      return;
    }

    setIsCancelling(true);
    setError(null);

    try {
      setExecutionDetail(await cancelExecution(accessToken, executionId));
      setCancelDialogOpen(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <main className="grid min-h-[520px] place-items-center">
        <LoaderCircle className="size-5 animate-spin text-neutral-500" aria-label="Loading execution" />
      </main>
    );
  }

  if (!workflowDetail || !executionDetail || !version) {
    return (
      <main className="grid min-h-[520px] place-items-center p-6 text-center">
        <div>
          <p className="text-sm font-medium text-neutral-950">Unable to open execution</p>
          <p className="mt-1 text-sm text-neutral-600">
            {error ?? "The workflow version for this execution was not found."}
          </p>
          <Link
            href={`/workflows/${workflowId}/executions`}
            className="mt-4 inline-flex text-sm font-medium underline"
          >
            Back to execution history
          </Link>
        </div>
      </main>
    );
  }

  const canCancel = isActiveStatus(executionDetail.execution.status);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-neutral-50 xl:min-h-screen">
      <WorkflowPageHeader
        workflow={workflowDetail.workflow}
        activeSection="executions"
        meta={`Execution ${executionDetail.execution.id.slice(0, 8)} · Version ${version.versionNo}`}
      >
        {canCancel ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isCancelling}
            onClick={() => setCancelDialogOpen(true)}
          >
            {isCancelling ? <LoaderCircle className="size-4 animate-spin" /> : <Ban className="size-4" />}
            Cancel
          </Button>
        ) : null}
      </WorkflowPageHeader>

      <div className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <Link
          href={`/workflows/${workflowId}/executions`}
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950"
        >
          <ArrowLeft className="size-4" />
          Execution history
        </Link>

        <section className="mt-4 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-sm font-semibold text-neutral-950">
                  {executionDetail.execution.id}
                </p>
                <StatusBadge status={executionDetail.execution.status} />
                <Badge variant="neutral">Version {version.versionNo}</Badge>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Triggered {formatDate(executionDetail.execution.createdAt)} via {executionDetail.execution.triggerType}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              <ExecutionMetric
                label="Duration"
                value={formatDuration(
                  executionDetail.execution.startedAt,
                  executionDetail.execution.endedAt
                )}
              />
              <ExecutionMetric label="Steps" value={String(executionDetail.steps.length)} />
              <ExecutionMetric label="Events" value={String(executionDetail.events.length)} />
            </div>
          </div>

          {error ? <InlineNotice variant="error" className="m-4">{error}</InlineNotice> : null}

          <div className="h-[440px] border-b border-neutral-200" data-testid="execution-graph">
            <WorkflowCanvas
              graph={definitionToWorkflowGraph(version.definition)}
              readOnly
              selectedNodeId={selectedNodeId}
              stepStatuses={statusByStepKey}
              onSelectNode={setSelectedNodeId}
            />
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <section className="min-w-0 rounded-md border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-3">
              <p className="text-sm font-semibold text-neutral-950">Step timeline</p>
            </div>
            <div>
              {version.definition.steps.map((definitionStep, index) => {
                const stepRun = executionDetail.steps.find(
                  (step) => step.stepKey === definitionStep.key
                );

                return (
                  <StepTimelineItem
                    key={definitionStep.key}
                    index={index}
                    name={definitionStep.name || definitionStep.key}
                    stepKey={definitionStep.key}
                    stepRun={stepRun}
                    selected={selectedNodeId === definitionStep.key}
                    onSelect={() => setSelectedNodeId(definitionStep.key)}
                  />
                );
              })}
            </div>
          </section>

          <div className="grid content-start gap-5">
            <section className="rounded-md border border-neutral-200 bg-white p-4">
              <Tabs defaultValue="input">
                <TabsList className="w-full justify-start rounded-md" aria-label="Execution data">
                  <TabsTrigger value="input">Input</TabsTrigger>
                  <TabsTrigger value="output">Output</TabsTrigger>
                  {executionDetail.execution.error ? <TabsTrigger value="error">Error</TabsTrigger> : null}
                </TabsList>
                <TabsContent value="input" className="mt-2"><JsonBlock label="Execution input" value={executionDetail.execution.input} /></TabsContent>
                <TabsContent value="output" className="mt-2"><JsonBlock label="Execution output" value={executionDetail.execution.output} /></TabsContent>
                {executionDetail.execution.error ? <TabsContent value="error" className="mt-2"><JsonBlock label="Execution error" value={executionDetail.execution.error} /></TabsContent> : null}
              </Tabs>
            </section>

            <section className="overflow-hidden rounded-md border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-950">Event log</p>
              </div>
              {executionDetail.events.map((event) => (
                <details
                  key={event.id}
                  className="group border-b border-neutral-200 last:border-b-0"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-neutral-50">
                    <span className="min-w-0 truncate font-medium text-neutral-900">
                      {event.type}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-500">
                      #{event.sequenceNo} · {formatTime(event.createdAt)}
                    </span>
                  </summary>
                  <pre className="max-h-48 overflow-auto border-t border-neutral-200 bg-neutral-950 p-3 text-xs text-neutral-100">
                    {formatJson(event.payload)}
                  </pre>
                </details>
              ))}
            </section>
          </div>
        </div>
      </div>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="border-neutral-200 bg-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Cancel execution?</DialogTitle>
            <DialogDescription>
              ExecLoom will stop dispatching additional work. A currently running external request may still finish.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isCancelling} onClick={() => setCancelDialogOpen(false)}>Keep running</Button>
            <Button variant="destructive" disabled={isCancelling} onClick={() => void cancelCurrentExecution()}>
              {isCancelling ? <LoaderCircle className="size-4 animate-spin" /> : <Ban className="size-4" />}
              Cancel execution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function StepTimelineItem({
  index,
  name,
  stepKey,
  stepRun,
  selected,
  onSelect
}: {
  index: number;
  name: string;
  stepKey: string;
  stepRun: StepRunResponse | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <details
      open={selected}
      className={cn(
        "border-b border-neutral-200 last:border-b-0",
        selected ? "bg-neutral-50" : "bg-white"
      )}
      onClick={onSelect}
    >
      <summary className="grid cursor-pointer list-none grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
        <span className="grid size-6 place-items-center rounded-full border border-neutral-200 bg-white text-xs text-neutral-500">
          {index + 1}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-neutral-950">{name}</span>
          <span className="block truncate font-mono text-xs text-neutral-500">{stepKey}</span>
        </span>
        <div className="flex items-center gap-3">
          {stepRun ? <StatusBadge status={stepRun.status} /> : <StatusBadge status="pending" />}
          <span className="hidden text-xs text-neutral-500 sm:inline">
            {stepRun?.attemptCount ?? 0} attempts
          </span>
        </div>
      </summary>
      {stepRun ? (
        <div className="grid gap-3 border-t border-neutral-200 px-4 py-4 sm:grid-cols-3">
          <JsonBlock label="Input" value={stepRun.input} />
          <JsonBlock label="Output" value={stepRun.output} />
          <JsonBlock label="Error" value={stepRun.error} />
        </div>
      ) : null}
    </details>
  );
}

function ExecutionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-neutral-500">{label}</p>
      <p className="mt-0.5 font-medium text-neutral-900">{value}</p>
    </div>
  );
}

function isActiveStatus(status: ExecutionStatus) {
  return status === "queued" || status === "running";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { timeStyle: "medium" }).format(new Date(value));
}

function formatDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt) {
    return "Not started";
  }

  if (!endedAt) {
    return "In progress";
  }

  const durationMs = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1_000).toFixed(1)} s`;
}

function getErrorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Unable to load execution.";
}
