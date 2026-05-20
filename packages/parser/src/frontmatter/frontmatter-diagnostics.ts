import type { Diagnostic } from "@chemd/core";
import { LineCounter, isMap, isSeq } from "yaml";

interface FrontmatterDiagnosticInput {
  code: string;
  severity: Diagnostic["severity"];
  message: string;
  lineIndex: number;
  lineText?: string;
  token?: string;
}

export const createFrontmatterDiagnostic = ({
  code,
  severity,
  message,
  lineIndex,
  lineText,
  token
}: FrontmatterDiagnosticInput): Diagnostic => {
  const resolvedLineText = lineText ?? "";
  const fallbackColumn = Math.max(resolvedLineText.search(/\S/) + 1, 1);
  const startColumn = token && resolvedLineText.includes(token)
    ? resolvedLineText.indexOf(token) + 1
    : fallbackColumn;
  const endColumn = startColumn + ((token?.length ?? Math.max(resolvedLineText.trim().length, 1)) - 1);

  return {
    code,
    severity,
    message,
    sourceLayer: "frontmatter",
    position: {
      // Frontmatter 从开头 `---` 之后起算，需要补回 2 行偏移。
      start: { line: lineIndex + 2, column: startColumn },
      end: { line: lineIndex + 2, column: endColumn }
    }
  };
};

export const getLineInfoFromOffset = (
  offset: number | undefined,
  lineCounter: LineCounter,
  lines: string[]
): { lineIndex: number; lineText: string } => {
  if (typeof offset !== "number" || Number.isNaN(offset)) {
    return {
      lineIndex: 0,
      lineText: lines[0] ?? ""
    };
  }

  const position = lineCounter.linePos(Math.max(offset, 0));
  const lineIndex = Math.max(position.line - 1, 0);

  return {
    lineIndex,
    lineText: lines[lineIndex] ?? ""
  };
};

export const getNestedNodeOffset = (node: unknown): number | undefined => {
  if (isMap(node)) {
    const mapNode = node as {
      items: Array<{ key?: { range?: [number, number?, number?] } }>;
      range?: [number, number?, number?];
    };

    return mapNode.items[0]?.key?.range?.[0] ?? mapNode.range?.[0];
  }

  if (isSeq(node)) {
    const sequenceNode = node as {
      items: Array<{ range?: [number, number?, number?] }>;
      range?: [number, number?, number?];
    };

    return sequenceNode.items[0]?.range?.[0] ?? sequenceNode.range?.[0];
  }

  return undefined;
};

export const getNodeLineSpan = (
  node: unknown,
  lineCounter: LineCounter
): { startLine: number; endLine: number } | undefined => {
  const rangedNode = node as { range?: [number, number?, number?] } | undefined;

  if (!rangedNode?.range || typeof rangedNode.range[0] !== "number") {
    return undefined;
  }

  const startOffset = rangedNode.range[0];
  const endOffset =
    typeof rangedNode.range[1] === "number"
      ? Math.max(rangedNode.range[1] - 1, startOffset)
      : startOffset;

  return {
    startLine: lineCounter.linePos(startOffset).line,
    endLine: lineCounter.linePos(endOffset).line
  };
};
