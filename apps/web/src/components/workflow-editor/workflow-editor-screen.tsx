"use client";

import {
  workflowDefinitionSchema,
  type CredentialResponse,
  type WorkflowDetailResponse,
  type WorkflowStepDefinition,
  type WorkflowStepType,
  type WorkflowVersionResponse
} from "@execloom/contracts";
import {
  AlertCircle,
  Check,
  LoaderCircle,
  Play,
  Save,
  Settings2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";

import { NodePalette } from "@/components/workflow-editor/node-palette";
import { RunWorkflowDialog } from "@/components/workflow-editor/run-workflow-dialog";
import { WorkflowCanvas } from "@/components/workflow-editor/workflow-canvas";
import { WorkflowInspector } from "@/components/workflow-editor/workflow-inspector";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { WorkflowPageHeader } from "@/components/workflows/workflow-page-header";
import { useAuth } from "@/contexts/auth-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  ApiError,
  createWorkflow,
  createWorkflowVersion,
  getWorkflow,
  listCredentials,
  publishWorkflow,
  triggerWorkflow
} from "@/lib/api";
import { formatJson, parseJsonObject } from "@/lib/json-authoring";
import {
  appendStepToGraph,
  compileWorkflowGraph,
  createWorkflowStep,
  definitionToWorkflowGraph,
  removeStepFromGraph,
  startNodeId,
  type CanvasPosition,
  type WorkflowGraph,
  type WorkflowGraphIssue
} from "@/lib/workflow-graph";

type NewWorkflowInput = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  graph: WorkflowGraph;
};

