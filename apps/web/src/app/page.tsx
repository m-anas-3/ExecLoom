"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import type {
  AuthUserResponse,
  ExecutionResponse,
  ExecutionStatus,
  WorkflowDetailResponse,
  WorkflowResponse
} from "@execloom/contracts";

import { AuthScreen, type AuthMode } from "@/components/app/auth-screen";
import { DashboardHeader } from "@/components/app/dashboard-header";
import { DefinitionPanel } from "@/components/app/definition-panel";
import { ExecutionHistory } from "@/components/app/execution-history";
import { WorkflowOverview } from "@/components/app/workflow-overview";
import { WorkflowSidebar } from "@/components/app/workflow-sidebar";
import {
  ApiError,
  cancelExecution,
  createDemoWorkflow,
  getCurrentUser,
  getWorkflow,
  listWorkflowExecutions,
  listWorkflows,
  login,
  publishWorkflow,
  register,
  triggerWorkflow
} from "@/lib/api";

const accessTokenStorageKey = "execloom.accessToken";

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserResponse | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionResponse[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "all">("all");
  const [newWorkflowName, setNewWorkflowName] = useState("Customer onboarding");
  const [newWorkflowDescription, setNewWorkflowDescription] = useState(
    "Demo workflow for validating the execution pipeline"
  );
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkflow = useMemo(
    () => workflows.find((workflowItem) => workflowItem.id === selectedWorkflowId) ?? null,
    [selectedWorkflowId, workflows]
  );

  useEffect(() => {
    const savedToken = window.localStorage.getItem(accessTokenStorageKey);

    if (!savedToken) {
      return;
    }

    setAccessToken(savedToken);
    void bootstrapSession(savedToken);
  }, []);

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
  }

  async function refreshExecutions(
    workflowId = selectedWorkflowId,
    token = accessToken,
    cursor?: string,
    filter = statusFilter
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
      const created = await createDemoWorkflow(accessToken, {
        name: newWorkflowName,
        description: newWorkflowDescription
      });

      setSelectedWorkflowId(created.workflow.id);
      setWorkflowDetail(created);
      setExecutions([]);
      setNextCursor(null);
      await refreshWorkflows(accessToken);
    });
  }

  async function handleSelectWorkflow(workflowId: string) {
    setSelectedWorkflowId(workflowId);

    await runAction(async () => {
      await refreshWorkflowDetail(workflowId);
      await refreshExecutions(workflowId, accessToken, undefined, statusFilter);
    });
  }

  async function handleStatusFilterChange(filter: ExecutionStatus | "all") {
    setStatusFilter(filter);

    await runAction(async () => {
      await refreshExecutions(selectedWorkflowId, accessToken, undefined, filter);
    });
  }

  function handleLogout() {
    window.localStorage.removeItem(accessTokenStorageKey);
    setAccessToken(null);
    setUser(null);
    setWorkflows([]);
    setWorkflowDetail(null);
    setExecutions([]);
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
        <WorkflowSidebar
          isBusy={isBusy}
          newWorkflowDescription={newWorkflowDescription}
          newWorkflowName={newWorkflowName}
          selectedWorkflowId={selectedWorkflowId}
          workflows={workflows}
          onCreateWorkflow={(event) => void handleCreateWorkflow(event)}
          onNewWorkflowDescriptionChange={setNewWorkflowDescription}
          onNewWorkflowNameChange={setNewWorkflowName}
          onSelectWorkflow={(workflowId) => void handleSelectWorkflow(workflowId)}
        />

        <section className="grid gap-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <WorkflowOverview
            executionCount={executions.length}
            isBusy={isBusy}
            selectedWorkflow={selectedWorkflow}
            workflowDetail={workflowDetail}
            onPublish={() =>
              void runAction(async () => {
                if (!selectedWorkflow) {
                  return;
                }

                const published = await publishWorkflow(accessToken, selectedWorkflow.id);
                setWorkflowDetail(published);
                await refreshWorkflows();
              })
            }
            onRun={() =>
              void runAction(async () => {
                if (!selectedWorkflow) {
                  return;
                }

                await triggerWorkflow(accessToken, selectedWorkflow.id);
                await refreshExecutions();
              })
            }
          />

          <ExecutionHistory
            executions={executions}
            isBusy={isBusy}
            nextCursor={nextCursor}
            selectedWorkflowId={selectedWorkflowId}
            statusFilter={statusFilter}
            onCancelActive={() =>
              void runAction(async () => {
                const activeExecution = executions.find(
                  (execution) => execution.status === "queued" || execution.status === "running"
                );

                if (activeExecution) {
                  await cancelExecution(accessToken, activeExecution.id);
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
            onStatusFilterChange={(filter) => void handleStatusFilterChange(filter)}
          />

          <DefinitionPanel workflowDetail={workflowDetail} />
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
