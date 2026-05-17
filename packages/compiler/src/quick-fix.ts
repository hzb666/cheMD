import type { Diagnostic, DiagnosticQuickFix as CoreDiagnosticQuickFix } from "@chemd/core";
import type { QuickFix } from "@chemd/diagnostics";
import { applyAuthoringPatch } from "./authoring-apply";
import { APPLY_AUTHORING_PATCH_QUICK_FIX_KIND } from "./authoring-diagnostics";
import type { AuthoringPatch } from "./authoring-types";

export type DiagnosticQuickFix = QuickFix | CoreDiagnosticQuickFix;
export type DiagnosticWithQuickFixes = Diagnostic;

const LEGACY_BLOCK_KINDS = new Set(["molecule", "reaction"]);
const REACTION_FIELD_KEYS = new Set(["reac", "reactant", "reactants", "prod", "product", "products"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAuthoringPatch = (value: unknown): value is AuthoringPatch => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "append_document_text") {
    return typeof value.text === "string";
  }

  if (value.kind === "insert_after_block") {
    return typeof value.blockId === "string" && typeof value.text === "string";
  }

  if (value.kind === "insert_field_line") {
    return typeof value.blockId === "string" && typeof value.line === "string";
  }

  if (value.kind === "insert_frontmatter_line") {
    return typeof value.line === "string";
  }

  if (value.kind === "batch") {
    return Array.isArray(value.patches) && value.patches.every((item) => isAuthoringPatch(item));
  }

  return false;
};

const readString = (record: Record<string, unknown>, key: string): string | undefined =>
  typeof record[key] === "string" ? record[key] : undefined;

const readPatch = (quickFix: DiagnosticQuickFix): Record<string, unknown> =>
  isRecord(quickFix.patch) ? quickFix.patch : {};

const readHeaderId = (headerArg: string | undefined): string | undefined => {
  const trimmed = headerArg?.trim() ?? "";
  return trimmed.startsWith("#") ? trimmed.slice(1) : undefined;
};

const splitSourceLines = (source: string): string[] =>
  source.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const isBlockTypeChar = (char: string): boolean =>
  (char >= "A" && char <= "Z")
  || (char >= "a" && char <= "z")
  || (char >= "0" && char <= "9")
  || char === "_"
  || char === "-";

const readBlockHeader = (line: string): { type: string; arg?: string } | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(":::")) return undefined;
  let index = 3;
  const first = trimmed[index] ?? "";
  if (!((first >= "A" && first <= "Z") || (first >= "a" && first <= "z"))) {
    return undefined;
  }
  index += 1;
  while (isBlockTypeChar(trimmed[index] ?? "")) index += 1;
  const type = trimmed.slice(3, index);
  if (index >= trimmed.length) return { type };
  if (trimmed[index] !== " " && trimmed[index] !== "\t") return undefined;
  return { type, arg: trimmed.slice(index).trim() };
};

const readFieldKey = (line: string): string | undefined => {
  const trimmed = line.trimStart();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) return undefined;
  return trimmed.slice(0, colonIndex).trim();
};

const isChemdClose = (line: string): boolean => line.trim() === ":::";

const inferChemdKindFromBlock = (blockLines: string[]): "molecule" | "reaction" =>
  blockLines.some((line) => {
    const field = readFieldKey(line);
    return Boolean(field && REACTION_FIELD_KEYS.has(field.toLowerCase()));
  }) ? "reaction" : "molecule";

const readInsertKind = (
  diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix,
  blockLines: string[]
): "molecule" | "reaction" | undefined => {
  const patch = readPatch(quickFix);
  const patchKind = readString(patch, "kind");
  const factKind = typeof diagnostic.facts?.inferred_kind === "string"
    ? diagnostic.facts.inferred_kind
    : undefined;
  const kind = patchKind ?? factKind ?? inferChemdKindFromBlock(blockLines);

  return kind === "molecule" || kind === "reaction" ? kind : undefined;
};

const readTargetNodeId = (
  diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix
): string | undefined => {
  const patch = readPatch(quickFix);
  return readString(patch, "source_node_id")
    ?? diagnostic.sourceNodeId
    ?? diagnostic.nodeId;
};

