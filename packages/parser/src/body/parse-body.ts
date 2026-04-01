import {
  createMarkdownNode,
  type AnalysisNode,
  type ChemdNode,
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

const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const LIST_FIELDS = new Set(["reactants", "products", "params"]);
const BLOCK_FIELDS: Record<string, Set<string>> = {
  molecule: new Set(["smiles", "name", "role", "caption", "formula", "amount", "equivalents"]),
  reaction: new Set(["reactants", "products", "name", "reagents", "catalyst", "solvent", "temperature", "time", "pressure", "atmosphere", "yield", "conversion", "selectivity", "caption"]),
  result: new Set(["status", "yield", "conversion", "selectivity", "isolated_mass", "product_state", "purity", "notes"]),
  analysis: new Set(["type", "instrument", "solvent", "frequency", "method", "data", "notes"]),
  sample: new Set(["name", "sample_id", "batch", "purity", "supplier", "notes"]),
  template: new Set(["bind", "params", "description"]),
  use: new Set([])
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
  if (!line.startsWith(":::")) {
    return undefined;
  }

  let index = 3;
  if (index >= line.length) {
    return undefined;
  }

  const first = line.charCodeAt(index);
  const isWord = (
    (first >= 65 && first <= 90)
    || (first >= 97 && first <= 122)
    || (first >= 48 && first <= 57)
    || first === 95
  );

  if (!isWord) {
    return undefined;
  }

  while (index < line.length) {
    const code = line.charCodeAt(index);
    const isCurrentWord = (
      (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 95
    );

    if (!isCurrentWord) {
      break;
    }

    index += 1;
  }

  const blockTypeEnd = index;

  if (blockTypeEnd === line.length) {
    return { blockType: line.slice(3, blockTypeEnd) };
  }

  const separator = line.charCodeAt(blockTypeEnd);
  if (separator !== 32 && separator !== 9) {
    return undefined;
  }

  index = blockTypeEnd;
  while (index < line.length) {
    const code = line.charCodeAt(index);
    if (code !== 32 && code !== 9) {
      break;
    }
    index += 1;
  }

  return {
    blockType: line.slice(3, blockTypeEnd),
    headerArg: line.slice(index)
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

const parseStructuredBlock = (
  blockType: string,
  headerArg: string | undefined,
  lines: string[],
  diagnostics: Diagnostic[]
): StructuredNode | undefined => {
  if (!["molecule", "reaction", "result", "analysis", "sample", "use"].includes(blockType)) {
    diagnostics.push({
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: `Unknown block type: ${blockType}`
    });
    return undefined;
  }

  if (blockType === "use") {
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

  const id = headerArg?.trim().startsWith("#") ? headerArg.trim().slice(1) : undefined;

  if (id && !ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "E_INVALID_ID",
      severity: "error",
      message: `Invalid block id: ${id}`,
      nodeId: id
    });
  }

  const fields = parseKeyValueLines(blockType, lines, diagnostics);

  switch (blockType) {
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
}

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
        return { children, nextIndex: index + 1 };
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

    const blockLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== ":::") {
      blockLines.push(lines[index]);
      index += 1;
    }

    if (index < lines.length && lines[index].trim() === ":::") {
      index += 1;
    }

    const node = parseStructuredBlock(blockType, headerArg, blockLines, diagnostics);

    if (node) {
      children.push(node);
    }
  }

  flushMarkdown();

  return { children, nextIndex: index };
};

export const parseBody = (body: string): { children: ChemdNode[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const lines = body.split(/\r?\n/);
  const result = parseChildren(lines, diagnostics);

  return { children: result.children, diagnostics };
};
