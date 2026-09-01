"use client";

import type { StepRunResponse, WorkflowStepType } from "@execloom/contracts";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  type NodeTypes
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, type DragEvent } from "react";

import { workflowStepDragType } from "@/components/workflow-editor/node-palette";
import {
  WorkflowStartNode,
  WorkflowStepNode,
  type StartFlowNode,
  type WorkflowStepFlowNode
} from "@/components/workflow-editor/workflow-node";
import {
  removeStepFromGraph,
  reorderStepAfter,
  replaceConnection,
  startNodeId,
  startNodePosition,
  validateWorkflowGraph,
  type CanvasPosition,
  type WorkflowGraph,
  type WorkflowGraphIssue
} from "@/lib/workflow-graph";

const nodeTypes: NodeTypes = {
  workflowStart: WorkflowStartNode,
  workflowStep: WorkflowStepNode
};
const fitViewOptions = { padding: 0.16, maxZoom: 1 };

type CanvasNode = StartFlowNode | WorkflowStepFlowNode;

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

export type WorkflowCanvasProps = {
  graph: WorkflowGraph;
  nodeIssues?: Map<string, string[]>;
  readOnly?: boolean;
  selectedNodeId: string | null;
  stepStatuses?: Map<string, StepRunResponse["status"]>;
  onAddStep?: (type: WorkflowStepType, position?: CanvasPosition) => void;
  onChange?: (graph: WorkflowGraph) => void;
  onIssues?: (issues: WorkflowGraphIssue[]) => void;
  onSelectNode?: (nodeId: string | null) => void;
};

function WorkflowCanvasInner({
  graph,
  nodeIssues,
  readOnly = false,
  selectedNodeId,
  stepStatuses,
  onAddStep,
  onChange,
  onIssues,
  onSelectNode
}: WorkflowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow();
  const sourceNodes = useMemo<CanvasNode[]>(
    () => [
      {
        id: startNodeId,
        type: "workflowStart",
        position: startNodePosition(),
        data: {},
        draggable: false,
        deletable: false,
        selected: selectedNodeId === startNodeId
      },
      ...graph.nodes.map<WorkflowStepFlowNode>((node) => ({
        id: node.id,
        type: "workflowStep",
        position: node.position,
        data: {
          step: node.step,
          executionStatus: stepStatuses?.get(node.id),
          validationMessage: nodeIssues?.get(node.id)?.[0]
        },
        draggable: !readOnly,
        deletable: !readOnly,
        selected: selectedNodeId === node.id
      }))
    ],
    [graph.nodes, nodeIssues, readOnly, selectedNodeId, stepStatuses]
  );
  const [nodes, setNodes, handleNodeChanges] = useNodesState<CanvasNode>(sourceNodes);

  useEffect(() => {
    setNodes((currentNodes) => {
      const currentById = new Map(currentNodes.map((node) => [node.id, node]));

      return sourceNodes.map((sourceNode) => {
        const currentNode = currentById.get(sourceNode.id);

        if (!currentNode) {
          return sourceNode;
        }

        return {
          ...currentNode,
          ...sourceNode,
          position: currentNode.position
        } as CanvasNode;
      });
    });
  }, [setNodes, sourceNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#737373", width: 16, height: 16 },
        style: { stroke: "#737373", strokeWidth: 1.6 },
        deletable: !readOnly,
        focusable: !readOnly
      })),
    [graph.edges, readOnly]
  );

  const handleNodeDragStop = useCallback<OnNodeDrag<CanvasNode>>(
    (_, node) => {
      if (readOnly || !onChange || node.id === startNodeId) {
        return;
      }

      onChange({
        ...graph,
        nodes: graph.nodes.map((graphNode) =>
          graphNode.id === node.id ? { ...graphNode, position: node.position } : graphNode
        )
      });
    },
    [graph, onChange, readOnly]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (
        readOnly ||
        !onChange ||
        !connection.source ||
        !connection.target ||
        connection.target === startNodeId
      ) {
        return;
      }

      if (connection.source === connection.target) {
        onIssues?.([
          {
            code: "SELF_CONNECTION",
            message: "A step cannot connect to itself.",
            nodeId: connection.source
          }
        ]);
        return;
      }

      const currentIssues = validateWorkflowGraph(graph);
      const proposal =
        currentIssues.length === 0
          ? reorderStepAfter(graph, connection.source, connection.target)
          : replaceConnection(graph, connection.source, connection.target);
      const proposalIssues = validateWorkflowGraph(proposal);

      if (proposalIssues.length > 0) {
        onIssues?.(proposalIssues);
        return;
      }

      onIssues?.([]);
      onChange(proposal);
    },
    [graph, onChange, onIssues, readOnly]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      if (readOnly || !onAddStep) {
        return;
      }

      const type = event.dataTransfer.getData(workflowStepDragType) as WorkflowStepType;

      if (!(["noop", "delay", "http"] as string[]).includes(type)) {
        return;
      }

      onAddStep(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [onAddStep, readOnly, screenToFlowPosition]
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const handleNodesDelete = useCallback<OnNodesDelete<CanvasNode>>(
    (deletedNodes) => {
      if (readOnly || !onChange) {
        return;
      }

      const nextGraph = deletedNodes.reduce(
        (currentGraph, node) =>
          node.id === startNodeId ? currentGraph : removeStepFromGraph(currentGraph, node.id),
        graph
      );
      onChange(nextGraph);
      onSelectNode?.(null);
    },
    [graph, onChange, onSelectNode, readOnly]
  );

  const handleEdgesDelete = useCallback<OnEdgesDelete<Edge>>(
    (deletedEdges) => {
      if (!readOnly && onChange) {
        onChange({
          ...graph,
          edges: graph.edges.filter(
            (edge) => !deletedEdges.some((deletedEdge) => deletedEdge.id === edge.id)
          )
        });
      }
    },
    [graph, onChange, readOnly]
  );

  const handleNodeClick = useCallback<NodeMouseHandler<CanvasNode>>(
    (_, node) => onSelectNode?.(node.id),
    [onSelectNode]
  );
  const handlePaneClick = useCallback(() => onSelectNode?.(null), [onSelectNode]);

  return (
    <div
      className="relative h-full min-h-[420px] w-full bg-[#fafafa]"
      data-testid="workflow-canvas"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <ReactFlow<CanvasNode, Edge>
        className="!absolute !inset-0 !h-auto !w-auto"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodeChanges}
        onNodeDragStop={handleNodeDragStop}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onConnect={handleConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodesConnectable={!readOnly}
        nodesDraggable={!readOnly}
        elementsSelectable
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.25}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#a84a4a" />
        <Controls showInteractive={false} />
        <MiniMap
          className="!h-[104px] !w-[160px] hidden sm:block"
          pannable
          zoomable
          nodeStrokeWidth={3}
          nodeColor={getMiniMapNodeColor}
          nodeStrokeColor="#737373"
          maskColor="rgb(245 245 245 / 70%)"
        />
      </ReactFlow>
    </div>
  );
}

function getMiniMapNodeColor(node: Node) {
  if (node.id === startNodeId) {
    return "#171717";
  }

  const type = (node.data as { step?: { type?: string } }).step?.type;

  if (type === "http") {
    return "#059669";
  }

  if (type === "delay") {
    return "#d97706";
  }

  return "#0284c7";
}
