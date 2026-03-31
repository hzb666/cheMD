import type { ChemdDocument, ChemdNode } from "@chemd/core";

import type { ExportedDiagnostic, SourceLayerV1, SourceNodeSnapshot } from "./types";

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

const createSourceSnapshot = (node: ChemdNode, nodeIndex: number): SourceNodeSnapshot => ({
  node_index: nodeIndex,
  node_type: node.type,
  original_id: getOriginalId(node),
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
  diagnostics: document.diagnostics.map((diagnostic) => createExportedDiagnostic(diagnostic))
});
