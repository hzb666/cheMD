import type { Diagnostic } from "@chemd/core";

import { getSpanFromOffsets } from "../shared/source-location";

export type LegacyProgramDiagnosticCode =
  | "E_LEGACY_FRONTMATTER_REMOVED"
  | "E_LEGACY_FENCED_BLOCK_REMOVED"
  | "E_LEGACY_TEMPLATE_REMOVED"
  | "E_LEGACY_COLUMN_LAYOUT_REMOVED";

interface LegacySyntaxMatch {
  code: LegacyProgramDiagnosticCode;
  message: string;
  start: number;
  end: number;
}

const FENCED_BLOCK_PATTERN = /^[ \t]*:::\s*([A-Za-z][A-Za-z0-9_-]*)?/gm;

export const detectLegacySyntax = (source: string): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const frontmatter = detectFrontmatter(source);
  if (frontmatter) {
    diagnostics.push(createLegacyDiagnostic(source, frontmatter));
  }
  for (const match of detectLegacyFencedBlocks(source)) {
    diagnostics.push(createLegacyDiagnostic(source, match));
  }
  return diagnostics;
};

export const createLegacySyntaxDiagnostics = detectLegacySyntax;

export const hasFatalLegacySyntax = (source: string): boolean =>
  detectLegacySyntax(source).length > 0;

const detectFrontmatter = (source: string): LegacySyntaxMatch | undefined => {
  const normalized = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const offset = source.length - normalized.length;
  if (!normalized.startsWith("---\n") && !normalized.startsWith("---\r\n")) {
    return undefined;
  }
  return {
    code: "E_LEGACY_FRONTMATTER_REMOVED",
    message: "YAML frontmatter is removed in chemd/program-v1.",
    start: offset,
    end: offset + 3
  };
};

const detectLegacyFencedBlocks = (source: string): LegacySyntaxMatch[] => {
  const matches: LegacySyntaxMatch[] = [];
  for (const match of source.matchAll(FENCED_BLOCK_PATTERN)) {
    if (typeof match.index !== "number" || !match[1]) {
      continue;
    }
    matches.push(createFencedBlockMatch(match[1] ?? "", match.index, match[0]));
  }
  return matches;
};

const createFencedBlockMatch = (
  blockName: string,
  start: number,
  raw: string
): LegacySyntaxMatch => {
  const code = legacyFenceCode(blockName);
  return {
    code,
    message: legacyMessage(code, blockName),
    start,
    end: start + raw.length
  };
};

const legacyFenceCode = (blockName: string): LegacyProgramDiagnosticCode => {
  if (blockName === "template" || blockName === "use") {
    return "E_LEGACY_TEMPLATE_REMOVED";
  }
  if (blockName === "col" || /^col-\d+$/.test(blockName)) {
    return "E_LEGACY_COLUMN_LAYOUT_REMOVED";
  }
  return "E_LEGACY_FENCED_BLOCK_REMOVED";
};

const legacyMessage = (
  code: LegacyProgramDiagnosticCode,
  blockName: string
): string => {
  if (code === "E_LEGACY_TEMPLATE_REMOVED") {
    return "Legacy template syntax is removed in chemd/program-v1.";
  }
  if (code === "E_LEGACY_COLUMN_LAYOUT_REMOVED") {
    return "Legacy column layout syntax is removed in chemd/program-v1.";
  }
  return blockName
    ? `Legacy :::${blockName} fenced blocks are removed in chemd/program-v1.`
    : "Legacy fenced blocks are removed in chemd/program-v1.";
};

const createLegacyDiagnostic = (
  source: string,
  match: LegacySyntaxMatch
): Diagnostic => ({
  code: match.code,
  severity: "error",
  message: match.message,
  sourceLayer: "parser",
  sourceSpan: getSpanFromOffsets(source, match.start, match.end)
});
