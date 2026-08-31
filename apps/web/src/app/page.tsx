"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  History,
  Loader2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Workflow
} from "lucide-react";

import type {
  AuthUserResponse,
  ExecutionDetailResponse,
  ExecutionResponse,
  ExecutionStatus,
  WorkflowDetailResponse,
  WorkflowResponse
} from "@execloom/contracts";

import {
  ApiError,
  cancelExecution,
  createDemoWorkflow,
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
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const accessTokenStorageKey = "execloom.accessToken";
const statusFilters: Array<ExecutionStatus | "all"> = [
  "all",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled"
];

export default function Home() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserResponse | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowResponse[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetailResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionResponse[]>([]);
  const [selectedExecutionDetail, setSelectedExecutionDetail] =
    useState<ExecutionDetailResponse | null>(null);
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

    setExecutions((current) => (cursor ? [...current, ...response.executions] : response.executions));
    setNextCursor(response.nextCursor);

    if (!cursor && selectedExecutionDetail) {
      const updatedExecution = response.executions.find(
        (execution) => execution.id === selectedExecutionDetail.execution.id
      );

      if (!updatedExecution) {
        setSelectedExecutionDetail(null);
      } else {
        setSelectedExecutionDetail(await getExecution(token, updatedExecution.id));
      }
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

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
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

  async function handleCreateWorkflow(event: React.FormEvent<HTMLFormElement>) {
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
      setSelectedExecutionDetail(null);
      setNextCursor(null);
      await refreshWorkflows(accessToken);
    });
  }

  async function handleSelectWorkflow(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    setSelectedExecutionDetail(null);

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

  async function handleSelectExecution(executionId: string) {
    if (!accessToken) {
      return;
    }

    await runAction(async () => {
      setSelectedExecutionDetail(await getExecution(accessToken, executionId));
    });
  }

  function handleLogout() {
    window.localStorage.removeItem(accessTokenStorageKey);
    setAccessToken(null);
    setUser(null);
    setWorkflows([]);
    setWorkflowDetail(null);
    setExecutions([]);
    setSelectedExecutionDetail(null);
    setSelectedWorkflowId(null);
  }

  if (!accessToken || !user) {
    return (
      <main className="grid min-h-screen grid-cols-1 bg-neutral-950 text-white lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex min-h-[42vh] flex-col justify-between px-6 py-8 sm:px-10 lg:min-h-screen">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Workflow className="size-5 text-emerald-300" />
            ExecLoom
          </div>
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium text-emerald-300">Workflow execution platform</p>
            <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-5xl">
              Build, publish, and run backend workflows from one control plane.
            </h1>
          </div>
          <div className="grid gap-3 text-sm text-neutral-300 sm:grid-cols-3">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-sky-300" />
              Typed contracts
            </span>
            <span className="inline-flex items-center gap-2">
              <Rocket className="size-4 text-emerald-300" />
              Worker pipeline
            </span>
            <span className="inline-flex items-center gap-2">
              <History className="size-4 text-amber-300" />
              Execution history
            </span>
          </div>
        </section>

        <section className="flex items-center justify-center bg-neutral-100 px-4 py-8 text-neutral-950">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{authMode === "login" ? "Sign in" : "Create account"}</CardTitle>
              <CardDescription>Use your local ExecLoom API credentials.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleAuthSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={authMode === "register" ? 8 : 1}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                <Button type="submit" disabled={isBusy}>
                  {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {authMode === "login" ? "Sign in" : "Create account"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
                >
                  {authMode === "login" ? "Need an account?" : "Already have an account?"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-100 text-neutral-950">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <Workflow className="size-5 text-emerald-600" />
              <h1 className="text-lg font-semibold">ExecLoom</h1>
            </div>
            <p className="text-sm text-neutral-600">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void runAction(() => refreshWorkflows())}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button variant="ghost" size="icon" aria-label="Log out" onClick={handleLogout}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[340px_1fr]">
        <aside className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>New Workflow</CardTitle>
              <CardDescription>Create a demo workflow with noop and delay steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleCreateWorkflow}>
                <div className="grid gap-2">
                  <Label htmlFor="workflow-name">Name</Label>
                  <Input
                    id="workflow-name"
                    value={newWorkflowName}
                    onChange={(event) => setNewWorkflowName(event.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="workflow-description">Description</Label>
                  <Input
                    id="workflow-description"
                    value={newWorkflowDescription}
                    onChange={(event) => setNewWorkflowDescription(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isBusy}>
                  <Plus className="size-4" />
                  Create
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workflows</CardTitle>
              <CardDescription>{workflows.length} total</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {workflows.length === 0 ? (
                <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
                  No workflows yet.
                </p>
              ) : (
                workflows.map((workflowItem) => (
                  <button
                    key={workflowItem.id}
                    className={cn(
                      "grid gap-2 rounded-md border p-3 text-left transition-colors",
                      selectedWorkflowId === workflowItem.id
                        ? "border-neutral-950 bg-neutral-950 text-white"
                        : "border-neutral-200 bg-white hover:border-neutral-300"
                    )}
                    onClick={() => void handleSelectWorkflow(workflowItem.id)}
                  >
                    <span className="text-sm font-medium">{workflowItem.name}</span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs opacity-70">{workflowItem.id}</span>
                      <StatusBadge status={workflowItem.status} />
                    </span>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>

        <section className="grid gap-4">
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{selectedWorkflow?.name ?? "Workflow"}</CardTitle>
                <CardDescription>
                  {selectedWorkflow?.description ?? "Select or create a workflow."}
                </CardDescription>
              </div>
              {selectedWorkflow ? <StatusBadge status={selectedWorkflow.status} /> : null}
            </CardHeader>
            <CardContent>
              {selectedWorkflow ? (
                <div className="grid gap-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={isBusy}
                      onClick={() =>
                        void runAction(async () => {
                          const published = await publishWorkflow(accessToken, selectedWorkflow.id);
                          setWorkflowDetail(published);
                          await refreshWorkflows();
                        })
                      }
                    >
                      <Rocket className="size-4" />
                      Publish
                    </Button>
                    <Button
                      disabled={isBusy || selectedWorkflow.status !== "published"}
                      onClick={() =>
                        void runAction(async () => {
                          const triggered = await triggerWorkflow(accessToken, selectedWorkflow.id);
                          setSelectedExecutionDetail(triggered);
                          await refreshExecutions();
                        })
                      }
                    >
                      <Play className="size-4" />
                      Run
                    </Button>
                  </div>

                  <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
                    <Metric label="Versions" value={String(workflowDetail?.versions.length ?? 0)} />
                    <Metric label="Active Version" value={selectedWorkflow.activeVersionId ? "Yes" : "No"} />
                    <Metric label="Executions" value={String(executions.length)} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-600">Create a workflow to begin.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Execution History</CardTitle>
                <CardDescription>Latest workflow runs from the API.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy || !selectedWorkflowId}
                onClick={() => void runAction(() => refreshExecutions())}
              >
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                {statusFilters.map((filter) => (
                  <Button
                    key={filter}
                    type="button"
                    variant={statusFilter === filter ? "default" : "outline"}
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void handleStatusFilterChange(filter)}
                  >
                    {filter}
                  </Button>
                ))}
              </div>

              <div className="overflow-hidden rounded-md border border-neutral-200">
                <div className="grid grid-cols-[1fr_120px_170px] bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-600">
                  <span>Execution</span>
                  <span>Status</span>
                  <span>Created</span>
                </div>
                {executions.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-neutral-600">No executions found.</p>
                ) : (
                  executions.map((execution) => (
                    <button
                      key={execution.id}
                      className={cn(
                        "grid grid-cols-[1fr_120px_170px] items-center border-t border-neutral-200 px-4 py-3 text-left text-sm transition-colors hover:bg-neutral-50",
                        selectedExecutionDetail?.execution.id === execution.id ? "bg-neutral-50" : ""
                      )}
                      onClick={() => void handleSelectExecution(execution.id)}
                    >
                      <span className="truncate font-mono text-xs text-neutral-700">
                        {execution.id}
                      </span>
                      <StatusBadge status={execution.status} />
                      <span className="text-xs text-neutral-600">
                        {formatDate(execution.createdAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div className="flex justify-between gap-3">
                <Button
                  variant="outline"
                  disabled={isBusy || !nextCursor}
                  onClick={() => void runAction(() => refreshExecutions(selectedWorkflowId, accessToken, nextCursor ?? undefined))}
                >
                  <History className="size-4" />
                  Load More
                </Button>
                {executions.some((execution) => execution.status === "queued" || execution.status === "running") ? (
                  <Button
                    variant="destructive"
                    disabled={isBusy}
                    onClick={() =>
                      void runAction(async () => {
                        const activeExecution = executions.find(
                          (execution) =>
                            execution.status === "queued" || execution.status === "running"
                        );

                        if (activeExecution) {
                          await cancelExecution(accessToken, activeExecution.id);
                          await refreshExecutions();
                        }
                      })
                    }
                  >
                    Cancel Active
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Execution Details</CardTitle>
                <CardDescription>Step runs and events for the selected execution.</CardDescription>
              </div>
              {selectedExecutionDetail ? (
                <StatusBadge status={selectedExecutionDetail.execution.status} />
              ) : null}
            </CardHeader>
            <CardContent>
              {selectedExecutionDetail ? (
                <div className="grid gap-4">
                  <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
                    <Metric label="Steps" value={String(selectedExecutionDetail.steps.length)} />
                    <Metric label="Events" value={String(selectedExecutionDetail.events.length)} />
                    <Metric
                      label="Trigger"
                      value={selectedExecutionDetail.execution.triggerType}
                    />
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <JsonBlock label="Input" value={selectedExecutionDetail.execution.input} />
                    <JsonBlock label="Output" value={selectedExecutionDetail.execution.output} />
                  </div>

                  <div className="grid gap-2">
                    <h3 className="text-sm font-medium">Step Runs</h3>
                    <div className="overflow-hidden rounded-md border border-neutral-200">
                      <div className="grid grid-cols-[1fr_120px_100px] bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-600">
                        <span>Step</span>
                        <span>Status</span>
                        <span>Attempts</span>
                      </div>
                      {selectedExecutionDetail.steps.map((step) => (
                        <div
                          key={step.id}
                          className="grid grid-cols-[1fr_120px_100px] items-center border-t border-neutral-200 px-4 py-3 text-sm"
                        >
                          <span className="truncate font-mono text-xs text-neutral-700">
                            {step.stepKey}
                          </span>
                          <StatusBadge status={step.status} />
                          <span className="text-xs text-neutral-600">{step.attemptCount}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <h3 className="text-sm font-medium">Events</h3>
                    <div className="grid gap-2">
                      {selectedExecutionDetail.events.map((event) => (
                        <div
                          key={event.id}
                          className="grid gap-2 rounded-md border border-neutral-200 bg-white p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">{event.type}</span>
                            <span className="text-xs text-neutral-600">
                              #{event.sequenceNo} - {formatDate(event.createdAt)}
                            </span>
                          </div>
                          <pre className="max-h-40 overflow-auto rounded-md bg-neutral-950 p-3 text-xs text-neutral-100">
                            {formatJson(event.payload)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-600">
                  Select an execution from history to inspect its steps and events.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="size-4" />
                Published Definition
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-auto rounded-md bg-neutral-950 p-4 text-xs text-neutral-100">
                {JSON.stringify(workflowDetail?.versions[0]?.definition ?? {}, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantByStatus: Record<string, BadgeProps["variant"]> = {
    draft: "neutral",
    published: "green",
    archived: "amber",
    queued: "blue",
    running: "amber",
    succeeded: "green",
    failed: "red",
    cancelled: "neutral"
  };

  return <Badge variant={variantByStatus[status] ?? "neutral"}>{status}</Badge>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-950">{value}</p>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium">{label}</h3>
      <pre className="max-h-56 overflow-auto rounded-md bg-neutral-950 p-4 text-xs text-neutral-100">
        {formatJson(value)}
      </pre>
    </div>
  );
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
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
