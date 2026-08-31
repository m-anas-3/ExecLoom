import type { ExecutionDetailResponse } from "@execloom/contracts";

import { JsonBlock } from "@/components/app/json-block";
import { Metric } from "@/components/app/metric";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJson } from "@/lib/json-authoring";

export function ExecutionDetails({
  executionDetail
}: {
  executionDetail: ExecutionDetailResponse | null;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Execution Details</CardTitle>
          <CardDescription>Step runs and events for the selected execution.</CardDescription>
        </div>
        {executionDetail ? <StatusBadge status={executionDetail.execution.status} /> : null}
      </CardHeader>
      <CardContent>
        {executionDetail ? (
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
              <Metric label="Steps" value={String(executionDetail.steps.length)} />
              <Metric label="Events" value={String(executionDetail.events.length)} />
              <Metric label="Trigger" value={executionDetail.execution.triggerType} />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <JsonBlock label="Input" value={executionDetail.execution.input} />
              <JsonBlock label="Output" value={executionDetail.execution.output} />
            </div>

            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Step Runs</h3>
              <div className="overflow-hidden rounded-md border border-neutral-200">
                <div className="grid grid-cols-[1fr_120px_100px] bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-600">
                  <span>Step</span>
                  <span>Status</span>
                  <span>Attempts</span>
                </div>
                {executionDetail.steps.map((step) => (
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
                {executionDetail.events.map((event) => (
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
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
