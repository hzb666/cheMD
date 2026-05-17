import type {
  ObjectSemanticKind,
  TemplateParamSpec,
  TemplateParamType
} from "@chemd/core";

import { parseKeyValueLine } from "./parse-body-shared";

const TEMPLATE_REF_TARGETS = new Set<ObjectSemanticKind>([
  "molecule",
  "reaction",
  "result",
  "analysis",
  "procedure",
  "observation",
  "sample",
  "artifact",
  "condition_varies"
]);

const isParamNameStart = (char: string): boolean =>
  (char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_";

const isParamNameChar = (char: string): boolean =>
  isParamNameStart(char) || (char >= "0" && char <= "9");

const isTemplateParamName = (value: string): boolean =>
  value.length > 0 && isParamNameStart(value[0]) && Array.from(value).every(isParamNameChar);

const readTemplateParamItem = (line: string): string | undefined => {
  const trimmedStart = line.trimStart();
  if (!trimmedStart.startsWith("-")) return undefined;
  const value = trimmedStart.slice(1);
  if (!value.startsWith(" ") && !value.startsWith("\t")) return undefined;
  return value.trim();
};

const readGenericTypeArg = (value: string, keyword: string): string | undefined | null => {
  const normalized = value.trim();
  if (normalized.toLowerCase() === keyword) return undefined;
  if (!normalized.toLowerCase().startsWith(`${keyword}<`) || !normalized.endsWith(">")) return null;
  const inner = normalized.slice(keyword.length + 1, -1).trim();
  return inner || null;
};

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
    const item = readTemplateParamItem(lines[index]);
    if (item === undefined) {
      break;
    }

    values.push(item);
    index += 1;
  }

  return { values, nextIndex: index };
};

const parseTemplateParamType = (rawType: string | undefined): TemplateParamType => {
  const normalizedType = rawType?.trim();

  if (!normalizedType || normalizedType === "string") {
    return { kind: "string" };
  }

  const refTarget = readGenericTypeArg(normalizedType, "ref");
  if (refTarget) {
    return parseTemplateRefType(refTarget);
  }

  const quantityClass = readGenericTypeArg(normalizedType, "quantity");
  if (quantityClass !== null) {
    return {
      kind: "quantity",
      ...(quantityClass ? { quantityClass: quantityClass.toLowerCase() } : {})
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

  if (!isTemplateParamName(name)) {
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
