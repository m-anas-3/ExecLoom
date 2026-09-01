import type { WorkflowVersionResponse } from "@execloom/contracts";

import { definitionToWorkflowGraph, type WorkflowGraph } from "@/lib/workflow-graph";

export type WorkflowTemplateId = "blank" | "api-health-check" | "timed-handoff";

export type WorkflowTemplate = {
  id: WorkflowTemplateId;
  name: string;
  description: string;
  workflowName: string;
  workflowDescription: string;
  inputSchema: Record<string, unknown>;
  definition: WorkflowVersionResponse["definition"] | null;
};

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "blank",
    name: "Blank Workflow",
    description: "Start with an empty canvas and add each step yourself.",
    workflowName: "Untitled workflow",
    workflowDescription: "",
    inputSchema: {},
    definition: null
  },
  {
    id: "api-health-check",
    name: "API Health Check",
    description: "Call a public endpoint and finish with a no-op confirmation step.",
    workflowName: "API health check",
    workflowDescription: "Check a public endpoint and record a completed run.",
    inputSchema: {},
    definition: {
      steps: [
        {
          key: "check-api",
          name: "Check API",
          type: "http",
          config: {
            method: "GET",
            url: "https://example.com",
            headers: {},
            timeoutMs: 10_000
          },
          retry: { maxAttempts: 2, backoffMs: 1_000 }
        },
        {
          key: "record-success",
          name: "Record success",
          type: "noop",
          config: {},
          retry: { maxAttempts: 1, backoffMs: 0 }
        }
      ],
      layout: {
        positions: {
          "check-api": { x: 360, y: 220 },
          "record-success": { x: 680, y: 220 }
        }
      }
    }
  },
  {
    id: "timed-handoff",
    name: "Timed Handoff",
    description: "Prepare work, wait for a fixed interval, then send an HTTP handoff.",
    workflowName: "Timed handoff",
    workflowDescription: "Wait before handing a task to an external service.",
    inputSchema: {},
    definition: {
      steps: [
        {
          key: "prepare-handoff",
          name: "Prepare handoff",
          type: "noop",
          config: {},
          retry: { maxAttempts: 1, backoffMs: 0 }
        },
        {
          key: "wait-before-handoff",
          name: "Wait 5 seconds",
          type: "delay",
          config: { ms: 5_000 },
          retry: { maxAttempts: 1, backoffMs: 0 }
        },
        {
          key: "send-handoff",
          name: "Send handoff",
          type: "http",
          config: {
            method: "POST",
            url: "https://example.com",
            headers: { "content-type": "application/json" },
            body: { status: "ready" },
            timeoutMs: 10_000
          },
          retry: { maxAttempts: 3, backoffMs: 1_000 }
        }
      ],
      layout: {
        positions: {
          "prepare-handoff": { x: 340, y: 220 },
          "wait-before-handoff": { x: 660, y: 220 },
          "send-handoff": { x: 980, y: 220 }
        }
      }
    }
  }
];

export function getWorkflowTemplate(templateId: string | null | undefined) {
  return workflowTemplates.find((template) => template.id === templateId) ?? workflowTemplates[0]!;
}

export function templateToGraph(template: WorkflowTemplate): WorkflowGraph {
  return template.definition
    ? definitionToWorkflowGraph(template.definition)
    : { nodes: [], edges: [] };
}
