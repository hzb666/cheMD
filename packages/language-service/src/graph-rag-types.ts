import type { ChemdLanguageServiceDependencies } from "./compile";
import type { ChemdLanguageCompileInput, ChemdLanguageCompileOutput } from "./types";

export interface EditorGraphRagSourceRange {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export type EditorGraphRagNodeKind =
  | "document"
  | "metadata"
  | "block"
  | "entity"
  | "diagnostic";

export type EditorGraphRagEdgeType =
  | "document_order"
  | "block_contains_entity"
  | "route_prev"
  | "route_next"
  | "evidence_link"
  | "diagnostic_evidence";

export type EditorGraphRagConfidence = "low" | "medium" | "high" | "unknown";

export interface EditorGraphRagSnapshot {
  graphSnapshotId: string;
  experimentId: string;
  sourceRevisionIds: string[];
  graphKind: "reaction" | "rag_context" | "agent_audit";
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
}

export interface EditorGraphRagNode {
  nodeId: string;
  graphSnapshotId: string;
  experimentId: string;
  revisionId: string;
  entityId: string;
  nodeKind: EditorGraphRagNodeKind;
  blockId?: string;
  sourceRange: EditorGraphRagSourceRange;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface EditorGraphRagEdge {
  edgeId: string;
  graphSnapshotId: string;
  experimentId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: EditorGraphRagEdgeType;
  confidence: EditorGraphRagConfidence;
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface EditorGraphRagCitationCandidate {
  citationId: string;
  revisionId: string;
  chunkId: string;
  experimentId: string;
  documentUri?: string;
  entityId?: string;
  blockId?: string;
  sourceRange: EditorGraphRagSourceRange;
  citation: {
    experimentId: string;
    revisionId: string;
    chunkId: string;
    documentUri?: string;
    entityId?: string;
    sourceRange: EditorGraphRagSourceRange;
  };
  quality: Record<string, unknown>;
  createdAt: string;
}

export interface BuildEditorGraphRagRecordsInput {
  source: string;
  experimentId: string;
  revisionId: string;
  createdAt: string;
  documentUri?: string;
  graphSnapshotId?: string;
  compileOutput?: ChemdLanguageCompileOutput;
  dependencies?: ChemdLanguageServiceDependencies;
  options?: ChemdLanguageCompileInput["options"];
}

export interface EditorGraphRagRecords {
  compileOutput: ChemdLanguageCompileOutput;
  graphSnapshot: EditorGraphRagSnapshot;
  reactionGraphNodes: EditorGraphRagNode[];
  reactionGraphEdges: EditorGraphRagEdge[];
  ragCitationCandidates: EditorGraphRagCitationCandidate[];
}

export interface EntityCandidate {
  entityId: string;
  kind: string;
  sourceRange: EditorGraphRagSourceRange;
  payload: Record<string, unknown>;
  originalId?: string;
}

export interface GraphBuildContext {
  graphSnapshotId: string;
  input: BuildEditorGraphRagRecordsInput;
  documentRange: EditorGraphRagSourceRange;
  entityById: Map<string, EntityCandidate>;
  nodeByBlockId: Map<string, EditorGraphRagNode>;
  nodeByEntityId: Map<string, EditorGraphRagNode>;
}
