import type { ChemdDocument, Diagnostic, SourceSpan } from "@chemd/core";
import {
  CHEMD_RENDERABLE_NODE_SCHEMA_VERSION,
  CHEMD_SEMANTIC_RENDER_TREE_SCHEMA_VERSION,
  type ChemdCompilerResultRenderInput,
  type ChemdNodeDiagnosticV1,
  type ChemdRenderableNodeTypeV1,
  type ChemdRenderableNodeV1,
  type ChemdRenderDirectiveV1,
  type ChemdSemanticRenderTreeInput,
  type ChemdSemanticRenderTreeV1,
  type ChemdSourceRefV1
} from "./types";

type PlainRecord = Record<string, unknown>;

interface BuildContext {
  documentId?: string;
  sourceHash?: string;
  sourceUri?: string;
  diagnostics: ChemdNodeDiagnosticV1[];
}

const isRecord = (value: unknown): value is PlainRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isChemdDocument = (value: unknown): value is ChemdDocument =>
  isRecord(value) && value.type === "document" && isRecord(value.meta) && Array.isArray(value.children);

const isCompilerInput = (value: unknown): value is ChemdCompilerResultRenderInput =>
  isRecord(value) && isChemdDocument(value.document);

const sanitizeSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "-") || "unnamed";

const typeToRenderableNodeType = (type: unknown): ChemdRenderableNodeTypeV1 => {
  switch (type) {
    case "document": return "ChemdDocumentNode";
    case "markdown": return "ChemdParagraphNode";
    case "molecule": return "ChemdMoleculeNode";
    case "material": return "ChemdMaterialNode";
    case "batch": return "ChemdBatchNode";
    case "reaction": return "ChemdReactionNode";
    case "condition_varies": return "ChemdConditionNode";
    case "procedure": return "ChemdProcedureNode";
    case "step": return "ChemdProcedureStepNode";
    case "result": return "ChemdResultNode";
    case "analysis": return "ChemdAnalysisNode";
    case "sample": return "ChemdSampleNode";
    case "artifact": return "ChemdArtifactNode";
    case "observation": return "ChemdEvidenceNode";
    case "template": return "ChemdTemplateNode";
    case "col": return "ChemdColumnNode";
    default: return "ChemdUnknownNode";
  }
};

const directiveForType = (nodeType: ChemdRenderableNodeTypeV1): ChemdRenderDirectiveV1 => {
  switch (nodeType) {
    case "ChemdDocumentNode":
      return { mode: "block", component: "DocumentShell", hydrate: "never", priority: "critical" };
    case "ChemdMoleculeNode":
      return { mode: "block", component: "MoleculeBlock", hydrate: "visible", priority: "normal" };
    case "ChemdReactionNode":
      return { mode: "block", component: "ReactionBlock", hydrate: "visible", priority: "normal" };
    case "ChemdEvidenceNode":
      return { mode: "panel", component: "EvidencePanel", hydrate: "manual", priority: "deferred" };
    case "ChemdUnknownNode":
      return { mode: "block", component: "UnknownChemdNode", hydrate: "never", priority: "normal", fallback: "Unsupported Chemd node" };
    default:
      return { mode: "block", component: `${nodeType.replace(/^Chemd|Node$/g, "")}Block`, hydrate: "never", priority: "normal" };
  }
};

const sourceRefFromSpan = (
  span: SourceSpan | undefined,
  context: BuildContext
): ChemdSourceRefV1 | undefined => {
  if (!span) {
    return undefined;
  }
  return {
    source_kind: "chemd",
    source_uri: context.sourceUri,
    start_line: span.startLine,
    end_line: span.endLine,
    start_offset: span.start,
    end_offset: span.end,
    source_hash: context.sourceHash
  };
};

const getStringField = (record: PlainRecord, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
};

const getSemanticId = (record: PlainRecord, nodeType: ChemdRenderableNodeTypeV1): string | undefined => {
  if (nodeType === "ChemdDocumentNode" && isRecord(record.meta)) {
    return getStringField(record.meta, ["id"]);
  }
  return getStringField(record, ["id", "stepId", "eventId", "name", "template"]);
};

const buildNodeId = (
  nodeType: ChemdRenderableNodeTypeV1,
  semanticId: string | undefined,
  path: string[]
): string => {
  const key = nodeType.replace(/^Chemd/, "").replace(/Node$/, "").replace(/[A-Z]/g, "-$&").toLowerCase();
  const suffix = semanticId ?? path.join(".");
  return `${key.replace(/^-/, "")}::${sanitizeSegment(suffix)}`;
};

const isJsonLike = (value: unknown): boolean => {
  if (value === null) {
    return true;
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }
  return Array.isArray(value) || isRecord(value);
};

const buildAttrs = (record: PlainRecord, nodeType: ChemdRenderableNodeTypeV1): Record<string, unknown> => {
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (["children", "diagnostics", "sourceSpan", "fieldSpans"].includes(key)) {
      continue;
    }
    if (isJsonLike(value)) {
      attrs[key] = value;
    }
  }
  if (nodeType === "ChemdUnknownNode") {
    attrs.unknown_type = typeof record.type === "string" ? record.type : "missing";
  }
  return attrs;
};

