"use client";

import type {
  CredentialResponse,
  HttpStepMethod,
  WorkflowStepDefinition
} from "@execloom/contracts";
import { Braces, Plus, Settings2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatJson } from "@/lib/json-authoring";
import { startNodeId, type WorkflowGraphNode } from "@/lib/workflow-graph";

const methodOptions: HttpStepMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function WorkflowInspector({
  credentials = [],
  credentialsError,
  selectedNode,
  selectedNodeId,
  inputSchemaText,
  inputSchemaError,
  readOnly = false,
  issues = [],
  onBodyErrorChange,
  onClose,
  onDeleteNode,
  onInputSchemaChange,
  onUpdateStep
}: {
  credentials?: CredentialResponse[];
  credentialsError?: string | null;
  selectedNode: WorkflowGraphNode | null;
  selectedNodeId: string | null;
  inputSchemaText: string;
  inputSchemaError: string | null;
  readOnly?: boolean;
  issues?: string[];
  onBodyErrorChange?: (error: string | null) => void;
  onClose?: () => void;
  onDeleteNode?: (nodeId: string) => void;
  onInputSchemaChange?: (value: string) => void;
  onUpdateStep?: (nodeId: string, step: WorkflowStepDefinition) => void;
}) {
  const showWorkflowSettings = !selectedNode || selectedNodeId === startNodeId;

  useEffect(() => {
    if (showWorkflowSettings) {
      onBodyErrorChange?.(null);
    }
  }, [onBodyErrorChange, showWorkflowSettings]);

  return (
    <aside className="h-full overflow-y-auto border-l border-neutral-200 bg-white" aria-label="Configuration inspector">
      <div className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-neutral-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <Settings2 className="size-4 text-neutral-500" />
          <p className="text-sm font-semibold text-neutral-900">
            {showWorkflowSettings ? "Workflow settings" : "Step configuration"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!readOnly && selectedNode && onDeleteNode ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-neutral-500 hover:text-red-600"
              aria-label="Delete selected step"
              title="Delete step"
              onClick={() => onDeleteNode(selectedNode.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          {onClose ? (
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Close inspector" onClick={onClose}>
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      {issues.length > 0 ? (
        <InlineNotice variant="error" title="Configuration required" className="m-4 mb-0">
          {issues[0]}
          {issues.length > 1 ? ` (+${issues.length - 1} more)` : ""}
        </InlineNotice>
      ) : null}

      {showWorkflowSettings ? (
        <WorkflowSettings
          inputSchemaText={inputSchemaText}
          inputSchemaError={inputSchemaError}
          readOnly={readOnly}
          onInputSchemaChange={onInputSchemaChange}
        />
      ) : selectedNode ? (
        <StepFields
          key={selectedNode.id}
          credentials={credentials}
          credentialsError={credentialsError}
          node={selectedNode}
          readOnly={readOnly}
          onBodyErrorChange={onBodyErrorChange}
          onUpdateStep={onUpdateStep}
        />
      ) : null}
    </aside>
  );
}

function WorkflowSettings({
  inputSchemaText,
  inputSchemaError,
  readOnly,
  onInputSchemaChange
}: {
  inputSchemaText: string;
  inputSchemaError: string | null;
  readOnly: boolean;
  onInputSchemaChange?: (value: string) => void;
}) {
  function formatInputSchema() {
    if (!onInputSchemaChange) {
      return;
    }

    try {
      onInputSchemaChange(formatJson(JSON.parse(inputSchemaText)));
    } catch {
      // The visible validation message already identifies invalid JSON.
    }
  }

  return (
    <div className="grid gap-5 p-4">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <p className="text-sm font-medium text-neutral-900">Start</p>
        <p className="mt-1 text-xs leading-5 text-neutral-600">
          Receives the execution input and begins the ordered step chain.
        </p>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="workflow-input-schema">Input schema (JSON)</Label>
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={formatInputSchema}
              disabled={Boolean(inputSchemaError)}
            >
              <Braces className="size-3.5" />
              Format
            </Button>
          ) : null}
        </div>
        <Textarea
          id="workflow-input-schema"
          className="min-h-52 resize-y font-mono text-xs leading-5"
          value={inputSchemaText}
          readOnly={readOnly}
          onChange={(event) => onInputSchemaChange?.(event.target.value)}
          aria-invalid={Boolean(inputSchemaError)}
        />
        {inputSchemaError ? <p className="text-xs text-red-600">{inputSchemaError}</p> : null}
      </div>
    </div>
  );
}

function StepFields({
  credentials,
  credentialsError,
  node,
  readOnly,
  onBodyErrorChange,
  onUpdateStep
}: {
  credentials: CredentialResponse[];
  credentialsError?: string | null;
  node: WorkflowGraphNode;
  readOnly: boolean;
  onBodyErrorChange?: (error: string | null) => void;
  onUpdateStep?: (nodeId: string, step: WorkflowStepDefinition) => void;
}) {
  const step = node.step;

  function updateStep(nextStep: WorkflowStepDefinition) {
    if (!readOnly) {
      onUpdateStep?.(node.id, nextStep);
    }
  }

  function updateRetry(field: "maxAttempts" | "backoffMs", value: number) {
    updateStep({
      ...step,
      retry: {
        ...step.retry,
        [field]: value
      }
    });
  }

  return (
    <div className="grid gap-5 p-4">
      <div className="grid gap-2">
        <Label htmlFor="step-name">Display name</Label>
        <Input
          id="step-name"
          value={step.name ?? ""}
          maxLength={120}
          readOnly={readOnly}
          onChange={(event) => updateStep({ ...step, name: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="step-key">Stable key</Label>
        <Input id="step-key" value={step.key} readOnly className="font-mono text-xs" />
        <p className="text-xs leading-5 text-neutral-500">
          Used to match step runs across execution events.
        </p>
      </div>

      {step.type === "delay" ? (
        <div className="grid gap-2">
          <Label htmlFor="delay-ms">Duration (milliseconds)</Label>
          <Input
            id="delay-ms"
            type="number"
            min={0}
            max={30_000}
            step={100}
            value={step.config.ms ?? 0}
            readOnly={readOnly}
            onChange={(event) =>
              updateStep({
                ...step,
                config: { ...step.config, ms: Number(event.target.value) }
              })
            }
          />
        </div>
      ) : null}

      {step.type === "http" ? (
        <HttpFields
          credentials={credentials}
          credentialsError={credentialsError}
          step={step}
          readOnly={readOnly}
          onBodyErrorChange={onBodyErrorChange}
          onUpdate={updateStep}
        />
      ) : null}

      <div className="border-t border-neutral-200 pt-5">
        <p className="mb-3 text-xs font-semibold uppercase text-neutral-500">Retry policy</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="retry-attempts">Attempts</Label>
            <Input
              id="retry-attempts"
              type="number"
              min={1}
              max={10}
              value={step.retry.maxAttempts}
              readOnly={readOnly}
              onChange={(event) => updateRetry("maxAttempts", Number(event.target.value))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="retry-backoff">Backoff (ms)</Label>
            <Input
              id="retry-backoff"
              type="number"
              min={0}
              max={300_000}
              step={100}
              value={step.retry.backoffMs}
              readOnly={readOnly}
              onChange={(event) => updateRetry("backoffMs", Number(event.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

type HttpStep = Extract<WorkflowStepDefinition, { type: "http" }>;

function HttpFields({
  credentials,
  credentialsError,
  step,
  readOnly,
  onBodyErrorChange,
  onUpdate
}: {
  credentials: CredentialResponse[];
  credentialsError?: string | null;
  step: HttpStep;
  readOnly: boolean;
  onBodyErrorChange?: (error: string | null) => void;
  onUpdate: (step: HttpStep) => void;
}) {
  const initialBody = useMemo(
    () => (step.config.body === undefined ? "" : formatJson(step.config.body)),
    [step.config.body]
  );
  const [bodyText, setBodyText] = useState(initialBody);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const headers = Object.entries(step.config.headers);
  const selectedCredentialAvailable =
    !step.config.credentialId || credentials.some(({ id }) => id === step.config.credentialId);

  useEffect(() => {
    return () => onBodyErrorChange?.(null);
  }, [onBodyErrorChange]);

  function updateConfig(config: HttpStep["config"]) {
    onUpdate({ ...step, config });
  }

  function updateBody(value: string) {
    setBodyText(value);

    if (!value.trim()) {
      const { body: _body, ...configWithoutBody } = step.config;
      setBodyError(null);
      onBodyErrorChange?.(null);
      updateConfig(configWithoutBody);
      return;
    }

    try {
      const body: unknown = JSON.parse(value);
      setBodyError(null);
      onBodyErrorChange?.(null);
      updateConfig({ ...step.config, body });
    } catch {
      const error = "Request body must be valid JSON.";
      setBodyError(error);
      onBodyErrorChange?.(error);
    }
  }

  function updateHeader(index: number, nextKey: string, nextValue: string) {
    const headerEntries: Array<[string, string]> = headers.map(
      ([key, value], headerIndex) =>
        headerIndex === index ? [nextKey, nextValue] : [key, value]
    );
    const nextHeaders = Object.fromEntries(headerEntries);

    updateConfig({ ...step.config, headers: nextHeaders });
  }

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="http-method">Method</Label>
        <select
          id="http-method"
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-neutral-950 disabled:opacity-60"
          value={step.config.method}
          disabled={readOnly}
          onChange={(event) =>
            updateConfig({ ...step.config, method: event.target.value as HttpStepMethod })
          }
        >
          {methodOptions.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="http-url">URL</Label>
        <Input
          id="http-url"
          type="url"
          value={step.config.url}
          readOnly={readOnly}
          onChange={(event) => updateConfig({ ...step.config, url: event.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="http-timeout">Timeout (milliseconds)</Label>
        <Input
          id="http-timeout"
          type="number"
          min={1}
          max={60_000}
          step={100}
          value={step.config.timeoutMs}
          readOnly={readOnly}
          onChange={(event) =>
            updateConfig({ ...step.config, timeoutMs: Number(event.target.value) })
          }
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="http-credential">Credential</Label>
        <select
          id="http-credential"
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-brand disabled:bg-neutral-100 disabled:opacity-60"
          value={step.config.credentialId ?? ""}
          disabled={readOnly || Boolean(credentialsError)}
          onChange={(event) => {
            if (!event.target.value) {
              const { credentialId: _credentialId, ...configWithoutCredential } = step.config;
              updateConfig(configWithoutCredential);
              return;
            }

            updateConfig({ ...step.config, credentialId: event.target.value });
          }}
        >
          <option value="">No credential</option>
          {!selectedCredentialAvailable && step.config.credentialId ? (
            <option value={step.config.credentialId}>Unavailable credential</option>
          ) : null}
          {credentials.map((credential) => (
            <option key={credential.id} value={credential.id}>
              {credential.name} · {credential.type === "api_key" ? "API key" : "Bearer token"}
            </option>
          ))}
        </select>
        {credentialsError ? (
          <p className="text-xs text-red-600">Credentials could not be loaded. Existing selection is preserved.</p>
        ) : (
          <p className="text-xs leading-5 text-neutral-500">
            The encrypted secret is resolved by the worker when this step runs.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label>Headers</Label>
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                let key = "header";
                let suffix = 2;

                while (key in step.config.headers) {
                  key = `header-${suffix}`;
                  suffix += 1;
                }

                updateConfig({
                  ...step.config,
                  headers: { ...step.config.headers, [key]: "" }
                });
              }}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          ) : null}
        </div>
        {headers.length === 0 ? (
          <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-center text-xs text-neutral-500">
            No headers
          </p>
        ) : (
          <div className="grid gap-2">
            {headers.map(([key, value], index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                <Input
                  value={key}
                  readOnly={readOnly}
                  aria-label={`Header ${index + 1} name`}
                  onChange={(event) => updateHeader(index, event.target.value, value)}
                />
                <Input
                  value={value}
                  readOnly={readOnly}
                  aria-label={`Header ${index + 1} value`}
                  onChange={(event) => updateHeader(index, key, event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-neutral-500 hover:text-red-600"
                  disabled={readOnly}
                  aria-label={`Remove header ${key}`}
                  title="Remove header"
                  onClick={() => {
                    const nextHeaders = { ...step.config.headers };
                    delete nextHeaders[key];
                    updateConfig({ ...step.config, headers: nextHeaders });
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="http-body">Body (JSON, optional)</Label>
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              disabled={Boolean(bodyError) || !bodyText.trim()}
              onClick={() => {
                try {
                  setBodyText(formatJson(JSON.parse(bodyText)));
                } catch {
                  // The body validation message remains visible.
                }
              }}
            >
              <Braces className="size-3.5" />
              Format
            </Button>
          ) : null}
        </div>
        <Textarea
          id="http-body"
          className="min-h-36 resize-y font-mono text-xs leading-5"
          placeholder="{}"
          value={bodyText}
          readOnly={readOnly}
          onChange={(event) => updateBody(event.target.value)}
          aria-invalid={Boolean(bodyError)}
        />
        {bodyError ? <p className="text-xs text-red-600">{bodyError}</p> : null}
      </div>
    </>
  );
}
