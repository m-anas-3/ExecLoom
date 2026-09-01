"use client";

import type { WorkflowResponse } from "@execloom/contracts";
import {
  ArrowRight,
  CalendarClock,
  CirclePlus,
  LoaderCircle,
  PlayCircle,
  Search,
  Workflow
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, listWorkflows } from "@/lib/api";
import { workflowTemplates } from "@/lib/workflow-templates";

export function WorkflowLibrary() {
  const { accessToken } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflows = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await listWorkflows(accessToken);
      setWorkflows(response.workflows);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const filteredWorkflows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return workflows;
    }

    return workflows.filter((workflowItem) =>
      [workflowItem.name, workflowItem.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, workflows]);

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col justify-between gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-neutral-500">Automation workspace</p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Workflows</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Build, publish, and inspect your automation pipelines.
          </p>
        </div>
        <Link
          href="/workflows/new"
          className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 sm:self-auto"
        >
          <CirclePlus className="size-4" />
          New workflow
        </Link>
      </div>

      {error ? (
        <InlineNotice
          variant="error"
          title="Workflows could not be loaded"
          className="mt-5"
          action={
            <Button variant="outline" size="sm" onClick={() => void loadWorkflows()}>
              Retry
            </Button>
          }
        >
          {error}
        </InlineNotice>
      ) : null}

      {isLoading ? (
        <WorkflowTableSkeleton />
      ) : workflows.length === 0 ? (
        <EmptyWorkflowLibrary />
      ) : (
        <section className="mt-5" aria-label="Workflow library">
          <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search by name or description"
                aria-label="Search workflows"
              />
            </div>
            <p className="text-xs text-neutral-500" aria-live="polite">
              Showing {filteredWorkflows.length} of {workflows.length}
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
            <div className="hidden grid-cols-[minmax(240px,1fr)_130px_150px_180px_28px] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-medium text-neutral-500 md:grid">
              <span>Workflow</span>
              <span>Status</span>
              <span>Active version</span>
              <span>Last updated</span>
              <span className="sr-only">Open</span>
            </div>
            {filteredWorkflows.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No matching workflows"
                description={`No workflows match “${query}”. Try another name or description.`}
                className="min-h-56"
              />
            ) : (
              filteredWorkflows.map((workflowItem) => (
                <WorkflowRow key={workflowItem.id} workflow={workflowItem} />
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function WorkflowRow({ workflow }: { workflow: WorkflowResponse }) {
  return (
    <Link
      href={`/workflows/${workflow.id}`}
      className="group grid gap-3 border-b border-neutral-200 px-4 py-4 transition-colors last:border-b-0 hover:bg-neutral-50 focus-visible:bg-sky-50 focus-visible:outline-none md:grid-cols-[minmax(240px,1fr)_130px_150px_180px_28px] md:items-center md:gap-4"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-950">{workflow.name}</p>
        <p className="mt-1 truncate text-xs text-neutral-500">
          {workflow.description || "No description"}
        </p>
      </div>
      <RowField label="Status">
        <StatusBadge status={workflow.status} />
      </RowField>
      <RowField label="Active version">
        <span className="text-xs text-neutral-700">
          {workflow.activeVersionNo ? `Version ${workflow.activeVersionNo}` : "Not published"}
        </span>
      </RowField>
      <RowField label="Last updated">
        <span className="text-xs text-neutral-600">{formatDate(workflow.updatedAt)}</span>
      </RowField>
      <ArrowRight className="hidden size-4 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-700 md:block" />
    </Link>
  );
}

function RowField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 md:block">
      <span className="text-xs text-neutral-500 md:hidden">{label}</span>
      {children}
    </div>
  );
}

function EmptyWorkflowLibrary() {
  const iconByTemplate = {
    blank: Workflow,
    "api-health-check": PlayCircle,
    "timed-handoff": CalendarClock
  } as const;

  return (
    <section className="mt-12">
      <EmptyState
        icon={Workflow}
        title="Create your first workflow"
        description="Start with an empty chain or use a focused template with working step configuration."
        className="pb-7"
      />
      <div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-3">
        {workflowTemplates.map((template) => {
          const Icon = iconByTemplate[template.id];

          return (
            <Link
              key={template.id}
              href={`/workflows/new?template=${template.id}`}
              className="group rounded-md border border-neutral-200 bg-white p-4 transition-colors hover:border-brand/50 hover:bg-brand-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-neutral-200 bg-neutral-50 text-neutral-700">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-950">{template.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-neutral-600">
                    {template.description}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowTableSkeleton() {
  return (
    <div className="mt-5" aria-label="Loading workflows">
      <div className="mb-3 flex justify-between gap-3">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="hidden h-4 w-20 sm:block" />
      </div>
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <Skeleton className="h-3 w-28" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-neutral-200 px-4 py-4 last:border-0">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="hidden h-6 w-20 md:block" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="hidden h-4 w-32 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Unable to load workflows.";
}
