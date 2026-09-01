"use client";

import type { WorkflowStepType } from "@execloom/contracts";
import { Clock3, Globe2, Minus, Plus, X } from "lucide-react";
import { useEffect, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export const workflowStepDragType = "application/execloom-workflow-step";

const stepOptions = [
  {
    type: "noop" as const,
    label: "No-op",
    description: "Pass input to the next step without changing it.",
    icon: Minus,
    color: "border-sky-200 bg-sky-50 text-sky-700"
  },
  {
    type: "delay" as const,
    label: "Delay",
    description: "Pause the execution for a fixed duration.",
    icon: Clock3,
    color: "border-amber-200 bg-amber-50 text-amber-700"
  },
  {
    type: "http" as const,
    label: "HTTP Request",
    description: "Call an external HTTP endpoint and store its response.",
    icon: Globe2,
    color: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
] as const;

export function NodePalette({
  open,
  onOpenChange,
  onAddStep
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddStep: (type: WorkflowStepType) => void;
}) {
  const isMobile = useMediaQuery("(max-width: 639px)");

  useEffect(() => {
    if (!open || isMobile !== false) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isMobile, onOpenChange, open]);

  function addStep(type: WorkflowStepType) {
    onAddStep(type);
    onOpenChange(false);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="shadow-md"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => onOpenChange(!open)}
      >
        <Plus className="size-4" />
        Add step
      </Button>

      {isMobile === false && open ? (
        <div
          role="dialog"
          aria-label="Add workflow step"
          className="absolute bottom-12 left-0 z-20 w-[300px] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-xl"
        >
          <div className="flex items-start justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-950">Add a step</p>
              <p className="mt-0.5 text-xs text-neutral-500">Appends to the current workflow chain.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-1 size-8"
              aria-label="Close step picker"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <StepOptions onAddStep={addStep} />
        </div>
      ) : null}

      {isMobile ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="max-h-[82vh] gap-0 overflow-y-auto rounded-t-lg bg-white p-0">
            <SheetHeader className="border-b border-neutral-200 pr-12 text-left">
              <SheetTitle className="text-sm text-neutral-950">Add a step</SheetTitle>
              <SheetDescription className="text-xs text-neutral-500">
                Select a step to append to the workflow chain.
              </SheetDescription>
            </SheetHeader>
            <StepOptions onAddStep={addStep} />
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}

function StepOptions({ onAddStep }: { onAddStep: (type: WorkflowStepType) => void }) {
  function startDrag(event: DragEvent<HTMLButtonElement>, type: WorkflowStepType) {
    event.dataTransfer.setData(workflowStepDragType, type);
    event.dataTransfer.effectAllowed = "move";
  }

  return (
    <div className="grid gap-1 p-2">
      {stepOptions.map((option) => {
        const Icon = option.icon;

        return (
          <button
            key={option.type}
            type="button"
            draggable
            className="flex w-full items-center gap-3 rounded-md border border-transparent p-2.5 text-left transition-colors hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950"
            aria-label={`Add ${option.label} step`}
            onClick={() => onAddStep(option.type)}
            onDragStart={(event) => startDrag(event, option.type)}
          >
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border", option.color)}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-neutral-950">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-4 text-neutral-500">
                {option.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
