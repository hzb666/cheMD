import {
  createMarkdownNode,
  type AnalysisNode,
  type ChemdNode,
  type ColNode,
  type Diagnostic,
  type MoleculeNode,
  type ReactionNode,
  type ResultNode,
  type SampleNode,
  type StructuredNode,
  type TemplateNode,
  type UseNode
} from "@chemd/core";
import { tokenizeInlineChem } from "../inline/tokenize-inline-chem";
import { tokenizeInlineCode } from "../inline/tokenize-inline-code";
import { tokenizeMarkdownLinks } from "../inline/tokenize-markdown-links";
import { tokenizeReferences } from "../inline/tokenize-references";

const BLOCK_TYPE_PATTERN = "[a-z][a-z0-9_]*";
const BLOCK_START_PATTERN = new RegExp(`^:::(${BLOCK_TYPE_PATTERN})(?:-(\\d+))?(?:\\s+(.*))?$`);
const COL_INLINE_BRACE_BLOCK_PATTERN = new RegExp(
  `^col:\\s*\\{:::(${BLOCK_TYPE_PATTERN})(?:-\\d+)?(?:\\s+.*)?$`
);
const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const LIST_FIELDS = new Set(["reactants", "products", "conditions", "params"]);
const BLOCK_FIELDS: Record<string, Set<string>> = {
  molecule: new Set(["smiles", "name", "role", "caption", "formula", "amount", "equivalents"]),
  reaction: new Set(["reactants", "products", "conditions", "name", "reagents", "catalyst", "solvent", "temperature", "time", "pressure", "atmosphere", "yield", "conversion", "selectivity", "caption"]),
  result: new Set(["status", "yield", "conversion", "selectivity", "isolated_mass", "product_state", "purity", "notes"]),
  analysis: new Set(["type", "instrument", "solvent", "frequency", "method", "data", "notes"]),
  sample: new Set(["name", "sample_id", "batch", "purity", "supplier", "notes"]),
  template: new Set(["bind", "params", "description"]),
  use: new Set([]),
  col: new Set([])
};

const parseKeyValueLine = (line: string): { key: string; rawValue: string } | undefined => {
  if (!line || line.length < 2) {
    return undefined;
  }

  const first = line.charCodeAt(0);
  const isLowerAlpha = first >= 97 && first <= 122;
  if (!isLowerAlpha) {
    return undefined;
  }

  let index = 1;
  while (index < line.length) {
    const code = line.charCodeAt(index);
    const isLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isUnderscore = code === 95;

    if (!(isLower || isDigit || isUnderscore)) {
      break;
    }

    index += 1;
  }

  if (index >= line.length || line.charCodeAt(index) !== 58) {
    return undefined;
  }

  let valueStart = index + 1;
  while (valueStart < line.length) {
    const code = line.charCodeAt(valueStart);
    if (code !== 32 && code !== 9) {
      break;
    }
    valueStart += 1;
  }

  return {
    key: line.slice(0, index),
    rawValue: line.slice(valueStart)
  };
};

const parseBlockStartLine = (line: string): { blockType: string; headerArg?: string } | undefined => {
  const match = line.match(BLOCK_START_PATTERN);

  if (!match) {
    return undefined;
  }

  const [, blockType, blockColumnsArg, rawHeaderArg] = match;
  const resolvedBlockType = blockColumnsArg && blockType !== "col" ? `${blockType}-${blockColumnsArg}` : blockType;

  return {
    blockType: resolvedBlockType,
    headerArg: resolveHeaderArg(blockType, blockColumnsArg, rawHeaderArg)
  };
};

const splitListValue = (field: string, value: string, diagnostics: Diagnostic[]): string[] => {
  const parts = value.split("|");
  const items: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (!trimmed) {
      diagnostics.push({
        code: "E_INVALID_LIST_ITEM",
        severity: "error",
        message: `Invalid empty list item in ${field}`
      });
      continue;
    }

    items.push(trimmed);
  }

  return items;
};

const parseKeyValueLines = (
  blockType: string,
  lines: string[],
  diagnostics: Diagnostic[]
): Record<string, string | string[]> => {
  const fields: Record<string, string | string[]> = {};
  const allowedFields = BLOCK_FIELDS[blockType] ?? new Set<string>();

  for (const line of lines) {
    const parsed = parseKeyValueLine(line);
    if (!parsed) {
      continue;
    }

    const { key, rawValue } = parsed;

    if (blockType !== "use" && !allowedFields.has(key)) {
      diagnostics.push({
        code: "W_UNKNOWN_FIELD",
        severity: "warning",
        message: `Unknown field "${key}" on ${blockType}`
      });
      continue;
    }

    fields[key] = LIST_FIELDS.has(key) ? splitListValue(key, rawValue, diagnostics) : rawValue.trim();
  }

  return fields;
};

