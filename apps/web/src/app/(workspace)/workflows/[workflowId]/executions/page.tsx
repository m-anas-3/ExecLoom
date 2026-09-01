"use client";

import { useParams } from "next/navigation";

import { ExecutionHistoryScreen } from "@/components/executions/execution-history-screen";

export default function WorkflowExecutionsPage() {
  const params = useParams<{ workflowId: string }>();

  return <ExecutionHistoryScreen workflowId={params.workflowId} />;
}