export function WorkflowEditorScreen({
  workflowId,
  initialNewWorkflow
}: {
  workflowId?: string;
  initialNewWorkflow?: NewWorkflowInput;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const baseVersionId = searchParams.get("baseVersion");
  const { accessToken } = useAuth();
  const [currentWorkflowId, setCurrentWorkflowId] = useState(workflowId ?? null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [loadedVersionId, setLoadedVersionId] = useState<string | null>(null);
  const [name] = useState(initialNewWorkflow?.name ?? "");
  const [description] = useState(initialNewWorkflow?.description ?? "");
  const [graph, setGraph] = useState<WorkflowGraph>(
    initialNewWorkflow?.graph ?? { nodes: [], edges: [] }
  );
  const [inputSchemaText, setInputSchemaText] = useState(
    formatJson(initialNewWorkflow?.inputSchema ?? {})
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [stepPickerOpen, setStepPickerOpen] = useState(false);
  const [baselineFingerprint, setBaselineFingerprint] = useState<string | null>(null);
  const [connectionIssues, setConnectionIssues] = useState<WorkflowGraphIssue[]>([]);
  const [bodyEditorError, setBodyEditorError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(workflowId));
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<CredentialResponse[]>([]);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  const hydrateVersion = useCallback(
    (detail: WorkflowDetailResponse, version: WorkflowVersionResponse, forceNewDraft = false) => {
      const nextGraph = definitionToWorkflowGraph(version.definition);
      const nextInputSchemaText = formatJson(version.inputSchema);
      const fingerprint = createFingerprint(nextGraph, nextInputSchemaText);

      setWorkflowDetail(detail);
      setGraph(nextGraph);
      setInputSchemaText(nextInputSchemaText);
      setLoadedVersionId(version.id);
      setSelectedNodeId(null);
      setConnectionIssues([]);
      setBodyEditorError(null);
      setBaselineFingerprint(forceNewDraft ? null : fingerprint);
    },
    []
  );

  useEffect(() => {
    if (!workflowId || !accessToken) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setRequestError(null);

    void getWorkflow(accessToken, workflowId)
      .then((detail) => {
        if (cancelled) {
          return;
        }

        const version = selectEditorVersion(detail, baseVersionId);

        if (!version) {
          throw new Error("Workflow does not have a version to edit.");
        }

        setCurrentWorkflowId(workflowId);
        hydrateVersion(detail, version, Boolean(baseVersionId));
      })
      .catch((error) => {
        if (!cancelled) {
          setRequestError(getErrorMessage(error));
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
  }, [accessToken, baseVersionId, hydrateVersion, workflowId]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    void listCredentials(accessToken)
      .then((response) => {
        if (!cancelled) {
          setCredentials(response.credentials);
          setCredentialsError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCredentialsError(getErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const compiled = useMemo(() => compileWorkflowGraph(graph), [graph]);
  const inputSchemaResult = useMemo(() => parseInputSchema(inputSchemaText), [inputSchemaText]);
  const definitionResult = useMemo(
    () =>
      compiled.definition
        ? workflowDefinitionSchema.safeParse(compiled.definition)
        : { success: false as const, error: null },
    [compiled.definition]
  );
  const currentFingerprint = useMemo(
    () => createFingerprint(graph, inputSchemaText),
    [graph, inputSchemaText]
  );
  const isDirty = baselineFingerprint !== currentFingerprint;
  const validationMessages = useMemo(() => {
    const messages = [
      ...connectionIssues.map((issue) => issue.message),
      ...compiled.issues.map((issue) => issue.message)
    ];

    if (inputSchemaResult.error) {
      messages.push(inputSchemaResult.error);
    }

    if (bodyEditorError) {
      messages.push(bodyEditorError);
    }

    if (!definitionResult.success && definitionResult.error) {
      messages.push(
        ...definitionResult.error.issues.slice(0, 3).map((issue) => {
          const path = issue.path.length > 0 ? issue.path.join(".") : "Definition";
          return `${path}: ${issue.message}`;
        })
      );
    }

    return [...new Set(messages)];
  }, [bodyEditorError, compiled.issues, connectionIssues, definitionResult, inputSchemaResult.error]);
  const isValid = validationMessages.length === 0 && Boolean(compiled.definition);
  const loadedVersion = workflowDetail?.versions.find((version) => version.id === loadedVersionId) ?? null;
  const activeVersion =
    workflowDetail?.versions.find(
      (version) => version.id === workflowDetail.workflow.activeVersionId
    ) ?? null;
  const canPublish = Boolean(
    currentWorkflowId &&
      loadedVersion?.status === "draft" &&
      !isDirty &&
      isValid &&
      !isSaving &&
      !isPublishing
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const isDesktopInspector = useMediaQuery("(min-width: 1280px)");
  const isMobileInspector = useMediaQuery("(max-width: 639px)");
  const nodeIssues = useMemo(() => {
    const issues = new Map<string, string[]>();
    const addIssue = (nodeId: string | undefined, message: string) => {
      if (!nodeId) return;
      issues.set(nodeId, [...(issues.get(nodeId) ?? []), message]);
    };

    for (const issue of [...connectionIssues, ...compiled.issues]) {
      addIssue(issue.nodeId, issue.message);
    }

    if (!definitionResult.success && definitionResult.error && compiled.definition) {
      for (const issue of definitionResult.error.issues) {
        const stepIndex = issue.path[0] === "steps" && typeof issue.path[1] === "number" ? issue.path[1] : null;
        const step = stepIndex === null ? null : compiled.definition.steps[stepIndex];
        addIssue(step?.key, issue.message);
      }
    }

    if (bodyEditorError && selectedNodeId) {
      addIssue(selectedNodeId, bodyEditorError);
    }

    return issues;
  }, [bodyEditorError, compiled.definition, compiled.issues, connectionIssues, definitionResult, selectedNodeId]);
  const selectedIssues = selectedNodeId ? nodeIssues.get(selectedNodeId) ?? [] : [];

  useUnsavedChangesWarning(isDirty);

  function updateGraph(nextGraph: WorkflowGraph) {
    setGraph(nextGraph);
    setConnectionIssues([]);
    setRequestError(null);
  }

  function addStep(type: WorkflowStepType, position?: CanvasPosition) {
    const step = createWorkflowStep(type, graph.nodes.map((node) => node.id));
    setGraph((currentGraph) => appendStepToGraph(currentGraph, step, position));
    setSelectedNodeId(step.key);
    setConnectionIssues([]);
    setRequestError(null);
  }

  function updateStep(nodeId: string, step: WorkflowStepDefinition) {
    setGraph((currentGraph) => ({
      ...currentGraph,
      nodes: currentGraph.nodes.map((node) =>
        node.id === nodeId ? { ...node, step } : node
      )
    }));
    setRequestError(null);
  }

  async function saveDraft() {
    if (!accessToken || !compiled.definition || !definitionResult.success || !inputSchemaResult.value) {
      setRequestError(validationMessages[0] ?? "Fix validation errors before saving.");
      return;
    }

    setIsSaving(true);
    setRequestError(null);

    try {
      const detail = currentWorkflowId
        ? await createWorkflowVersion(accessToken, currentWorkflowId, {
            definition: definitionResult.data,
            inputSchema: inputSchemaResult.value
          })
        : await createWorkflow(accessToken, {
            name,
            description: description || undefined,
            definition: definitionResult.data,
            inputSchema: inputSchemaResult.value
          });
      const savedVersion = detail.versions[0];

      if (!savedVersion) {
        throw new Error("The API did not return the saved workflow version.");
      }

      setCurrentWorkflowId(detail.workflow.id);
      hydrateVersion(detail, savedVersion);

      if (!currentWorkflowId) {
        router.replace(`/workflows/${detail.workflow.id}`);
      }
    } catch (error) {
      setRequestError(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function publishDraft() {
    if (!accessToken || !currentWorkflowId || !canPublish) {
      return;
    }

    setIsPublishing(true);
    setRequestError(null);

    try {
      const detail = await publishWorkflow(accessToken, currentWorkflowId);
      const version = detail.versions.find((item) => item.id === loadedVersionId) ?? detail.versions[0];

      setWorkflowDetail(detail);

      if (version) {
        setLoadedVersionId(version.id);
        setBaselineFingerprint(createFingerprint(graph, inputSchemaText));
      }
    } catch (error) {
      setRequestError(getErrorMessage(error));
    } finally {
      setIsPublishing(false);
    }
  }

  async function runWorkflow(input: Record<string, unknown>) {
    if (!accessToken || !currentWorkflowId) {
      return;
    }

    const execution = await triggerWorkflow(accessToken, currentWorkflowId, { input });
    setRunDialogOpen(false);
    router.push(`/workflows/${currentWorkflowId}/executions/${execution.execution.id}`);
  }

  if (isLoading) {
    return (
      <main className="grid h-[calc(100vh-56px)] min-h-[520px] place-items-center xl:h-screen">
        <LoaderCircle className="size-5 animate-spin text-neutral-500" aria-label="Loading workflow" />
      </main>
    );
  }

  if (requestError && !initialNewWorkflow && !workflowDetail) {
    return (
      <main className="grid min-h-[520px] place-items-center p-6">
        <div className="max-w-md text-center">
          <AlertCircle className="mx-auto size-6 text-red-600" />
          <p className="mt-3 text-sm font-medium text-neutral-950">Unable to open workflow</p>
          <p className="mt-1 text-sm text-neutral-600">{requestError}</p>
          <Link className="mt-5 inline-flex text-sm font-medium underline" href="/workflows">
            Back to workflows
          </Link>
        </div>
      </main>
    );
  }

  const workflowName = workflowDetail?.workflow.name ?? name;
  const workflowStatus = workflowDetail?.workflow.status ?? "draft";

  const inspector = selectedNodeId ? (
    <WorkflowInspector
      credentials={credentials}
      credentialsError={credentialsError}
      selectedNode={selectedNode}
      selectedNodeId={selectedNodeId}
      inputSchemaText={inputSchemaText}
      inputSchemaError={inputSchemaResult.error}
      issues={selectedIssues}
      onClose={() => setSelectedNodeId(null)}
      onBodyErrorChange={setBodyEditorError}
      onDeleteNode={(nodeId) => {
        setGraph((currentGraph) => removeStepFromGraph(currentGraph, nodeId));
        setSelectedNodeId(null);
        setBodyEditorError(null);
      }}
      onInputSchemaChange={setInputSchemaText}
      onUpdateStep={updateStep}
    />
  ) : null;

  return (
    <main className="flex h-[calc(100dvh-56px)] min-h-[520px] flex-col overflow-hidden bg-white xl:h-screen xl:min-h-0">
      <WorkflowPageHeader
        workflow={{ id: currentWorkflowId, name: workflowName, description: workflowDetail?.workflow.description ?? description, status: workflowStatus }}
        activeSection="editor"
        meta={
          <span className="flex items-center gap-2">
            <span className={isDirty ? "text-amber-700" : "text-emerald-700"}>{isDirty ? "Unsaved changes" : "Saved"}</span>
            {loadedVersion ? <span>Version {loadedVersion.versionNo}</span> : <span>New workflow</span>}
          </span>
        }
      >
        {activeVersion ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setRunDialogOpen(true)}>
            <Play className="size-4" />
            <span className="hidden sm:inline">Run v{activeVersion.versionNo}</span>
            <span className="sm:hidden">Run</span>
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={!canPublish} onClick={() => void publishDraft()} title={canPublish ? "Publish saved draft" : "Save a valid draft before publishing"}>
          {isPublishing ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          <span className="hidden sm:inline">Publish</span>
        </Button>
        <Button type="button" variant="accent" size="sm" disabled={!isDirty || !isValid || isSaving || isPublishing} onClick={() => void saveDraft()}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          <span className="hidden sm:inline">Save Draft</span>
          <span className="sm:hidden">Save</span>
        </Button>
      </WorkflowPageHeader>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className={isDesktopInspector && selectedNodeId ? "absolute inset-0 grid grid-cols-[minmax(0,1fr)_360px]" : "absolute inset-0"}>
          <section className="relative h-full min-h-0 overflow-hidden">
            <WorkflowCanvas
              graph={graph}
              nodeIssues={nodeIssues}
              selectedNodeId={selectedNodeId}
              onAddStep={addStep}
              onChange={updateGraph}
              onIssues={setConnectionIssues}
              onSelectNode={setSelectedNodeId}
            />

            <div className="absolute bottom-4 left-14 z-10">
              <NodePalette open={stepPickerOpen} onOpenChange={setStepPickerOpen} onAddStep={addStep} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-4 top-4 z-10 bg-white shadow-sm"
              aria-label="Workflow settings"
              title="Workflow settings"
              onClick={() => setSelectedNodeId(startNodeId)}
            >
              <Settings2 className="size-4" />
            </Button>
            <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[calc(100%-5rem)] rounded-md border border-neutral-200 bg-white/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
              {requestError || validationMessages.length > 0 ? (
                <span className="flex items-start gap-2 text-red-700">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span className="truncate">{requestError ?? validationMessages[0]}</span>
                  {validationMessages.length > 1 ? <span className="shrink-0 text-red-500">+{validationMessages.length - 1}</span> : null}
                </span>
              ) : (
                <span className="flex items-center gap-2 text-neutral-600"><Check className="size-3.5 text-emerald-600" />Linear chain valid</span>
              )}
            </div>
          </section>
          {isDesktopInspector && selectedNodeId ? <div className="min-h-0">{inspector}</div> : null}
        </div>
      </div>

      <Sheet open={Boolean(selectedNodeId) && isDesktopInspector === false} onOpenChange={(open) => !open && setSelectedNodeId(null)}>
        <SheetContent side={isMobileInspector ? "bottom" : "right"} showCloseButton={false} className={isMobileInspector ? "h-[82vh] max-h-[82vh] gap-0 overflow-hidden rounded-t-lg bg-white p-0" : "w-[380px] max-w-[380px] gap-0 overflow-hidden bg-white p-0"}>
          <SheetHeader className="sr-only"><SheetTitle>Workflow inspector</SheetTitle><SheetDescription>Configure the selected workflow item.</SheetDescription></SheetHeader>
          {inspector}
        </SheetContent>
      </Sheet>

      {activeVersion ? (
        <RunWorkflowDialog
          open={runDialogOpen}
          versionNo={activeVersion.versionNo}
          onClose={() => setRunDialogOpen(false)}
          onRun={runWorkflow}
        />
      ) : null}
    </main>
  );
}

function selectEditorVersion(detail: WorkflowDetailResponse, baseVersionId: string | null) {
  if (baseVersionId) {
    return detail.versions.find((version) => version.id === baseVersionId) ?? null;
  }

  return (
    detail.versions.find((version) => version.status === "draft") ??
    detail.versions.find((version) => version.id === detail.workflow.activeVersionId) ??
    detail.versions[0] ??
    null
  );
}

function parseInputSchema(inputSchemaText: string): {
  value: Record<string, unknown> | null;
  error: string | null;
} {
  try {
    return {
      value: parseJsonObject(inputSchemaText, "Input schema"),
      error: null
    };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : "Input schema is invalid"
    };
  }
}

function createFingerprint(graph: WorkflowGraph, inputSchemaText: string) {
  const compiled = compileWorkflowGraph(graph);
  const inputSchema = parseInputSchema(inputSchemaText);

  if (!compiled.definition || !inputSchema.value) {
    return JSON.stringify({ graph, inputSchemaText });
  }

  return JSON.stringify({ definition: compiled.definition, inputSchema: inputSchema.value });
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return "The request could not be completed.";
}

function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");

      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);

      if (
        destination.origin === window.location.origin &&
        destination.href !== window.location.href &&
        !window.confirm("Discard unsaved workflow changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty]);
}