const parseTemplateBind = (value?: string | string[]): Record<string, string> => {
  if (!value || Array.isArray(value)) {
    return {};
  }

  return value.split("|").reduce<Record<string, string>>((accumulator, pair) => {
    const [alias, source] = pair.split("=").map((item) => item.trim());

    if (alias && source) {
      accumulator[alias] = source;
    }

    return accumulator;
  }, {});
};

const createMarkdownFromText = (value: string, diagnostics: Diagnostic[]) =>
  createMarkdownNode(
    value,
    tokenizeReferences(value),
    tokenizeInlineChem(value),
    tokenizeInlineCode(value),
    tokenizeMarkdownLinks(value, diagnostics)
  );

const parseColColumns = (blockType: string, headerArg: string | undefined, diagnostics: Diagnostic[]): number => {
  const trimmed = headerArg?.trim() ?? "";
  const fallback = 1;

  if (blockType !== "col") {
    return fallback;
  }

  const matched = trimmed.match(/^(\d+)$/);
  const columns = matched ? Number.parseInt(matched[1], 10) : Number.NaN;
  if (!Number.isFinite(columns) || columns < 1) {
    diagnostics.push({
      code: "W_INVALID_COL_COLUMNS",
      severity: "warning",
      message: `Invalid column count on col block: ${trimmed || "(empty)"}, fallback to 1`
    });
    return fallback;
  }

  return columns;
};

const parseStructuredBlock = (
  blockType: string,
  headerArg: string | undefined,
  lines: string[],
  diagnostics: Diagnostic[],
  bodyChildren?: ChemdNode[]
): StructuredNode | undefined => {
  const normalizedBlockType = blockType === "mol" ? "molecule" : blockType;

  if (!["molecule", "reaction", "result", "analysis", "sample", "use", "col"].includes(normalizedBlockType)) {
    diagnostics.push({
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: `Unknown block type: ${blockType}`
    });
    return undefined;
  }

  if (normalizedBlockType === "use") {
    const template = headerArg?.trim() ?? "";
    const fields = parseKeyValueLines(blockType, lines, diagnostics);
    const values = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(" | ") : value])
    );

    return {
      type: "use",
      template,
      values
    } satisfies UseNode;
  }

  if (normalizedBlockType === "col") {
    const columns = parseColColumns(normalizedBlockType, headerArg, diagnostics);
    const children = bodyChildren ?? [];

    if (children.length !== columns) {
      diagnostics.push({
        code: "W_COL_COUNT_MISMATCH",
        severity: "warning",
        message: `Invalid col child count: expected ${columns}, got ${children.length}`
      });
    }

    return {
      type: "col",
      columns,
      children
    } satisfies ColNode;
  }

  const id = headerArg?.trim().startsWith("#") ? headerArg.trim().slice(1) : undefined;

  if (id && !ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "E_INVALID_ID",
      severity: "error",
      message: `Invalid block id: ${id}`,
      nodeId: id
    });
  }

  const fields = parseKeyValueLines(normalizedBlockType, lines, diagnostics);

  switch (normalizedBlockType) {
    case "molecule":
      return { type: "molecule", id, ...fields } as MoleculeNode;
    case "reaction":
      return { type: "reaction", id, ...fields } as ReactionNode;
    case "result":
      return { type: "result", id, ...fields } as ResultNode;
    case "analysis": {
      const { type: analysisType, ...rest } = fields;
      return { type: "analysis", id, type_name: typeof analysisType === "string" ? analysisType : undefined, ...rest } as AnalysisNode;
    }
    case "sample":
      return { type: "sample", id, ...fields } as SampleNode;
    default:
      return undefined;
  }
};

interface ParseChildrenResult {
  children: ChemdNode[];
  nextIndex: number;
  terminatedBlock?: boolean;
}

const resolveHeaderArg = (
  blockType: string,
  columnsArg: string | undefined,
  rawHeaderArg: string | undefined
): string | undefined => {
  if (blockType === "col" && columnsArg) {
    return columnsArg;
  }

  return rawHeaderArg;
};

