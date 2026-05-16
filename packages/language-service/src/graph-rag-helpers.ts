import type {
  EditorGraphRagConfidence,
  EditorGraphRagEdge,
  EditorGraphRagEdgeType,
  EditorGraphRagNode,
  EditorGraphRagNodeKind,
  EditorGraphRagSourceRange,
  GraphBuildContext
} from "./graph-rag-types";

interface CreateGraphNodeInput {
  context: GraphBuildContext;
  nodeKind: EditorGraphRagNodeKind;
  entityId: string;
  sourceRange: EditorGraphRagSourceRange;
  payload: Record<string, unknown>;
  blockId?: string;
}

interface CreateGraphEdgeInput {
  context: GraphBuildContext;
  edgeType: EditorGraphRagEdgeType;
  fromNodeId: string;
  toNodeId: string;
  confidence: EditorGraphRagConfidence;
  evidence: Record<string, unknown>;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : { value };

export const readString = (
  record: Record<string, unknown>,
  key: string
): string | undefined => typeof record[key] === "string" ? record[key] : undefined;

const stablePart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_.:-]+/g, "-");

export const makeId = (...parts: string[]): string =>
  parts.map(stablePart).join("::");

export const confidenceFromScore = (score: unknown): EditorGraphRagConfidence => {
  if (typeof score !== "number") {
    return "unknown";
  }
  return score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low";
};

const toSourceRange = (value: unknown): EditorGraphRagSourceRange | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const range: EditorGraphRagSourceRange = {};
  for (const key of ["start", "end", "startLine", "startColumn", "endLine", "endColumn"]) {
    if (typeof value[key] === "number") {
      range[key as keyof EditorGraphRagSourceRange] = value[key];
    }
  }
  return Object.keys(range).length > 0 ? range : undefined;
};

const firstSourceRange = (value: unknown): EditorGraphRagSourceRange | undefined =>
  isRecord(value) ? Object.values(value).map(toSourceRange).find(Boolean) : undefined;

export const readEntityRange = (
  entity: Record<string, unknown>,
  blockRanges: Map<string, EditorGraphRagSourceRange>,
  fallback: EditorGraphRagSourceRange
): EditorGraphRagSourceRange => {
  const originalId = readString(entity, "original_id");
  return (originalId ? blockRanges.get(originalId) : undefined)
    ?? firstSourceRange(entity.field_source_spans)
    ?? toSourceRange(entity.source_span)
    ?? fallback;
};

export const createNode = ({
  context,
  nodeKind,
  entityId,
  sourceRange,
  payload,
  blockId
}: CreateGraphNodeInput): EditorGraphRagNode => ({
  nodeId: makeId(context.graphSnapshotId, nodeKind, entityId),
  graphSnapshotId: context.graphSnapshotId,
  experimentId: context.input.experimentId,
  revisionId: context.input.revisionId,
  entityId,
  nodeKind,
  ...(blockId ? { blockId } : {}),
  sourceRange,
  payload,
  createdAt: context.input.createdAt
});

export const createEdge = ({
  context,
  edgeType,
  fromNodeId,
  toNodeId,
  confidence,
  evidence
}: CreateGraphEdgeInput): EditorGraphRagEdge => ({
  edgeId: makeId(context.graphSnapshotId, edgeType, fromNodeId, toNodeId),
  graphSnapshotId: context.graphSnapshotId,
  experimentId: context.input.experimentId,
  fromNodeId,
  toNodeId,
  edgeType,
  confidence,
  evidence,
  createdAt: context.input.createdAt
});

export const indexGraphNodes = (
  context: GraphBuildContext,
  nodes: readonly EditorGraphRagNode[]
): void => {
  for (const node of nodes) {
    if (node.blockId) {
      context.nodeByBlockId.set(node.blockId, node);
    }
    context.nodeByEntityId.set(node.entityId, node);
  }
};

export const routeEdgeType = (
  relationType: unknown
): EditorGraphRagEdgeType | undefined => {
  if (relationType === "reaction_depends_on_reaction") {
    return "route_prev";
  }
  if (relationType === "reaction_precedes_reaction") {
    return "route_next";
  }
  return relationType === "result_describes_reaction" ? "evidence_link" : undefined;
};
