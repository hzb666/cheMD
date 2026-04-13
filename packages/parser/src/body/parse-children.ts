import type {
  ChemdNode,
  Diagnostic,
  TemplateNode
} from "@chemd/core";
import {
  collectBraceBlockLines,
  collectStructuredBlockLines,
  createMarkdownFromText,
  parseBlockStartLine,
  parseKeyValueLine,
  parseKeyValueLines,
  parseTemplateBind
} from "./parse-body-shared";
import { parseStructuredBlock } from "./parse-structured-block";

export interface ParseChildrenResult {
  children: ChemdNode[];
  nextIndex: number;
  terminatedBlock?: boolean;
}

const pushWarning = (diagnostics: Diagnostic[], code: string, message: string) => {
  diagnostics.push({
    code,
    severity: "warning",
    message
  });
};

const flushMarkdownBuffer = (
  markdownBuffer: string[],
  children: ChemdNode[],
  diagnostics: Diagnostic[]
) => {
  const value = markdownBuffer.join("\n").trim();

  if (value) {
    children.push(createMarkdownFromText(value, diagnostics));
  }

  markdownBuffer.length = 0;
};

const parseBraceColChild = (
  lines: string[],
  diagnostics: Diagnostic[],
  index: number
): { children: ChemdNode[]; nextIndex: number } => {
  const value = lines[index].trim().slice(4).trim();
  if (value.startsWith("{:::")) {
    const braceHeader = value.slice(1).trim();
    const braceBlockLines = [braceHeader];
    const collected = collectBraceBlockLines(lines, index + 1);
    braceBlockLines.push(...collected.lines);

    if (!collected.terminated) {
      pushWarning(diagnostics, "W_UNTERMINATED_BRACE_BLOCK", "Unterminated brace block inside col block");
    }

    // legacy brace block 继续走同一套 structured block 解析，避免旧语法立即失效。
    const parsed = parseChildren(braceBlockLines, diagnostics);
    return {
      children: parsed.children,
      nextIndex: collected.nextIndex
    };
  }

  if (value.endsWith("}") && value.length > 1) {
    const inlineBody = value.slice(1, -1).trim();
    const parsed = parseChildren(inlineBody ? [inlineBody] : [], diagnostics);
    return {
      children: parsed.children,
      nextIndex: index + 1
    };
  }

  const braceBlockLines: string[] = [];
  const firstLine = value.slice(1).trimStart();
  if (firstLine) {
    braceBlockLines.push(firstLine);
  }

  let nextIndex = index + 1;
  while (nextIndex < lines.length) {
    const line = lines[nextIndex];
    if (line.trim() === "}") {
      const parsed = parseChildren(braceBlockLines, diagnostics);
      return {
        children: parsed.children,
        nextIndex: nextIndex + 1
      };
    }

    braceBlockLines.push(line);
    nextIndex += 1;
  }

  pushWarning(diagnostics, "W_UNTERMINATED_BRACE_BLOCK", "Unterminated brace block inside col block");
  const parsed = parseChildren(braceBlockLines, diagnostics);
  return {
    children: parsed.children,
    nextIndex
  };
};

const parseColChildren = (lines: string[], diagnostics: Diagnostic[]): ChemdNode[] => {
  const children: ChemdNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (!line.startsWith("col:")) {
      pushWarning(diagnostics, "W_INVALID_COL_CHILD", `Invalid col child line: ${line}`);
      index += 1;
      continue;
    }

    const value = line.slice(4).trim();
    if (value.startsWith("{")) {
      const parsed = parseBraceColChild(lines, diagnostics, index);
      children.push(...parsed.children);
      index = parsed.nextIndex;
      continue;
    }

    if (value) {
      children.push(createMarkdownFromText(value, diagnostics));
    }

    index += 1;
  }

  return children;
};

const parseTemplateBlock = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex: number,
  templateName: string
): { node: TemplateNode; nextIndex: number; terminatedBlock: boolean } => {
  const templateFields = new Set(["bind", "params", "description"]);
  const leadingFieldLines: string[] = [];
  let index = startIndex;

  while (index < lines.length && parseKeyValueLine(lines[index])) {
    leadingFieldLines.push(lines[index]);
    index += 1;
  }

  const fields = parseKeyValueLines(leadingFieldLines, diagnostics, {
    allowField: (key) => templateFields.has(key),
    blockTypeForDiagnostics: "template"
  });
  const bodyResult = parseChildren(lines, diagnostics, index, true);

  return {
    node: {
      type: "template",
      name: templateName,
      bind: parseTemplateBind(fields.bind),
      params: Array.isArray(fields.params) ? fields.params : [],
      description: typeof fields.description === "string" ? fields.description : undefined,
      body: bodyResult.children.filter(
        (child): child is TemplateNode["body"][number] => child.type !== "template"
      )
    },
    nextIndex: bodyResult.nextIndex,
    terminatedBlock: Boolean(bodyResult.terminatedBlock)
  };
};

const parseStructuredNodeBlock = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex: number,
  blockType: string,
  headerArg: string | undefined
): { node?: ChemdNode; nextIndex: number } => {
  const { blockLines, nextIndex, terminated } = collectStructuredBlockLines(
    blockType,
    lines,
    diagnostics,
    startIndex
  );

  if (!terminated) {
    pushWarning(diagnostics, "W_UNTERMINATED_BLOCK", `Unterminated block: ${blockType}`);
  }

  return {
    node: parseStructuredBlock(
      blockType,
      headerArg,
      blockLines,
      diagnostics,
      blockType === "col" ? parseColChildren(blockLines, diagnostics) : undefined
    ),
    nextIndex
  };
};

const parseMatchedBlock = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex: number,
  blockType: string,
  headerArg: string | undefined
): { node?: ChemdNode; nextIndex: number } => {
  if (blockType === "template") {
    const parsed = parseTemplateBlock(lines, diagnostics, startIndex, headerArg?.trim() ?? "");
    if (!parsed.terminatedBlock) {
      pushWarning(diagnostics, "W_UNTERMINATED_BLOCK", "Unterminated block: template");
    }

    return {
      node: parsed.node,
      nextIndex: parsed.nextIndex
    };
  }

  return parseStructuredNodeBlock(lines, diagnostics, startIndex, blockType, headerArg);
};

export const parseChildren = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex = 0,
  stopAtBlockEnd = false
): ParseChildrenResult => {
  const children: ChemdNode[] = [];
  const markdownBuffer: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === ":::") {
      if (stopAtBlockEnd) {
        flushMarkdownBuffer(markdownBuffer, children, diagnostics);
        return { children, nextIndex: index + 1, terminatedBlock: true };
      }

      markdownBuffer.push(line);
      index += 1;
      continue;
    }

    const blockMatch = parseBlockStartLine(line);
    if (!blockMatch) {
      markdownBuffer.push(line);
      index += 1;
      continue;
    }

    flushMarkdownBuffer(markdownBuffer, children, diagnostics);
    index += 1;

    const parsed = parseMatchedBlock(
      lines,
      diagnostics,
      index,
      blockMatch.blockType,
      blockMatch.headerArg
    );
    if (parsed.node) {
      children.push(parsed.node);
    }
    index = parsed.nextIndex;
  }

  flushMarkdownBuffer(markdownBuffer, children, diagnostics);

  return { children, nextIndex: index, terminatedBlock: false };
};