const readTargetLegacyKind = (
  diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix
): "molecule" | "reaction" | undefined => {
  const patch = readPatch(quickFix);
  const sourceNodeType = readString(patch, "source_node_type")
    ?? diagnostic.sourceNodeType
    ?? (typeof diagnostic.facts?.legacy_block_kind === "string" ? diagnostic.facts.legacy_block_kind : undefined);
  return sourceNodeType === "molecule" || sourceNodeType === "reaction" ? sourceNodeType : undefined;
};

const findChemdBlock = (
  lines: string[],
  targetNodeId: string | undefined
): { headerIndex: number; endIndex: number } | undefined => {
  for (let index = 0; index < lines.length; index += 1) {
    const header = readBlockHeader(lines[index]);
    if (header?.type !== "chemd") {
      continue;
    }

    const headerId = readHeaderId(header.arg);
    if (targetNodeId && headerId !== targetNodeId) {
      continue;
    }

    let endIndex = index + 1;
    while (endIndex < lines.length && !isChemdClose(lines[endIndex])) {
      endIndex += 1;
    }

    return { headerIndex: index, endIndex };
  }

  return undefined;
};

const findLegacyBlock = (
  lines: string[],
  targetNodeId: string | undefined,
  targetKind: "molecule" | "reaction"
): { headerArg: string | undefined; headerIndex: number; endIndex: number } | undefined => {
  if (!targetNodeId) {
    return undefined;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const header = readBlockHeader(lines[index]);
    if (!header || header.type !== targetKind || !LEGACY_BLOCK_KINDS.has(header.type)) {
      continue;
    }

    const headerArg = header.arg;
    if (readHeaderId(headerArg) !== targetNodeId) {
      continue;
    }

    let endIndex = index + 1;
    while (endIndex < lines.length && !isChemdClose(lines[endIndex])) {
      endIndex += 1;
    }

    return { headerArg, headerIndex: index, endIndex };
  }

  return undefined;
};

const applyInsertChemdKind = (
  source: string,
  diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix
): string => {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitSourceLines(source);
  const targetNodeId = readTargetNodeId(diagnostic, quickFix);
  if (!targetNodeId) {
    return source;
  }

  const block = findChemdBlock(lines, targetNodeId);
  if (!block) {
    return source;
  }

  const bodyLines = lines.slice(block.headerIndex + 1, block.endIndex);
  if (bodyLines.some((line) => readFieldKey(line)?.toLowerCase() === "kind")) {
    return source;
  }

  const kind = readInsertKind(diagnostic, quickFix, bodyLines);
  if (!kind) {
    return source;
  }

  const nextLines = [...lines];
  nextLines.splice(block.headerIndex + 1, 0, `kind: ${kind}`);
  return nextLines.join(eol);
};

const applyConvertLegacyBlock = (
  source: string,
  diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix
): string => {
  const legacyKind = readTargetLegacyKind(diagnostic, quickFix);
  const targetNodeId = readTargetNodeId(diagnostic, quickFix);
  if (!legacyKind || !targetNodeId) {
    return source;
  }

  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitSourceLines(source);
  const block = findLegacyBlock(lines, targetNodeId, legacyKind);
  if (!block) {
    return source;
  }

  const bodyLines = lines.slice(block.headerIndex + 1, block.endIndex);
  const nextLines = [...lines];
  nextLines[block.headerIndex] = block.headerArg?.trim()
    ? `:::chemd ${block.headerArg.trim()}`
    : ":::chemd";
  if (!bodyLines.some((line) => readFieldKey(line)?.toLowerCase() === "kind")) {
    nextLines.splice(block.headerIndex + 1, 0, `kind: ${legacyKind}`);
  }

  return nextLines.join(eol);
};

export const applyDiagnosticQuickFix = (
  source: string,
  diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix
): string => {
  if (quickFix.kind === APPLY_AUTHORING_PATCH_QUICK_FIX_KIND && isAuthoringPatch(quickFix.patch)) {
    return applyAuthoringPatch(source, quickFix.patch);
  }

  if (quickFix.kind === "insert_chemd_kind") {
    return applyInsertChemdKind(source, diagnostic, quickFix);
  }

  if (quickFix.kind === "convert_legacy_block") {
    return applyConvertLegacyBlock(source, diagnostic, quickFix);
  }

  return source;
};
