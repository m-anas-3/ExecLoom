"use client";

import { useParams } from "next/navigation";

import { WorkflowVersionsScreen } from "@/components/workflows/workflow-versions-screen";

export default function WorkflowVersionsPage() {
  const params = useParams<{ workflowId: string }>();

  return <WorkflowVersionsScreen workflowId={params.workflowId} />;
}
