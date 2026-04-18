import type {
  ObjectSemanticKind,
  TemplateParamSpec,
  TemplateParamType
} from "@chemd/core";

import { parseKeyValueLine } from "./parse-body-shared";

const TEMPLATE_PARAM_ITEM_RE = /^\s*-\s+(.+)$/;
const TEMPLATE_PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TEMPLATE_REF_TYPE_RE = /^ref<\s*([a-z_]+)\s*>$/i;
const TEMPLATE_QUANTITY_TYPE_RE = /^quantity(?:<\s*([a-z_]+)\s*>)?$/i;
const TEMPLATE_REF_TARGETS = new Set<ObjectSemanticKind>([
  "molecule",
  "reaction",
  "result",
  "analysis",
  "procedure",
  "observation",
  "sample"
]);

export const collectTemplateHeaderLines = (
  lines: string[],
  startIndex: number
): { fieldLines: string[]; nextIndex: number } => {
  const fieldLines: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const parsed = parseKeyValueLine(lines[index]);
    if (!parsed) {
      break;
    }

    if (parsed.key === "params" && !parsed.rawValue.trim()) {
      const items = collectTemplateParamItems(lines, index + 1);
      if (items.values.length > 0) {
        fieldLines.push(`params: ${items.values.join(" | ")}`);
      }
      index = items.nextIndex;
      continue;
    }

    fieldLines.push(lines[index]);
    index += 1;
  }

  return { fieldLines, nextIndex: index };
};

const collectTemplateParamItems = (
  lines: string[],
  startIndex: number
): { values: string[]; nextIndex: number } => {
  const values: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const itemMatch = lines[index].match(TEMPLATE_PARAM_ITEM_RE);
    if (!itemMatch) {
      break;
    }

    values.push(itemMatch[1].trim());
    index += 1;
  }

  return { values, nextIndex: index };
};

const parseTemplateParamType = (rawType: string | undefined): TemplateParamType => {
  const normalizedType = rawType?.trim();

  if (!normalizedType || normalizedType === "string") {
    return { kind: "string" };
  }

  const refMatch = normalizedType.match(TEMPLATE_REF_TYPE_RE);
  if (refMatch) {
    return parseTemplateRefType(refMatch[1]);
  }

  const quantityMatch = normalizedType.match(TEMPLATE_QUANTITY_TYPE_RE);
  if (quantityMatch) {
    return {
      kind: "quantity",
      ...(quantityMatch[1] ? { quantityClass: quantityMatch[1].toLowerCase() } : {})
    };
  }

  return { kind: "string" };
};

const parseTemplateRefType = (rawTargetKind: string): TemplateParamType => {
  const targetKind = rawTargetKind.toLowerCase();
  if (!TEMPLATE_REF_TARGETS.has(targetKind as ObjectSemanticKind)) {
    return { kind: "string" };
  }

  return {
    kind: "ref",
    targetKind: targetKind as ObjectSemanticKind
  };
};

const parseTemplateParam = (raw: string): TemplateParamSpec | undefined => {
  const separatorIndex = raw.indexOf(":");
  const name = (separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw).trim();

  if (!TEMPLATE_PARAM_NAME_RE.test(name)) {
    return undefined;
  }

  return {
    name,
    raw,
    type: parseTemplateParamType(separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : undefined)
  };
};

export const parseTemplateParams = (value: string | string[] | undefined): TemplateParamSpec[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((raw) => {
    const param = parseTemplateParam(raw);
    return param ? [param] : [];
  });
};