const collectChildInputs = (record: PlainRecord): unknown[] => {
  if (Array.isArray(record.children)) {
    return record.children;
  }
  if (Array.isArray(record.body)) {
    return record.body;
  }
  if (Array.isArray(record.steps)) {
    return record.steps;
  }
  return [];
};

const mapDiagnostic = (diagnostic: Diagnostic): ChemdNodeDiagnosticV1 => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  node_id: diagnostic.nodeId ?? diagnostic.sourceNodeId,
  source_ref: diagnostic.position
    ? {
        source_kind: "chemd",
        start_line: diagnostic.position.start.line,
        end_line: diagnostic.position.end.line
      }
    : undefined,
  facts: diagnostic.facts
});

const diagnosticsForNode = (
  nodeId: string,
  semanticId: string | undefined,
  diagnostics: ChemdNodeDiagnosticV1[]
): ChemdNodeDiagnosticV1[] =>
  diagnostics.filter((diagnostic) => diagnostic.node_id === nodeId || diagnostic.node_id === semanticId);

const buildUnknownDiagnostic = (
  nodeId: string,
  record: PlainRecord
): ChemdNodeDiagnosticV1 => ({
  code: "semantic_rendering.unknown_node_type",
  severity: "warning",
  message: `Unknown Chemd node type: ${typeof record.type === "string" ? record.type : "missing"}`,
  node_id: nodeId
});

const buildRenderableNode = (
  input: unknown,
  path: string[],
  context: BuildContext
): ChemdRenderableNodeV1 => {
  const record = isRecord(input) ? input : { type: "unknown", value: input };
  const nodeType = typeToRenderableNodeType(record.type);
  const semanticId = getSemanticId(record, nodeType);
  const nodeId = buildNodeId(nodeType, semanticId, path);
  const childInputs = collectChildInputs(record);
  const diagnostics = diagnosticsForNode(nodeId, semanticId, context.diagnostics);

  if (nodeType === "ChemdUnknownNode") {
    diagnostics.push(buildUnknownDiagnostic(nodeId, record));
  }

  return {
    schema_version: CHEMD_RENDERABLE_NODE_SCHEMA_VERSION,
    node_id: nodeId,
    node_type: nodeType,
    document_id: context.documentId,
    entity_id: semanticId && nodeType !== "ChemdDocumentNode" ? `${String(record.type)}::${semanticId}` : undefined,
    semantic_id: semanticId,
    original_id: getStringField(record, ["id"]),
    source_ref: sourceRefFromSpan(record.sourceSpan as SourceSpan | undefined, context),
    attrs: buildAttrs(record, nodeType),
    children: childInputs.map((child, index) => buildRenderableNode(child, [...path, String(index)], context)),
    render: directiveForType(nodeType),
    diagnostics
  };
};

const flattenNodes = (node: ChemdRenderableNodeV1): ChemdRenderableNodeV1[] => [
  node,
  ...node.children.flatMap((child) => flattenNodes(child))
];

const uniqueDiagnostics = (diagnostics: ChemdNodeDiagnosticV1[]): ChemdNodeDiagnosticV1[] => {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}|${diagnostic.severity}|${diagnostic.node_id ?? ""}|${diagnostic.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const normalizeInput = (input: ChemdSemanticRenderTreeInput): {
  document: ChemdDocument;
  diagnostics: Diagnostic[];
  sourceHash?: string;
  sourceUri?: string;
} => {
  if (isCompilerInput(input)) {
    return {
      document: input.document,
      diagnostics: input.diagnostics ?? input.document.diagnostics,
      sourceHash: input.sourceHash,
      sourceUri: input.sourceUri
    };
  }
  if (isChemdDocument(input)) {
    return { document: input, diagnostics: input.diagnostics };
  }
  throw new TypeError("buildSemanticRenderTree requires a ChemdDocument or compiler result subset");
};

export const buildSemanticRenderTree = (
  input: ChemdSemanticRenderTreeInput
): ChemdSemanticRenderTreeV1 => {
  const normalized = normalizeInput(input);
  const diagnostics = normalized.diagnostics.map(mapDiagnostic);
  const context: BuildContext = {
    documentId: normalized.document.meta.id,
    sourceHash: normalized.sourceHash,
    sourceUri: normalized.sourceUri,
    diagnostics
  };
  const root = buildRenderableNode(normalized.document, ["root"], context);
  const nodes = flattenNodes(root);
  const allDiagnostics = uniqueDiagnostics([...diagnostics, ...nodes.flatMap((node) => node.diagnostics)]);

  return {
    schema_version: CHEMD_SEMANTIC_RENDER_TREE_SCHEMA_VERSION,
    document_id: normalized.document.meta.id,
    root,
    nodes,
    diagnostics: allDiagnostics,
    warnings: allDiagnostics.filter((diagnostic) => diagnostic.severity === "warning")
  };
};
