"use client";

import type {
  ExecutionResponse,
  ExecutionStatus,
  WorkflowDetailResponse
} from "@execloom/contracts";
import { ArrowRight, History, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { WorkflowPageHeader } from "@/components/workflows/workflow-page-header";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, getWorkflow, listWorkflowExecutions } from "@/lib/api";
import { cn } from "@/lib/utils";

const executionPollIntervalMs = 3_000;
const statusFilters: Array<ExecutionStatus | "all"> = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled"
];

export function ExecutionHistoryScreen({ workflowId }: { workflowId: string }) {
  const { accessToken } = useAuth();
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutions = useCallback(
    async ({ cursor, silent = false }: { cursor?: string; silent?: boolean } = {}) => {
      if (!accessToken) {
        return;
      }

      if (!silent) {
        setIsRefreshing(true);
      }

      try {
        const page = await listWorkflowExecutions(accessToken, workflowId, {
          cursor,
          status: statusFilter === "all" ? undefined : statusFilter
        });
        setExecutions((current) => (cursor ? [...current, ...page.executions] : page.executions));
        setNextCursor(page.nextCursor);
        setError(null);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        if (!silent) {
          setIsRefreshing(false);
        }
      }
    },
    [accessToken, statusFilter, workflowId]
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.all([
      getWorkflow(accessToken, workflowId),
      listWorkflowExecutions(accessToken, workflowId, {
        status: statusFilter === "all" ? undefined : statusFilter
      })
    ])
      .then(([detail, page]) => {
        if (!cancelled) {
          setWorkflowDetail(detail);
          setExecutions(page.executions);
          setNextCursor(page.nextCursor);
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
  }, [accessToken, statusFilter, workflowId]);

  const hasActiveExecution = executions.some((execution) =>
    isActiveStatus(execution.status)
  );

  useEffect(() => {
    if (!hasActiveExecution) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    async function poll() {
      await fetchExecutions({ silent: true });

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
  }, [fetchExecutions, hasActiveExecution]);

  const versionNumberById = useMemo(
    () =>
      new Map(
        workflowDetail?.versions.map((version) => [version.id, version.versionNo]) ?? []
      ),
    [workflowDetail]
  );

  if (isLoading) {
    return <LoadingScreen label="Loading executions" />;
  }

  if (!workflowDetail) {
    return <ErrorScreen message={error ?? "Workflow could not be loaded."} />;
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-neutral-50 xl:min-h-screen">
      <WorkflowPageHeader
        workflow={workflowDetail.workflow}
        activeSection="executions"
        meta={`${executions.length} ${executions.length === 1 ? "execution" : "executions"} loaded`}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={isRefreshing}
          onClick={() => void fetchExecutions()}
        >
          <RefreshCw className={cn("size-4", isRefreshing ? "animate-spin" : "")} />
          Refresh
        </Button>
      </WorkflowPageHeader>

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-lg font-semibold text-neutral-950">Execution history</p>
            <p className="mt-1 text-sm text-neutral-600">
              Inspect status, version, timing, output, and errors for each run.
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-1 rounded-md border border-neutral-200 bg-white p-1 sm:flex sm:w-auto">
            {statusFilters.map((filter) => (
              <button
                key={filter}
                type="button"
                className={cn(
                  "h-7 min-w-0 rounded px-2 text-xs font-medium capitalize sm:px-2.5",
                  filter === statusFilter
                    ? "bg-neutral-950 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                )}
                onClick={() => setStatusFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {error ? <InlineNotice variant="error" className="mt-4">{error}</InlineNotice> : null}

        <div className="mt-5 overflow-hidden rounded-md border border-neutral-200 bg-white">
          <div className="hidden grid-cols-[minmax(220px,1fr)_120px_100px_180px_44px] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500 md:grid">
            <span>Execution</span>
            <span>Status</span>
            <span>Version</span>
            <span>Created</span>
            <span className="sr-only">Open</span>
          </div>
          {executions.length === 0 ? (
            <EmptyState icon={History} title="No executions found" description={statusFilter === "all" ? "Run the published workflow to create its first execution." : `No ${statusFilter} executions match this filter.`} />
          ) : (
            executions.map((execution) => (
              <Link
                key={execution.id}
                href={`/workflows/${workflowId}/executions/${execution.id}`}
                className="grid gap-3 border-b border-neutral-200 px-4 py-4 last:border-b-0 hover:bg-neutral-50 md:grid-cols-[minmax(220px,1fr)_120px_100px_180px_44px] md:items-center md:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-neutral-800">{execution.id}</p>
                  <p className="mt-1 text-xs text-neutral-500">{execution.triggerType}</p>
                </div>
                <div className="flex items-center justify-between md:block">
                  <span className="text-xs text-neutral-500 md:hidden">Status</span>
                  <StatusBadge status={execution.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-700 md:block">
                  <span className="text-neutral-500 md:hidden">Version</span>
                  <span>v{versionNumberById.get(execution.workflowVersionId) ?? "?"}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-600 md:block">
                  <span className="text-neutral-500 md:hidden">Created</span>
                  <span>{formatDate(execution.createdAt)}</span>
                </div>
                <ArrowRight className="hidden size-4 text-neutral-400 md:block" />
              </Link>
            ))
          )}
        </div>

        {nextCursor ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              disabled={isRefreshing}
              onClick={() => void fetchExecutions({ cursor: nextCursor })}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </main>
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

function getErrorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "Unable to load executions.";
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="grid min-h-[520px] place-items-center">
      <LoaderCircle className="size-5 animate-spin text-neutral-500" aria-label={label} />
    </main>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="grid min-h-[520px] place-items-center p-6 text-center">
      <div>
        <p className="text-sm font-medium text-neutral-950">Unable to open execution history</p>
        <p className="mt-1 text-sm text-neutral-600">{message}</p>
        <Link href="/workflows" className="mt-4 inline-flex text-sm font-medium underline">
          Back to workflows
        </Link>
      </div>
    </main>
  );
}
