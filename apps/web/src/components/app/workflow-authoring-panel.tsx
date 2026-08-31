import { Braces, Plus, RotateCcw } from "lucide-react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowTemplate } from "@/lib/json-authoring";

export function WorkflowAuthoringPanel({
  definitionText,
  description,
  inputSchemaText,
  isBusy,
  name,
  templates,
  onApplyTemplate,
  onCreateWorkflow,
  onDefinitionTextChange,
  onDescriptionChange,
  onFormatDefinition,
  onFormatInputSchema,
  onInputSchemaTextChange,
  onNameChange,
  onReset
}: {
  definitionText: string;
  description: string;
  inputSchemaText: string;
  isBusy: boolean;
  name: string;
  templates: WorkflowTemplate[];
  onApplyTemplate: (template: WorkflowTemplate) => void;
  onCreateWorkflow: (event: FormEvent<HTMLFormElement>) => void;
  onDefinitionTextChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onFormatDefinition: () => void;
  onFormatInputSchema: () => void;
  onInputSchemaTextChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Workflow</CardTitle>
        <CardDescription>Create a workflow from editable JSON.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={onCreateWorkflow}>
          <div className="grid gap-2">
            <Label>Template</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {templates.map((template) => (
                <Button
                  key={template.label}
                  type="button"
                  variant="outline"
                  title={template.description}
                  onClick={() => onApplyTemplate(template)}
                >
                  <Braces className="size-4" />
                  {template.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
              id="workflow-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="workflow-description">Description</Label>
            <Input
              id="workflow-description"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="workflow-input-schema">Input Schema JSON</Label>
              <Button type="button" variant="ghost" size="sm" onClick={onFormatInputSchema}>
                <Braces className="size-4" />
                Format
              </Button>
            </div>
            <Textarea
              id="workflow-input-schema"
              className="min-h-24 font-mono text-xs"
              value={inputSchemaText}
              onChange={(event) => onInputSchemaTextChange(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="workflow-definition">Definition JSON</Label>
              <Button type="button" variant="ghost" size="sm" onClick={onFormatDefinition}>
                <Braces className="size-4" />
                Format
              </Button>
            </div>
            <Textarea
              id="workflow-definition"
              className="min-h-56 font-mono text-xs"
              value={definitionText}
              onChange={(event) => onDefinitionTextChange(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isBusy}>
              <Plus className="size-4" />
              Create
            </Button>
            <Button type="button" variant="outline" onClick={onReset}>
              <RotateCcw className="size-4" />
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
