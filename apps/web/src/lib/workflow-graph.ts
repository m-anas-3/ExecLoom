import type {
  WorkflowStepDefinition,
  WorkflowStepType,
  WorkflowVersionResponse
} from "@execloom/contracts";

export const startNodeId = "__execloom_start__";

export type CanvasPosition = {
  x: number;
  y: number;
};

export type WorkflowGraphNode = {
  id: string;
  position: CanvasPosition;
  step: WorkflowStepDefinition;
};

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type WorkflowGraph = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowGraphIssue = {
  code:
    | "EMPTY_WORKFLOW"
    | "DUPLICATE_KEY"
    | "RESERVED_KEY"
    | "UNKNOWN_NODE"
    | "SELF_CONNECTION"
    | "INVALID_START"
    | "MULTIPLE_INPUTS"
    | "MULTIPLE_OUTPUTS"
    | "DISCONNECTED_NODE"
    | "CYCLE";
  message: string;
  nodeId?: string;
};

const defaultStartPosition: CanvasPosition = { x: 48, y: 220 };
const firstStepX = 320;
const stepSpacingX = 290;

export function definitionToWorkflowGraph(
  definition: WorkflowVersionResponse["definition"]
): WorkflowGraph {
  const nodes = definition.steps.map((step, index) => ({
    id: step.key,
    position: definition.layout?.positions[step.key] ?? {
      x: firstStepX + index * stepSpacingX,
      y: defaultStartPosition.y
    },
    step
  }));

  return {
    nodes,
    edges: buildOrderedEdges(nodes.map((node) => node.id))
  };
}

export function compileWorkflowGraph(graph: WorkflowGraph): {
  definition: WorkflowVersionResponse["definition"] | null;
  issues: WorkflowGraphIssue[];
} {
  const issues = validateWorkflowGraph(graph);

  if (issues.length > 0) {
    return { definition: null, issues };
  }

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nextBySource = new Map(graph.edges.map((edge) => [edge.source, edge.target]));
  const orderedNodes: WorkflowGraphNode[] = [];
  let currentId = nextBySource.get(startNodeId);

  while (currentId) {
    const node = nodeById.get(currentId);

    if (!node) {
      break;
    }

    orderedNodes.push(node);
    currentId = nextBySource.get(currentId);
  }

  return {
    definition: {
      steps: orderedNodes.map((node) => node.step),
      layout: {
        positions: Object.fromEntries(
          graph.nodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
        )
      }
    },
    issues: []
  };
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowGraphIssue[] {
  if (graph.nodes.length === 0) {
    return [
      {
        code: "EMPTY_WORKFLOW",
        message: "Add at least one step before saving this workflow."
      }
    ];
  }

  const issues: WorkflowGraphIssue[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  const nextBySource = new Map<string, string>();

  if (nodeIds.size !== graph.nodes.length) {
    issues.push({
      code: "DUPLICATE_KEY",
      message: "Every workflow step must have a unique stable key."
    });
  }

  if (nodeIds.has(startNodeId)) {
    issues.push({
      code: "RESERVED_KEY",
      message: "A workflow step cannot use the reserved Start key.",
      nodeId: startNodeId
    });
  }

  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      issues.push({
        code: "SELF_CONNECTION",
        message: "A step cannot connect to itself.",
        nodeId: edge.source
      });
      continue;
    }

    if (edge.source !== startNodeId && !nodeIds.has(edge.source)) {
      issues.push({
        code: "UNKNOWN_NODE",
        message: "A connection starts from a step that no longer exists.",
        nodeId: edge.source
      });
    }

    if (!nodeIds.has(edge.target)) {
      issues.push({
        code: "UNKNOWN_NODE",
        message: "A connection targets a step that no longer exists.",
        nodeId: edge.target
      });
    }

    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    nextBySource.set(edge.source, edge.target);
  }

  if ((incomingCount.get(startNodeId) ?? 0) > 0 || (outgoingCount.get(startNodeId) ?? 0) !== 1) {
    issues.push({
      code: "INVALID_START",
      message: "Start must connect to exactly one first step.",
      nodeId: startNodeId
    });
  }

  for (const node of graph.nodes) {
    const incoming = incomingCount.get(node.id) ?? 0;
    const outgoing = outgoingCount.get(node.id) ?? 0;

    if (incoming > 1) {
      issues.push({
        code: "MULTIPLE_INPUTS",
        message: `${getStepLabel(node.step)} has more than one incoming connection.`,
        nodeId: node.id
      });
    }

    if (outgoing > 1) {
      issues.push({
        code: "MULTIPLE_OUTPUTS",
        message: `${getStepLabel(node.step)} has more than one outgoing connection.`,
        nodeId: node.id
      });
    }
  }

  const visited = new Set<string>();
  let currentId = nextBySource.get(startNodeId);

  while (currentId) {
    if (visited.has(currentId)) {
      issues.push({
        code: "CYCLE",
        message: "Workflow connections cannot contain a cycle.",
        nodeId: currentId
      });
      break;
    }

    visited.add(currentId);
    currentId = nextBySource.get(currentId);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      issues.push({
        code: "DISCONNECTED_NODE",
        message: `${getStepLabel(node.step)} is not connected to the Start chain.`,
        nodeId: node.id
      });
    }
  }

  return deduplicateIssues(issues);
}

