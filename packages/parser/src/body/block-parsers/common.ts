import {
  getAllowedBlockFieldSet,
  getBlockListFieldSet,
  resolveBlockField,
  type ChemistryFeatureRef,
  type Diagnostic,
  type SourceSpan
} from "@chemd/core";

import { parseKeyValueLine, parseKeyValueLines } from "../parse-body-shared";

const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const CHILD_FIELD_PATTERN = /^([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/;

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
      nodeId: id,
      sourceLayer: "parser",
      sourceNodeId: id
    });
  }

  return id;
};

export const parseAllowedFields = (
  lines: string[],
  diagnostics: Diagnostic[],
  blockType: string,
  allowedFields: Set<string> = getAllowedBlockFieldSet(blockType),
  options: {
    listFields?: Set<string>;
    allowExtraField?: (key: string) => boolean;
    sourceNodeId?: string;
  } = {}
): Record<string, string | string[]> =>
  parseKeyValueLines(lines, diagnostics, {
    allowField: (key) => allowedFields.has(key) || options.allowExtraField?.(key) === true,
    resolveField: (key) => resolveBlockField(blockType, key)?.canonicalName
      ?? (options.allowExtraField?.(key) === true ? key : undefined),
    listFields: options.listFields ?? getBlockListFieldSet(blockType),
    blockTypeForDiagnostics: blockType,
    sourceNodeId: options.sourceNodeId
  });

export const createLineSourceSpan = (lines: string[], startIndex: number, endIndex = startIndex): SourceSpan => ({
  startLine: startIndex + 1,
  endLine: endIndex + 1,
  startColumn: 1,
  endColumn: (lines[endIndex]?.length ?? 0) + 1
});

const splitFieldSegments = (line: string): string[] =>
  line
    .split(";;")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

export const parseAllowedFieldSpans = (
  lines: string[],
  allowedFields: Set<string>,
  blockType?: string,
  options: {
    allowExtraField?: (key: string) => boolean;
  } = {}
): Record<string, SourceSpan> => {
  const spans: Record<string, SourceSpan> = {};

  lines.forEach((line, index) => {
    for (const segment of splitFieldSegments(line)) {
      const parsed = parseKeyValueLine(segment);
      if (!parsed) {
        continue;
      }

      const resolvedKey = blockType
        ? resolveBlockField(blockType, parsed.key)?.canonicalName
          ?? (options.allowExtraField?.(parsed.key) === true ? parsed.key : undefined)
        : parsed.key;

      if (resolvedKey && (allowedFields.has(resolvedKey) || options.allowExtraField?.(parsed.key) === true)) {
        spans[resolvedKey] = createLineSourceSpan(lines, index);
      }
    }
  });

  return spans;
};

export const parseChildBlockFieldLine = (
  line: string
): { key: string; rawValue: string } | undefined => {
  const match = line.match(CHILD_FIELD_PATTERN);

  return match
    ? {
        key: match[1],
        rawValue: match[2]
      }
    : undefined;
};

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

const splitList = (value: string): string[] =>
  value
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const readStringListField = (value: string | string[] | undefined): string[] | undefined => {
  if (Array.isArray(value)) {
    const items = value.flatMap(splitList);
    return items.length > 0 ? items : undefined;
  }

  if (!value) {
    return undefined;
  }

  const items = splitList(value);
  return items.length > 0 ? items : undefined;
};

export const readChemistryFeatureRefs = (
  value: string | string[] | undefined,
  kind: ChemistryFeatureRef["kind"]
): ChemistryFeatureRef[] | undefined => {
  const featureIds = readStringListField(value);
  return featureIds?.map((featureId) => ({
    featureId,
    kind,
    status: "available"
  }));
};
