import {
  createMarkdownNode,
  type AnalysisNode,
  type Diagnostic,
  type MoleculeNode,
  type ReactionNode,
  type ResultNode,
  type SampleNode,
  type StructuredNode,
  type UseNode
} from "@chemd/core";
import { KEY_VALUE_PATTERN, ID_PATTERN } from "../shared/patterns";
import { BLOCK_FIELDS, LIST_FIELDS } from "../shared/values";
import { tokenizeReferences } from "../inline/tokenize-references";
import { tokenizeInlineChem } from "../inline/tokenize-inline-chem";
import { tokenizeInlineCode } from "../inline/tokenize-inline-code";
import { tokenizeMarkdownLinks } from "../inline/tokenize-markdown-links";

export const splitListValue = (field: string, value: string, diagnostics: Diagnostic[]): string[] => {
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
    const match = line.match(KEY_VALUE_PATTERN);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

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

export const createMarkdownFromText = (value: string, diagnostics: Diagnostic[]) =>
  createMarkdownNode(
    value,
    tokenizeReferences(value),
    tokenizeInlineChem(value),
    tokenizeInlineCode(value),
    tokenizeMarkdownLinks(value, diagnostics)
  );

export const parseStructuredBlock = (
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
