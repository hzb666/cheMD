import type { CompileResult } from "@chemd/compiler";
import type { ChemdNode } from "@chemd/core";
import {
  buildBlockRangeMap,
  createDocumentRange,
  createMetadataRange
} from "./ranges";
import type {
  ChemdOutlineItem,
  ChemdOutlineKind,
  ChemdSourceRange,
  ChemdSymbol
} from "./types";

const OUTLINE_KINDS = new Set<string>([
  "molecule",
  "material",
  "batch",
  "reaction",
  "result",
  "analysis",
  "sample",
  "procedure",
  "observation",
  "template"
]);

const readNodeId = (node: ChemdNode): string | undefined => {
  if ("id" in node && typeof node.id === "string") {
    return node.id;
  }

  return node.type === "template" ? node.name : undefined;
};

const isOutlineKind = (kind: string): kind is ChemdOutlineKind =>
  OUTLINE_KINDS.has(kind);

const readOutlineKind = (node: ChemdNode): ChemdOutlineKind | undefined =>
  isOutlineKind(node.type) ? node.type : undefined;

const readRange = (
  id: string | undefined,
  ranges: Map<string, ChemdSourceRange>,
  fallback: ChemdSourceRange
): ChemdSourceRange => id ? ranges.get(id) ?? fallback : fallback;

const createOutlineItem = (
  node: ChemdNode,
  ranges: Map<string, ChemdSourceRange>,
  fallback: ChemdSourceRange
): ChemdOutlineItem | undefined => {
  const kind = readOutlineKind(node);
  const id = readNodeId(node);
  if (!kind || !id) {
    return undefined;
  }

  return {
    id,
    label: id,
    kind,
    range: readRange(id, ranges, fallback)
  };
};

export const buildOutline = (
  result: CompileResult,
  source: string
): ChemdOutlineItem[] => {
  const ranges = buildBlockRangeMap(source);
  const fallback = createDocumentRange(source);
  const metadata: ChemdOutlineItem = {
    id: `${result.document.meta.id}:metadata`,
    label: result.document.meta.title,
    kind: "metadata",
    range: createMetadataRange(source)
  };
  const bodyItems = result.document.children.flatMap((node) => {
    const item = createOutlineItem(node, ranges, fallback);
    return item ? [item] : [];
  });

  return [metadata, ...bodyItems];
};

export const buildSymbols = (
  result: CompileResult,
  source: string
): ChemdSymbol[] => {
  const ranges = buildBlockRangeMap(source);
  const fallback = createDocumentRange(source);

  return result.typedSemanticGraph.nodes.map((node) => ({
    id: node.nodeId,
    label: node.nodeId,
    kind: node.kind,
    range: readRange(node.nodeId, ranges, fallback),
    sourceNodeType: node.sourceNodeType
  }));
};
