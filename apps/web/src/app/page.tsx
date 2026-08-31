"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  AuthUserResponse,
  ExecutionDetailResponse,
  ExecutionResponse,
  ExecutionStatus,
  WorkflowDetailResponse,
  WorkflowResponse
} from "@execloom/contracts";

import { AuthScreen, type AuthMode } from "@/components/app/auth-screen";
import { DashboardHeader } from "@/components/app/dashboard-header";
import { ExecutionDetails } from "@/components/app/execution-details";
import { ExecutionHistory } from "@/components/app/execution-history";
import { WorkflowAuthoringPanel } from "@/components/app/workflow-authoring-panel";
import { WorkflowList } from "@/components/app/workflow-list";
import { WorkflowOverview } from "@/components/app/workflow-overview";
import { WorkflowVersions } from "@/components/app/workflow-versions";
import {
  ApiError,
  cancelExecution,
  createWorkflow,
  createWorkflowVersion,
  getExecution,
  getCurrentUser,
  getWorkflow,
  listWorkflowExecutions,
  listWorkflows,
  login,
  publishWorkflow,
  register,
  triggerWorkflow
} from "@/lib/api";
import {
  buildCreateWorkflowVersionRequest,
  buildCreateWorkflowRequest,
  buildTriggerExecutionRequest,
  defaultExecutionInputText,
  defaultWorkflowDefinitionText,
  defaultWorkflowInputSchemaText,
  formatJson,
  parseJsonObject,
  workflowTemplates,
  type WorkflowTemplate
} from "@/lib/json-authoring";

