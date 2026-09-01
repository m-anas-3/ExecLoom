"use client";

import type { StepRunResponse, WorkflowStepDefinition } from "@execloom/contracts";
import { AlertCircle, Clock3, Globe2, Minus, Play } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { getStatusPresentation } from "@/lib/status-presentation";
import { cn } from "@/lib/utils";

export type WorkflowStepNodeData = {
  step: WorkflowStepDefinition;
  executionStatus?: StepRunResponse["status"];
  validationMessage?: string;
} & Record<string, unknown>;

export type WorkflowStepFlowNode = Node<WorkflowStepNodeData, "workflowStep">;
export type StartFlowNode = Node<Record<string, never>, "workflowStart">;

const typeStyle = {
  noop: { icon: Minus, iconClassName: "border-sky-200 bg-sky-50 text-sky-700", label: "No-op" },
  delay: { icon: Clock3, iconClassName: "border-amber-200 bg-amber-50 text-amber-700", label: "Delay" },
  http: { icon: Globe2, iconClassName: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "HTTP Request" }
} as const;

export function WorkflowStepNode({ data, selected, dragging }: NodeProps<WorkflowStepFlowNode>) {
  const style = typeStyle[data.step.type];
  const Icon = style.icon;
  const hasError = Boolean(data.validationMessage);

  return (
    <div
      className={cn(
        "group relative flex h-[76px] w-[224px] items-center gap-3 rounded-md border bg-white px-3 shadow-sm transition-[border-color,box-shadow,transform]",
        hasError
          ? "border-red-400 shadow-[0_0_0_2px_rgba(248,113,113,0.13)]"
          : selected
            ? "border-neutral-950 shadow-[0_0_0_2px_rgba(23,23,23,0.12)]"
            : "border-neutral-300 hover:border-neutral-400 hover:shadow-md",
        dragging && "scale-[1.01] cursor-grabbing shadow-lg"
      )}
      data-testid="workflow-step-node"
      data-step-key={data.step.key}
      title={data.validationMessage}
    >
      <Handle type="target" position={Position.Left} className="!size-3 !border-2 !border-white !bg-neutral-500 transition-transform group-hover:!scale-110" />
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border", style.iconClassName)}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-950">{data.step.name || data.step.key}</span>
        <span className="mt-0.5 block truncate text-xs text-neutral-500">{style.label}</span>
      </span>
      {hasError ? (
        <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border-2 border-white bg-red-100 text-red-700" aria-label={data.validationMessage}>
          <AlertCircle className="size-3.5" />
        </span>
      ) : data.executionStatus ? <StepStatus status={data.executionStatus} /> : null}
      <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-white !bg-neutral-500 transition-transform group-hover:!scale-110" />
    </div>
  );
}

export function WorkflowStartNode({ selected }: NodeProps<StartFlowNode>) {
  return (
    <div
      className={cn(
        "group flex h-[64px] w-[176px] items-center gap-3 rounded-md border bg-neutral-950 px-3 text-white shadow-sm transition-[border-color,box-shadow]",
        selected ? "border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.25)]" : "border-neutral-800 hover:border-neutral-600"
      )}
      data-testid="workflow-start-node"
    >
      <span className="grid size-8 place-items-center rounded-md bg-white/10"><Play className="size-4 fill-current" /></span>
      <span><span className="block text-sm font-semibold">Start</span><span className="block text-xs text-neutral-400">Trigger input</span></span>
      <Handle type="source" position={Position.Right} className="!size-3 !border-2 !border-neutral-950 !bg-sky-400 transition-transform group-hover:!scale-110" />
    </div>
  );
}

function StepStatus({ status }: { status: StepRunResponse["status"] }) {
  const config = getStatusPresentation(status);
  const Icon = config.icon;

  return (
    <span className={cn("absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border-2 border-white bg-white", config.iconClassName)} title={config.label} aria-label={config.label}>
      <Icon className={cn("size-3.5", status === "running" || status === "retrying" ? "animate-spin" : "")} />
    </span>
  );
}
