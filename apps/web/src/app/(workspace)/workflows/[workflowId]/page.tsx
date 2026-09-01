"use client";

import { useParams } from "next/navigation";

import { WorkflowEditorScreen } from "@/components/workflow-editor/workflow-editor-screen";

export default function WorkflowEditorPage() {
  const params = useParams<{ workflowId: string }>();

  return <WorkflowEditorScreen workflowId={params.workflowId} />;
}