const collectBraceBlockLines = (
  lines: string[],
  startIndex: number
): { lines: string[]; nextIndex: number; terminated: boolean } => {
  const collected: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === ":::}") {
      return { lines: collected, nextIndex: index + 1, terminated: true };
    }

    collected.push(line);
    index += 1;
  }

  return { lines: collected, nextIndex: index, terminated: false };
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
      diagnostics.push({
        code: "W_INVALID_COL_CHILD",
        severity: "warning",
        message: `Invalid col child line: ${line}`
      });
      index += 1;
      continue;
    }

    const value = line.slice(4).trim();

    if (value.startsWith("{:::")) {
      const braceHeader = value.slice(1).trim();
      const braceBlockLines = [braceHeader];
      const collected = collectBraceBlockLines(lines, index + 1);
      braceBlockLines.push(...collected.lines);

      if (!collected.terminated) {
        diagnostics.push({
          code: "W_UNTERMINATED_BRACE_BLOCK",
          severity: "warning",
          message: "Unterminated brace block inside col block"
        });
      }

      const parsed = parseChildren(braceBlockLines, diagnostics);
      children.push(...parsed.children);
      index = collected.nextIndex;
      continue;
    }

    if (value) {
      children.push(createMarkdownFromText(value, diagnostics));
    }

    index += 1;
  }

  return children;
};

const collectStructuredBlockLines = (
  blockType: string,
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex: number
): { blockLines: string[]; nextIndex: number; terminated: boolean } => {
  const blockLines: string[] = [];
  let index = startIndex;
  let braceDepth = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (blockType === "col") {
      if (trimmed.match(COL_INLINE_BRACE_BLOCK_PATTERN)) {
        braceDepth += 1;
      } else if (trimmed === ":::}" && braceDepth > 0) {
        braceDepth -= 1;
      }
    }

    if (trimmed === ":::" && (blockType !== "col" || braceDepth === 0)) {
      return { blockLines, nextIndex: index + 1, terminated: true };
    }

    blockLines.push(line);
    index += 1;
  }

  if (blockType === "col" && braceDepth > 0) {
    diagnostics.push({
      code: "W_UNTERMINATED_BRACE_BLOCK",
      severity: "warning",
      message: "Unterminated brace block inside col block"
    });
  }

  return { blockLines, nextIndex: index, terminated: false };
};

const parseChildren = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex = 0,
  stopAtBlockEnd = false
): ParseChildrenResult => {
  const children: ChemdNode[] = [];
  const markdownBuffer: string[] = [];
  let index = startIndex;

  const flushMarkdown = () => {
    const value = markdownBuffer.join("\n").trim();

    if (value) {
      children.push(createMarkdownFromText(value, diagnostics));
    }

    markdownBuffer.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === ":::") {
      if (stopAtBlockEnd) {
        flushMarkdown();
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

    flushMarkdown();

    const { blockType, headerArg } = blockMatch;
    index += 1;

    if (blockType === "template") {
      const templateName = headerArg?.trim() ?? "";
      const leadingFieldLines: string[] = [];

      while (index < lines.length && parseKeyValueLine(lines[index])) {
        leadingFieldLines.push(lines[index]);
        index += 1;
      }

      const fields = parseKeyValueLines(blockType, leadingFieldLines, diagnostics);
      const bodyResult = parseChildren(lines, diagnostics, index, true);
      index = bodyResult.nextIndex;

      if (!bodyResult.terminatedBlock) {
        diagnostics.push({
          code: "W_UNTERMINATED_BLOCK",
          severity: "warning",
          message: `Unterminated block: ${blockType}`
        });
      }

      children.push({
        type: "template",
        name: templateName,
        bind: parseTemplateBind(fields.bind),
        params: Array.isArray(fields.params) ? fields.params : [],
        description: typeof fields.description === "string" ? fields.description : undefined,
        body: bodyResult.children.filter((child): child is TemplateNode["body"][number] => child.type !== "template")
      });
      continue;
    }

    const { blockLines, nextIndex, terminated } = collectStructuredBlockLines(blockType, lines, diagnostics, index);
    index = nextIndex;

    if (!terminated) {
      diagnostics.push({
        code: "W_UNTERMINATED_BLOCK",
        severity: "warning",
        message: `Unterminated block: ${blockType}`
      });
    }

    const bodyChildren = blockType === "col" ? parseColChildren(blockLines, diagnostics) : undefined;
    const node = parseStructuredBlock(blockType, headerArg, blockLines, diagnostics, bodyChildren);

    if (node) {
      children.push(node);
    }
  }

  flushMarkdown();

  return { children, nextIndex: index, terminatedBlock: false };
};

export const parseBody = (body: string): { children: ChemdNode[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const lines = body.split(/\r?\n/);
  const result = parseChildren(lines, diagnostics);

  return { children: result.children, diagnostics };
};
