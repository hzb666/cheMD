import {
  createMarkdownNode,
  type Diagnostic
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
const LIST_FIELDS = new Set([
  "reactants",
  "products",
  "reactant",
  "product",
  "reac",
  "prod",
  "conditions",
  "params"
]);

const BLOCK_FIELDS: Record<string, Set<string>> = {
  molecule: new Set(["smiles", "name", "role", "caption", "formula", "amount", "equivalents"]),
  reaction: new Set([
    "reactants",
    "products",
    "conditions",
    "name",
    "reagents",
    "catalyst",
    "solvent",
    "temperature",
    "time",
    "pressure",
    "atmosphere",
    "yield",
    "conversion",
    "selectivity",
    "caption"
  ]),
  chemd: new Set([
    "smiles",
    "cas",
    "name",
    "role",
    "caption",
    "formula",
    "amount",
    "equivalents",
    "reactants",
    "products",
    "reactant",
    "product",
    "reac",
    "prod",
    "conditions",
    "reagents",
    "catalyst",
    "solvent",
    "temperature",
    "time",
    "pressure",
    "atmosphere",
    "yield",
    "conversion",
    "selectivity"
  ]),
  result: new Set([
    "status",
    "yield",
    "conversion",
    "selectivity",
    "isolated_mass",
    "product_state",
    "purity",
    "notes"
  ]),
  analysis: new Set(["type", "instrument", "solvent", "frequency", "method", "data", "notes"]),
  sample: new Set(["name", "sample_id", "batch", "purity", "supplier", "notes"]),
  template: new Set(["bind", "params", "description"]),
  use: new Set([]),
  col: new Set([])
};

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

const isLowerAlphaCode = (code: number): boolean => code >= 97 && code <= 122;

const isKeyBodyCode = (code: number): boolean =>
  isLowerAlphaCode(code) || (code >= 48 && code <= 57) || code === 95;

const findKeyEnd = (line: string): number => {
  let index = 1;

  while (index < line.length && isKeyBodyCode(line.charCodeAt(index))) {
    index += 1;
  }

  return index;
};

const skipInlineWhitespace = (line: string, startIndex: number): number => {
  let nextIndex = startIndex;

  while (nextIndex < line.length) {
    const code = line.charCodeAt(nextIndex);
    if (code !== 32 && code !== 9) {
      break;
    }
    nextIndex += 1;
  }

  return nextIndex;
};

export const parseKeyValueLine = (line: string): { key: string; rawValue: string } | undefined => {
  if (!line || line.length < 2) {
    return undefined;
  }

  const first = line.charCodeAt(0);
  if (!isLowerAlphaCode(first)) {
    return undefined;
  }

  const index = findKeyEnd(line);
  if (index >= line.length || line.charCodeAt(index) !== 58) {
    return undefined;
  }

  const valueStart = skipInlineWhitespace(line, index + 1);

  return {
    key: line.slice(0, index),
    rawValue: line.slice(valueStart)
  };
};

export const parseBlockStartLine = (
  line: string
): { blockType: string; headerArg?: string } | undefined => {
  const match = line.match(BLOCK_START_PATTERN);

  if (!match) {
    return undefined;
  }

  const [, blockType, blockColumnsArg, rawHeaderArg] = match;
  const resolvedBlockType = blockColumnsArg && blockType !== "col"
    ? `${blockType}-${blockColumnsArg}`
    : blockType;

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

export const parseKeyValueLines = (
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

    fields[key] = LIST_FIELDS.has(key)
      ? splitListValue(key, rawValue, diagnostics)
      : rawValue.trim();
  }

  return fields;
};

export const parseTemplateBind = (value?: string | string[]): Record<string, string> => {
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

export const collectImplicitChemdValue = (
  lines: string[],
  diagnostics: Diagnostic[]
): string | undefined => {
  const implicitLines = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !parseKeyValueLine(line));

  if (implicitLines.length === 0) {
    return undefined;
  }

  if (implicitLines.length > 1) {
    diagnostics.push({
      code: "W_INVALID_CHEMD_IMPLICIT_VALUE",
      severity: "warning",
      message: "Multiple implicit chemd values detected; only the first line will be used"
    });
  }

  return implicitLines[0];
};

export const pickFirstStringArray = (
  fields: Record<string, string | string[]>,
  keys: string[]
): string[] | undefined => {
  for (const key of keys) {
    const value = fields[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
};

export const pickFirstStringValue = (
  fields: Record<string, string | string[]>,
  keys: string[]
): string | undefined => {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

export const createMarkdownFromText = (value: string, diagnostics: Diagnostic[]) =>
  createMarkdownNode(
    value,
    tokenizeReferences(value),
    tokenizeInlineChem(value),
    tokenizeInlineCode(value),
    tokenizeMarkdownLinks(value, diagnostics)
  );

export const collectBraceBlockLines = (
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

export const collectStructuredBlockLines = (
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
