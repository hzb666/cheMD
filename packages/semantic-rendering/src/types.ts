import type { ChemdDocument, Diagnostic } from "@chemd/core";

export const CHEMD_RENDERABLE_NODE_SCHEMA_VERSION = "chemd-renderable-node/v0.1";
export const CHEMD_SEMANTIC_RENDER_TREE_SCHEMA_VERSION = "chemd-semantic-render-tree/v0.1";

export type ChemdRenderableNodeTypeV1 =
  | "ChemdDocumentNode"
  | "ChemdSectionNode"
  | "ChemdParagraphNode"
  | "ChemdListNode"
  | "ChemdTableNode"
  | "ChemdMoleculeNode"
  | "ChemdMaterialNode"
  | "ChemdBatchNode"
  | "ChemdReactionNode"
  | "ChemdConditionNode"
  | "ChemdConditionAttemptNode"
  | "ChemdProcedureNode"
  | "ChemdProcedureStepNode"
  | "ChemdProcedureControlNode"
  | "ChemdResultNode"
  | "ChemdAnalysisNode"
  | "ChemdSampleNode"
  | "ChemdArtifactNode"
  | "ChemdEvidenceNode"
  | "ChemdObservationEventNode"
  | "ChemdTraceNode"
  | "ChemdTraceEventNode"
  | "ChemdTemplateNode"
  | "ChemdColumnNode"
  | "ChemdUnknownNode";

export type ChemdRenderModeV1 = "inline" | "block" | "panel" | "canvas";
export type ChemdHydrationPolicyV1 = "never" | "visible" | "manual" | "background";
export type ChemdRenderPriorityV1 = "critical" | "normal" | "deferred";
export type ChemdRenderStateV1 = "placeholder" | "hydrating" | "ready" | "error" | "stale";

export interface ChemdSourceRefV1 {
  source_kind: "chemd" | "markdown" | "ocr" | "external";
  source_uri?: string;
  start_line?: number;
  end_line?: number;
  start_offset?: number;
  end_offset?: number;
  source_hash?: string;
}

export interface ChemdNodeDiagnosticV1 {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  node_id?: string;
  source_ref?: ChemdSourceRefV1;
  facts?: Record<string, unknown>;
}

export interface ChemdRenderDirectiveV1 {
  mode: ChemdRenderModeV1;
  component: string;
  hydrate: ChemdHydrationPolicyV1;
  priority: ChemdRenderPriorityV1;
  data_ref?: string;
  fallback?: string;
}

export interface ChemdRenderableNodeV1 {
  schema_version: typeof CHEMD_RENDERABLE_NODE_SCHEMA_VERSION;
  node_id: string;
  node_type: ChemdRenderableNodeTypeV1;
  document_id?: string;
  entity_id?: string;
  semantic_id?: string;
  original_id?: string;
  source_ref?: ChemdSourceRefV1;
  attrs: Record<string, unknown>;
  children: ChemdRenderableNodeV1[];
  render: ChemdRenderDirectiveV1;
  diagnostics: ChemdNodeDiagnosticV1[];
}

export interface ChemdSemanticRenderTreeV1 {
  schema_version: typeof CHEMD_SEMANTIC_RENDER_TREE_SCHEMA_VERSION;
  document_id?: string;
  root: ChemdRenderableNodeV1;
  nodes: ChemdRenderableNodeV1[];
  diagnostics: ChemdNodeDiagnosticV1[];
  warnings: ChemdNodeDiagnosticV1[];
}

export interface ChemdCompilerResultRenderInput {
  document: ChemdDocument;
  diagnostics?: Diagnostic[];
  sourceHash?: string;
  sourceUri?: string;
}

export type ChemdSemanticRenderTreeInput =
  | ChemdDocument
  | ChemdCompilerResultRenderInput;

export type ChemdShellAttributesV1 = Record<`data-chemd-${string}`, string>;