const accessTokenStorageKey = "execloom.accessToken";
const executionPollIntervalMs = 3_000;

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserResponse | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [executions, setExecutions] = useState<ExecutionResponse[]>([]);
  const [selectedExecutionDetail, setSelectedExecutionDetail] =
    useState<ExecutionDetailResponse | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [newWorkflowName, setNewWorkflowName] = useState("Customer onboarding");
  const [newWorkflowDescription, setNewWorkflowDescription] = useState(
    "Demo workflow for validating the execution pipeline"
  );
  const [newWorkflowInputSchemaText, setNewWorkflowInputSchemaText] = useState(
    defaultWorkflowInputSchemaText
  );
  const [newWorkflowDefinitionText, setNewWorkflowDefinitionText] = useState(
    defaultWorkflowDefinitionText
  );
  const [executionInputText, setExecutionInputText] = useState(defaultExecutionInputText);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflowItem) => workflowItem.id === selectedWorkflowId) ?? null,
    [selectedWorkflowId, workflows]
  );
  const selectedVersion = useMemo(
    () =>
      workflowDetail?.versions.find((version) => version.id === selectedVersionId) ?? null,
    [selectedVersionId, workflowDetail]
  );
  const shouldPollExecutions = useMemo(
    () =>
      executions.some((execution) => isActiveExecutionStatus(execution.status)) ||
      (selectedExecutionDetail
        ? isActiveExecutionStatus(selectedExecutionDetail.execution.status)
        : false),
    [executions, selectedExecutionDetail]
  );

  useEffect(() => {
    const savedToken = window.localStorage.getItem(accessTokenStorageKey);

    if (!savedToken) {
      return;
    }

    setAccessToken(savedToken);
    void bootstrapSession(savedToken);
  }, []);

  useEffect(() => {
    if (!accessToken || !selectedWorkflowId || !shouldPollExecutions) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    const token = accessToken;
    const workflowId = selectedWorkflowId;
    const selectedExecutionId = selectedExecutionDetail?.execution.id;

    async function pollExecutions() {
      try {
        const [executionPage, executionDetail] = await Promise.all([
          listWorkflowExecutions(token, workflowId, {
            status: statusFilter === "all" ? undefined : statusFilter
          }),
          selectedExecutionId ? getExecution(token, selectedExecutionId) : null
        ]);

        if (cancelled) {
          return;
        }

        setExecutions(executionPage.executions);
        setNextCursor(executionPage.nextCursor);

        if (executionDetail) {
          setSelectedExecutionDetail(executionDetail);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(() => void pollExecutions(), executionPollIntervalMs);
        }
      }
    }

    timeoutId = window.setTimeout(() => void pollExecutions(), executionPollIntervalMs);

    return () => {
      cancelled = true;

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    accessToken,
    selectedExecutionDetail?.execution.id,
    selectedWorkflowId,
    shouldPollExecutions,
    statusFilter
  ]);

  async function bootstrapSession(token: string) {
    try {
      const currentUser = await getCurrentUser(token);
      setUser(currentUser.user);
      await refreshWorkflows(token);
    } catch (requestError) {
      window.localStorage.removeItem(accessTokenStorageKey);
      setAccessToken(null);
      setUser(null);
      setError(getErrorMessage(requestError));
    }
  }

  async function refreshWorkflows(token = accessToken) {
    if (!token) {
      return;
    }

    const response = await listWorkflows(token);
    setWorkflows(response.workflows);

    if (!selectedWorkflowId && response.workflows[0]) {
      setSelectedWorkflowId(response.workflows[0].id);
      await refreshWorkflowDetail(response.workflows[0].id, token);
      await refreshExecutions(response.workflows[0].id, token, undefined, statusFilter);
    }
  }

  async function refreshWorkflowDetail(workflowId = selectedWorkflowId, token = accessToken) {
    if (!workflowId || !token) {
      return;
    }

    const detail = await getWorkflow(token, workflowId);
    setWorkflowDetail(detail);
    setSelectedVersionId((currentVersionId) =>
      detail.versions.some((version) => version.id === currentVersionId)
        ? currentVersionId
        : (detail.workflow.activeVersionId ?? detail.versions[0]?.id ?? null)
    );
  }

  async function refreshExecutions(
    workflowId = selectedWorkflowId,
    token = accessToken,
    cursor?: string,
    filter = statusFilter,
    refreshSelectedExecution = true
  ) {
    if (!workflowId || !token) {
      return;
    }

    const response = await listWorkflowExecutions(token, workflowId, {
      cursor,
      status: filter === "all" ? undefined : filter
    });

    setExecutions((current) =>
      cursor ? [...current, ...response.executions] : response.executions
    );
    setNextCursor(response.nextCursor);

    if (!cursor && refreshSelectedExecution && selectedExecutionDetail) {
      setSelectedExecutionDetail(await getExecution(token, selectedExecutionDetail.execution.id));
    }
  }

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);

    try {
      await action();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

  function runLocalAction(action: () => void) {
    setError(null);

    try {
      action();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction(async () => {
      const session =
        authMode === "login" ? await login(email, password) : await register(email, password);

      window.localStorage.setItem(accessTokenStorageKey, session.accessToken);
      setAccessToken(session.accessToken);
      setUser(session.user);
      await refreshWorkflows(session.accessToken);
    });
  }

  async function handleCreateWorkflow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      return;
    }

    await runAction(async () => {
      const created = await createWorkflow(
        accessToken,
        buildCreateWorkflowRequest({
          name: newWorkflowName,
          description: newWorkflowDescription,
          inputSchemaText: newWorkflowInputSchemaText,
          definitionText: newWorkflowDefinitionText
        })
      );

      setSelectedWorkflowId(created.workflow.id);
      setWorkflowDetail(created);
      setSelectedVersionId(created.versions[0]?.id ?? null);
      setExecutions([]);
      setSelectedExecutionDetail(null);
      setNextCursor(null);
      await refreshWorkflows(accessToken);
    });
  }

  async function handleSelectWorkflow(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    setSelectedVersionId(null);
    setSelectedExecutionDetail(null);

    await runAction(async () => {
      await refreshWorkflowDetail(workflowId);
      await refreshExecutions(workflowId, accessToken, undefined, statusFilter, false);
    });
  }

  async function handleCreateWorkflowVersion() {
    if (!accessToken || !selectedWorkflowId) {
      return;
    }

    await runAction(async () => {
      const versioned = await createWorkflowVersion(
        accessToken,
        selectedWorkflowId,
        buildCreateWorkflowVersionRequest({
          inputSchemaText: newWorkflowInputSchemaText,
          definitionText: newWorkflowDefinitionText
        })
      );

      setWorkflowDetail(versioned);
      setSelectedVersionId(
        versioned.versions.find((version) => version.status === "draft")?.id ?? null
      );
      await refreshWorkflows(accessToken);
    });
  }

  async function handleStatusFilterChange(filter: ExecutionStatus | "all") {
    setStatusFilter(filter);

    await runAction(async () => {
      await refreshExecutions(selectedWorkflowId, accessToken, undefined, filter);
    });
  }

  async function handleSelectExecution(executionId: string) {
    if (!accessToken) {
      return;
    }

    await runAction(async () => {
      setSelectedExecutionDetail(await getExecution(accessToken, executionId));
    });
  }

  function handleApplyWorkflowTemplate(template: WorkflowTemplate) {
    runLocalAction(() => {
      setNewWorkflowDefinitionText(formatJson(template.definition));
      setExecutionInputText(formatJson(template.executionInput));
    });
  }

  function handleLoadWorkflowVersion(version: WorkflowDetailResponse["versions"][number]) {
    setNewWorkflowInputSchemaText(formatJson(version.inputSchema));
    setNewWorkflowDefinitionText(formatJson(version.definition));
  }

  function handleFormatJsonField(
    value: string,
    label: string,
    updateValue: (formattedValue: string) => void
  ) {
    runLocalAction(() => {
      updateValue(formatJson(parseJsonObject(value, label)));
    });
  }

  function handleResetAuthoringDefaults() {
    runLocalAction(() => {
      setNewWorkflowInputSchemaText(defaultWorkflowInputSchemaText);
      setNewWorkflowDefinitionText(defaultWorkflowDefinitionText);
      setExecutionInputText(defaultExecutionInputText);
    });
  }

  function handleLogout() {
    window.localStorage.removeItem(accessTokenStorageKey);
    setAccessToken(null);
    setUser(null);
    setWorkflows([]);
    setWorkflowDetail(null);
    setSelectedVersionId(null);
    setExecutions([]);
    setSelectedExecutionDetail(null);
    setSelectedWorkflowId(null);
  }

  if (!accessToken || !user) {
    return (
      <AuthScreen
        authMode={authMode}
        email={email}
        error={error}
        isBusy={isBusy}
        password={password}
        onAuthModeChange={setAuthMode}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={(event) => void handleAuthSubmit(event)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <DashboardHeader
        user={user}
        onLogout={handleLogout}
        onRefresh={() => void runAction(() => refreshWorkflows())}
      />

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[340px_1fr]">
        <aside className="grid gap-4">
          <WorkflowAuthoringPanel
            definitionText={newWorkflowDefinitionText}
            description={newWorkflowDescription}
            inputSchemaText={newWorkflowInputSchemaText}
            isBusy={isBusy}
            name={newWorkflowName}
            selectedWorkflowName={selectedWorkflow?.name ?? null}
            templates={workflowTemplates}
            onApplyTemplate={handleApplyWorkflowTemplate}
            onCreateWorkflow={(event) => void handleCreateWorkflow(event)}
            onCreateVersion={() => void handleCreateWorkflowVersion()}
            onDefinitionTextChange={setNewWorkflowDefinitionText}
            onDescriptionChange={setNewWorkflowDescription}
            onFormatDefinition={() =>
              handleFormatJsonField(
                newWorkflowDefinitionText,
                "Definition",
                setNewWorkflowDefinitionText
              )
            }
            onFormatInputSchema={() =>
              handleFormatJsonField(
                newWorkflowInputSchemaText,
                "Input schema",
                setNewWorkflowInputSchemaText
              )
            }
            onInputSchemaTextChange={setNewWorkflowInputSchemaText}
            onNameChange={setNewWorkflowName}
            onReset={handleResetAuthoringDefaults}
          />

          <WorkflowList
            selectedWorkflowId={selectedWorkflowId}
            workflows={workflows}
            onSelectWorkflow={(workflowId) => void handleSelectWorkflow(workflowId)}
          />
        </aside>

        <section className="grid gap-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <WorkflowOverview
            executionCount={executions.length}
            executionInputText={executionInputText}
            isBusy={isBusy}
            selectedWorkflow={selectedWorkflow}
            workflowDetail={workflowDetail}
            onExecutionInputTextChange={setExecutionInputText}
            onFormatExecutionInput={() =>
              handleFormatJsonField(executionInputText, "Execution input", setExecutionInputText)
            }
            onPublish={() =>
              void runAction(async () => {
                if (!selectedWorkflow) {
                  return;
                }

                const published = await publishWorkflow(accessToken, selectedWorkflow.id);
                setWorkflowDetail(published);
                setSelectedVersionId(published.workflow.activeVersionId);
                await refreshWorkflows();
              })
            }
            onRun={() =>
              void runAction(async () => {
                if (!selectedWorkflow) {
                  return;
                }

                const triggered = await triggerWorkflow(
                  accessToken,
                  selectedWorkflow.id,
                  buildTriggerExecutionRequest(executionInputText)
                );

                setSelectedExecutionDetail(triggered);
                await refreshExecutions();
              })
            }
          />

          <ExecutionHistory
            executions={executions}
            isBusy={isBusy}
            nextCursor={nextCursor}
            selectedExecutionId={selectedExecutionDetail?.execution.id ?? null}
            selectedWorkflowId={selectedWorkflowId}
            statusFilter={statusFilter}
            canCancelSelected={
              selectedExecutionDetail
                ? isActiveExecutionStatus(selectedExecutionDetail.execution.status)
                : false
            }
            onCancelSelected={() =>
              void runAction(async () => {
                const selectedExecution = selectedExecutionDetail?.execution;

                if (selectedExecution && isActiveExecutionStatus(selectedExecution.status)) {
                  setSelectedExecutionDetail(
                    await cancelExecution(accessToken, selectedExecution.id)
                  );
                  await refreshExecutions();
                }
              })
            }
            onLoadMore={() =>
              void runAction(() =>
                refreshExecutions(selectedWorkflowId, accessToken, nextCursor ?? undefined)
              )
            }
            onRefresh={() => void runAction(() => refreshExecutions())}
            onSelectExecution={(executionId) => void handleSelectExecution(executionId)}
            onStatusFilterChange={(filter) => void handleStatusFilterChange(filter)}
          />

          <ExecutionDetails executionDetail={selectedExecutionDetail} />
          <WorkflowVersions
            selectedVersion={selectedVersion}
            workflowDetail={workflowDetail}
            onLoadVersion={handleLoadWorkflowVersion}
            onSelectVersion={setSelectedVersionId}
          />
        </section>
      </div>
    </main>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong";
}

function isActiveExecutionStatus(status: ExecutionStatus) {
  return status === "queued" || status === "running";
}
