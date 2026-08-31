import { GitBranch } from "lucide-react";

import type { WorkflowDetailResponse } from "@execloom/contracts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DefinitionPanel({
  workflowDetail
}: {
  workflowDetail: WorkflowDetailResponse | null;
}) {
  return (
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
  );
}