export function createWorkflowStep(
  type: WorkflowStepType,
  existingKeys: Iterable<string>
): WorkflowStepDefinition {
  const baseKeyByType: Record<WorkflowStepType, string> = {
    noop: "step",
    delay: "delay",
    http: "http-request"
  };
  const existing = new Set(existingKeys);
  const baseKey = baseKeyByType[type];
  let key = baseKey;
  let suffix = 2;

  while (existing.has(key)) {
    key = `${baseKey}-${suffix}`;
    suffix += 1;
  }

  const retry = { maxAttempts: 1, backoffMs: 0 };

  if (type === "delay") {
    return { key, name: "Delay", type, config: { ms: 1000 }, retry };
  }

  if (type === "http") {
    return {
      key,
      name: "HTTP Request",
      type,
      config: {
        url: "https://example.com",
        method: "GET",
        headers: {},
        timeoutMs: 10_000
      },
      retry
    };
  }

  return { key, name: "No-op", type, config: {}, retry };
}

export function appendStepToGraph(
  graph: WorkflowGraph,
  step: WorkflowStepDefinition,
  position?: CanvasPosition
): WorkflowGraph {
  const tailId = findTailNodeId(graph);
  const fallbackPosition = {
    x: firstStepX + graph.nodes.length * stepSpacingX,
    y: defaultStartPosition.y
  };

  return {
    nodes: [...graph.nodes, { id: step.key, step, position: position ?? fallbackPosition }],
    edges: [
      ...graph.edges,
      {
        id: edgeId(tailId, step.key),
        source: tailId,
        target: step.key
      }
    ]
  };
}

export function removeStepFromGraph(graph: WorkflowGraph, nodeId: string): WorkflowGraph {
  const incoming = graph.edges.find((edge) => edge.target === nodeId);
  const outgoing = graph.edges.find((edge) => edge.source === nodeId);
  const edges = graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

  if (incoming && outgoing) {
    edges.push({
      id: edgeId(incoming.source, outgoing.target),
      source: incoming.source,
      target: outgoing.target
    });
  }

  return {
    nodes: graph.nodes.filter((node) => node.id !== nodeId),
    edges
  };
}

export function replaceConnection(
  graph: WorkflowGraph,
  source: string,
  target: string
): WorkflowGraph {
  const edges = graph.edges.filter(
    (edge) => edge.source !== source && edge.target !== target
  );

  return {
    ...graph,
    edges: [...edges, { id: edgeId(source, target), source, target }]
  };
}

export function reorderStepAfter(
  graph: WorkflowGraph,
  source: string,
  target: string
): WorkflowGraph {
  if (source === target || target === startNodeId) {
    return graph;
  }

  const currentOrder = getConnectedStepIds(graph);

  if (
    currentOrder.length !== graph.nodes.length ||
    !currentOrder.includes(target) ||
    (source !== startNodeId && !currentOrder.includes(source))
  ) {
    return graph;
  }

  const nextOrder = currentOrder.filter((nodeId) => nodeId !== target);
  const sourceIndex = source === startNodeId ? -1 : nextOrder.indexOf(source);

  nextOrder.splice(sourceIndex + 1, 0, target);

  return {
    ...graph,
    edges: buildOrderedEdges(nextOrder)
  };
}

export function startNodePosition() {
  return { ...defaultStartPosition };
}

function buildOrderedEdges(stepIds: string[]): WorkflowGraphEdge[] {
  return stepIds.map((stepId, index) => {
    const source = index === 0 ? startNodeId : stepIds[index - 1]!;

    return {
      id: edgeId(source, stepId),
      source,
      target: stepId
    };
  });
}

function findTailNodeId(graph: WorkflowGraph) {
  const sourceIds = new Set(graph.edges.map((edge) => edge.source));
  const tail = graph.nodes.find((node) => !sourceIds.has(node.id));

  return tail?.id ?? startNodeId;
}

function getConnectedStepIds(graph: WorkflowGraph) {
  const nextBySource = new Map(graph.edges.map((edge) => [edge.source, edge.target]));
  const orderedIds: string[] = [];
  const visited = new Set<string>();
  let currentId = nextBySource.get(startNodeId);

  while (currentId && !visited.has(currentId)) {
    orderedIds.push(currentId);
    visited.add(currentId);
    currentId = nextBySource.get(currentId);
  }

  return orderedIds;
}

function edgeId(source: string, target: string) {
  return `${source}->${target}`;
}

function getStepLabel(step: WorkflowStepDefinition) {
  return step.name ?? step.key;
}

function deduplicateIssues(issues: WorkflowGraphIssue[]) {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.nodeId ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
