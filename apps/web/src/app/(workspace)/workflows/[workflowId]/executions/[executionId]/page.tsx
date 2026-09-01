"use client";

import { useParams } from "next/navigation";

import { ExecutionDetailScreen } from "@/components/executions/execution-detail-screen";

export default function ExecutionDetailPage() {
  const params = useParams<{ workflowId: string; executionId: string }>();

  return (
    <ExecutionDetailScreen
      workflowId={params.workflowId}
      executionId={params.executionId}
    />
  );
}
