"use client";

import { ArrowLeft, ArrowRight, CalendarClock, Check, PlayCircle, Workflow } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { WorkflowEditorScreen } from "@/components/workflow-editor/workflow-editor-screen";
import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getWorkflowTemplate,
  templateToGraph,
  workflowTemplates,
  type WorkflowTemplate
} from "@/lib/workflow-templates";
import { cn } from "@/lib/utils";

type EditorSetup = {
  name: string;
  description: string;
  template: WorkflowTemplate;
};

export function NewWorkflowScreen() {
  const searchParams = useSearchParams();
  const initialTemplate = getWorkflowTemplate(searchParams.get("template"));
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate);
  const [name, setName] = useState(initialTemplate.workflowName);
  const [description, setDescription] = useState(initialTemplate.workflowDescription);
  const [editorSetup, setEditorSetup] = useState<EditorSetup | null>(null);
  const trimmedName = name.trim();

  if (editorSetup) {
    return (
      <WorkflowEditorScreen
        initialNewWorkflow={{
          name: editorSetup.name,
          description: editorSetup.description,
          inputSchema: editorSetup.template.inputSchema,
          graph: templateToGraph(editorSetup.template)
        }}
      />
    );
  }

  function selectTemplate(template: WorkflowTemplate) {
    setSelectedTemplate(template);
    setName(template.workflowName);
    setDescription(template.workflowDescription);
  }

  function openEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedName) {
      setEditorSetup({
        name: trimmedName,
        description: description.trim(),
        template: selectedTemplate
      });
    }
  }

  const iconByTemplate = {
    blank: Workflow,
    "api-health-check": PlayCircle,
    "timed-handoff": CalendarClock
  } as const;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/workflows"
        className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950"
      >
        <ArrowLeft className="size-4" />
        Workflows
      </Link>

      <div className="mt-5 border-b border-neutral-200 pb-5">
        <p className="text-xs font-semibold uppercase text-neutral-500">Workflow setup</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-950">Create a workflow</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choose a starting definition, then configure it in the visual editor.
        </p>
      </div>

      <form className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={openEditor}>
        <section aria-labelledby="template-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 id="template-heading" className="text-sm font-semibold text-neutral-950">
                Starting point
              </h2>
              <p className="mt-0.5 text-xs text-neutral-500">All templates remain fully editable.</p>
            </div>
            <span className="text-xs text-neutral-500">Step 1 of 2</span>
          </div>
          <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
            {workflowTemplates.map((template) => {
              const Icon = iconByTemplate[template.id];
              const isSelected = template.id === selectedTemplate.id;

              return (
                <button
                  key={template.id}
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[40px_minmax(0,1fr)_24px] items-center gap-3 border-b border-neutral-200 px-4 py-4 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-950",
                    isSelected ? "bg-neutral-50" : "bg-white hover:bg-neutral-50"
                  )}
                  aria-pressed={isSelected}
                  onClick={() => selectTemplate(template)}
                >
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-md border",
                      isSelected
                        ? "border-neutral-950 bg-neutral-950 text-white"
                        : "border-neutral-200 bg-neutral-50 text-neutral-600"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-950">{template.name}</span>
                    <span className="mt-1 block text-xs leading-5 text-neutral-600">
                      {template.description}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full border",
                      isSelected
                        ? "border-neutral-950 bg-neutral-950 text-white"
                        : "border-neutral-300 text-transparent"
                    )}
                    aria-hidden="true"
                  >
                    <Check className="size-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="self-start rounded-md border border-neutral-200 bg-white" aria-labelledby="details-heading">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h2 id="details-heading" className="text-sm font-semibold text-neutral-950">
              Workflow details
            </h2>
            <p className="mt-0.5 text-xs text-neutral-500">Name the draft before opening the editor.</p>
          </div>
          <div className="grid gap-4 p-4">
            <div className="grid gap-2">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                aria-invalid={!trimmedName}
                required
              />
              {!trimmedName ? <p className="text-xs text-red-600">A workflow name is required.</p> : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="workflow-description">Description</Label>
              <Textarea
                id="workflow-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                className="min-h-28"
              />
              <p className="text-right text-xs text-neutral-400">{description.length}/500</p>
            </div>
            <InlineNotice variant="info">
              The workflow remains local until you save its first immutable draft.
            </InlineNotice>
          </div>
          <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-4 py-3">
            <Button type="submit" disabled={!trimmedName}>
              Open editor
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      </form>
    </main>
  );
}
