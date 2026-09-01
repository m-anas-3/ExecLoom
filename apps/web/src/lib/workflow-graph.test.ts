import { describe, expect, it } from "vitest";

import {
  appendStepToGraph,
  compileWorkflowGraph,
  createWorkflowStep,
  definitionToWorkflowGraph,
  removeStepFromGraph,
  reorderStepAfter,
  replaceConnection,
  startNodeId,
  validateWorkflowGraph,
  type WorkflowGraph
} from "@/lib/workflow-graph";

const definition = {
  steps: [
    {
      key: "start-task",
      name: "Start task",
      type: "noop" as const,
      config: {},
      retry: { maxAttempts: 1, backoffMs: 0 }
    },
    {
      key: "wait",
      name: "Wait",
      type: "delay" as const,
      config: { ms: 500 },
      retry: { maxAttempts: 2, backoffMs: 100 }
    }
  ],
  layout: {
    positions: {
      "start-task": { x: 320, y: 160 },
      wait: { x: 620, y: 220 }
    }
  }
};

describe("workflow graph conversion", () => {
  it("loads ordered steps into nodes and derived edges", () => {
    const graph = definitionToWorkflowGraph(definition);

    expect(graph.nodes.map((node) => node.id)).toEqual(["start-task", "wait"]);
    expect(graph.nodes[1]?.position).toEqual({ x: 620, y: 220 });
    expect(graph.edges).toEqual([
      { id: `${startNodeId}->start-task`, source: startNodeId, target: "start-task" },
      { id: "start-task->wait", source: "start-task", target: "wait" }
    ]);
  });

  it("compiles the connected chain instead of canvas position order", () => {
    const graph = definitionToWorkflowGraph(definition);
    graph.nodes[0]!.position.x = 900;
    graph.nodes[1]!.position.x = 300;

    const result = compileWorkflowGraph(graph);

    expect(result.issues).toEqual([]);
    expect(result.definition?.steps.map((step) => step.key)).toEqual(["start-task", "wait"]);
    expect(result.definition?.layout?.positions["start-task"]).toEqual({ x: 900, y: 160 });
  });

  it("appends new steps to the valid tail with stable generated keys", () => {
    const initial = definitionToWorkflowGraph(definition);
    const newStep = createWorkflowStep("delay", initial.nodes.map((node) => node.id));
    const graph = appendStepToGraph(initial, newStep);

    expect(newStep.key).toBe("delay");
    expect(graph.edges.at(-1)).toMatchObject({ source: "wait", target: "delay" });
    expect(compileWorkflowGraph(graph).definition?.steps.at(-1)?.key).toBe("delay");
  });

  it("reconnects neighboring steps when deleting a middle node", () => {
    let graph = definitionToWorkflowGraph(definition);
    graph = appendStepToGraph(graph, createWorkflowStep("noop", graph.nodes.map((node) => node.id)));
    graph = removeStepFromGraph(graph, "wait");

    expect(graph.edges).toContainEqual({
      id: "start-task->step",
      source: "start-task",
      target: "step"
    });
    expect(compileWorkflowGraph(graph).definition?.steps.map((step) => step.key)).toEqual([
      "start-task",
      "step"
    ]);
  });

  it("rewires execution order without changing node positions", () => {
    let graph = definitionToWorkflowGraph(definition);
    graph = appendStepToGraph(graph, createWorkflowStep("noop", graph.nodes.map((node) => node.id)));
    const originalPosition = graph.nodes.find((node) => node.id === "step")?.position;

    graph = reorderStepAfter(graph, startNodeId, "step");

    expect(compileWorkflowGraph(graph).definition?.steps.map((step) => step.key)).toEqual([
      "step",
      "start-task",
      "wait"
    ]);
    expect(graph.nodes.find((node) => node.id === "step")?.position).toEqual(originalPosition);
  });
});

describe("workflow graph validation", () => {
  it("rejects an empty workflow", () => {
    const result = compileWorkflowGraph({ nodes: [], edges: [] });

    expect(result.issues[0]?.code).toBe("EMPTY_WORKFLOW");
    expect(result.definition).toBeNull();
  });

  it("rejects disconnected nodes", () => {
    const graph = definitionToWorkflowGraph(definition);
    graph.edges = graph.edges.filter((edge) => edge.target !== "wait");

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toContain(
      "DISCONNECTED_NODE"
    );
  });

  it("rejects cycles", () => {
    const graph = definitionToWorkflowGraph(definition);
    graph.edges.push({ id: "wait->start-task", source: "wait", target: "start-task" });

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toContain("CYCLE");
  });

  it("rejects branching connections", () => {
    const graph: WorkflowGraph = appendStepToGraph(
      definitionToWorkflowGraph(definition),
      createWorkflowStep("noop", ["start-task", "wait"])
    );
    graph.edges.push({ id: "start-task->step", source: "start-task", target: "step" });

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toContain(
      "MULTIPLE_OUTPUTS"
    );
  });

  it("rejects duplicate and reserved node keys", () => {
    const graph = definitionToWorkflowGraph(definition);
    graph.nodes.push({ ...graph.nodes[0]! });

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toContain(
      "DUPLICATE_KEY"
    );

    graph.nodes[graph.nodes.length - 1] = {
      ...graph.nodes[0]!,
      id: startNodeId,
      step: { ...graph.nodes[0]!.step, key: startNodeId }
    };

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toContain(
      "RESERVED_KEY"
    );
  });

  it("marks rewired but incomplete chains as invalid", () => {
    const graph = replaceConnection(definitionToWorkflowGraph(definition), startNodeId, "wait");

    expect(validateWorkflowGraph(graph).map((issue) => issue.code)).toContain(
      "DISCONNECTED_NODE"
    );
  });
});
