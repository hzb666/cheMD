import type { Diagnostic } from "@chemd/core";

import { parseKeyValueLine, parseKeyValueLines } from "../parse-body-shared";

const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export const DEFAULT_LIST_FIELDS = new Set([
  "reactants",
  "products",
  "reactant",
  "product",
  "reac",
  "prod",
  "conditions",
  "params"
]);

export const readStructuredBlockId = (
  headerArg: string | undefined,
  diagnostics: Diagnostic[]
): string | undefined => {
  const trimmed = headerArg?.trim() ?? "";
  const id = trimmed.startsWith("#") ? trimmed.slice(1) : undefined;

  if (id !== undefined && !ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "E_INVALID_ID",
      severity: "error",
      message: `Invalid block id: ${id}`,
      nodeId: id
    });
  }

  return id;
};

export const parseAllowedFields = (
  lines: string[],
  diagnostics: Diagnostic[],
  blockType: string,
  allowedFields: Set<string>,
  options: {
    listFields?: Set<string>;
    allowExtraField?: (key: string) => boolean;
  } = {}
): Record<string, string | string[]> =>
  parseKeyValueLines(lines, diagnostics, {
    allowField: (key) => allowedFields.has(key) || options.allowExtraField?.(key) === true,
    listFields: options.listFields ?? DEFAULT_LIST_FIELDS,
    blockTypeForDiagnostics: blockType
  });

export const splitLeadingFieldLines = (
  lines: string[],
  allowedFields: Set<string>
): { fieldLines: string[]; bodyLines: string[] } => {
  const fieldLines: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      if (fieldLines.length === 0) {
        index += 1;
        continue;
      }
      break;
    }

    const parsed = parseKeyValueLine(trimmed);
    if (!parsed || !allowedFields.has(parsed.key)) {
      break;
    }

    fieldLines.push(lines[index]);
    index += 1;
  }

  return {
    fieldLines,
    bodyLines: lines.slice(index)
  };
};

export const createBodyText = (lines: string[]): string | undefined => {
  const bodyLines = [...lines];

  while (bodyLines.length > 0 && bodyLines[0].trim().length === 0) {
    bodyLines.shift();
  }

  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim().length === 0) {
    bodyLines.pop();
  }

  if (bodyLines.length === 0) {
    return undefined;
  }

  return bodyLines.map((line) => line.trimEnd()).join("\n");
};
