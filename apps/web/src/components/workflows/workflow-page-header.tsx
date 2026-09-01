"use client";

import type { WorkflowResponse } from "@execloom/contracts";
import { ArrowLeft, Workflow } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/app/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type WorkflowSection = "editor" | "executions" | "versions";

export function WorkflowPageHeader({
  workflow,
  activeSection,
  meta,
  children
}: {
  workflow: Pick<WorkflowResponse, "name" | "description" | "status"> & { id: string | null };
  activeSection: WorkflowSection;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  const sections = workflow.id
    ? [
        { id: "editor" as const, label: "Editor", href: `/workflows/${workflow.id}` },
        {
          id: "executions" as const,
          label: "Executions",
          href: `/workflows/${workflow.id}/executions`
        },
        { id: "versions" as const, label: "Versions", href: `/workflows/${workflow.id}/versions` }
      ]
    : [];

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/workflows"
              className="grid size-9 shrink-0 place-items-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Back to workflows"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>Back to workflows</TooltipContent>
        </Tooltip>

        <div className="min-w-0 flex-[1_1_220px]">
          <div className="flex min-w-0 items-center gap-2">
            <Workflow className="size-4 shrink-0 text-brand" />
            <h1 className="truncate text-sm font-semibold text-neutral-950">{workflow.name}</h1>
            <StatusBadge status={workflow.status} />
          </div>
          <div className="mt-1 truncate text-xs text-neutral-500">
            {meta ?? workflow.description ?? "No description"}
          </div>
        </div>

        {sections.length > 0 ? (
          <nav
            className="order-3 flex w-full items-center gap-1 border-t border-neutral-200 pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0"
            aria-label="Workflow navigation"
          >
            {sections.map((section) => (
              <Link
                key={section.id}
                href={section.href}
                aria-current={activeSection === section.id ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                  activeSection === section.id
                    ? "bg-neutral-100 text-neutral-950"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950"
                )}
              >
                {section.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {children ? <div className="order-2 ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:order-none sm:w-auto">{children}</div> : null}
      </div>
    </header>
  );
}
