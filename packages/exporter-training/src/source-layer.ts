import type { ChemdDocument, ChemdNode } from "@chemd/core";

import type { ExportedDiagnostic, SourceLayerV1, SourceNodeSnapshot } from "./types";
import { TRAINING_AUDIT_ONLY_FIELDS } from "./governance";

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
};

const getOriginalId = (node: ChemdNode): string | undefined => {
  if ("id" in node && typeof node.id === "string" && node.id) {
    return node.id;
  }

  return undefined;
};

const readNodeStringField = (node: ChemdNode, field: string): string | undefined => {
  if (!(field in node)) {
    return undefined;
  }

  const value = (node as unknown as Record<string, unknown>)[field];
  return typeof value === "string" ? value : undefined;
};

const createSourceSnapshot = (node: ChemdNode, nodeIndex: number): SourceNodeSnapshot => ({
  node_index: nodeIndex,
  node_type: node.type,
  original_id: getOriginalId(node),
  source_block_type: readNodeStringField(node, "syntaxOrigin") ?? node.type,
  syntax_origin: readNodeStringField(node, "syntaxOrigin"),
  declared_kind: readNodeStringField(node, "declaredKind"),
  raw_payload: toRecord(node)
});

const createExportedDiagnostic = (diagnostic: ChemdDocument["diagnostics"][number]): ExportedDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  ...(diagnostic.nodeId ? { node_id: diagnostic.nodeId } : {}),
  ...(diagnostic.position
    ? {
        position: {
          ...(diagnostic.position.start ? { start: diagnostic.position.start } : {}),
          ...(diagnostic.position.end ? { end: diagnostic.position.end } : {})
        }
      }
    : {})
});

export const buildSourceLayer = (document: ChemdDocument): SourceLayerV1 => ({
  ...(typeof document.source === "string" ? { raw_source: document.source, resolved_source: document.source } : {}),
  raw_meta: toRecord(document.meta),
  raw_children: document.children.map((node, nodeIndex) => createSourceSnapshot(node, nodeIndex)),
  diagnostics: document.diagnostics.map((diagnostic) => createExportedDiagnostic(diagnostic)),
  audit_only_fields: TRAINING_AUDIT_ONLY_FIELDS
});
