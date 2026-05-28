import type {
  ChemdCompletionBlockKind,
  ChemdCompletionContext,
  ChemdCompletionRequest,
  ChemdEditorPosition
} from "./completion-types";
import {
  getDeclarationSchema,
  isKnownDeclarationKind,
  resolveDeclarationField
} from "@chemd/core";

const moleculeCompletionFields = new Set(getDeclarationSchema("molecule")?.fields.map((field) => field.name) ?? []);
const reactionCompletionFields = new Set(getDeclarationSchema("reaction")?.fields.map((field) => field.name) ?? []);
const moleculeOnlyFields = new Set(
  [...moleculeCompletionFields].filter((field) => !reactionCompletionFields.has(field))
);
const reactionOnlyFields = new Set(
  [...reactionCompletionFields].filter((field) => !moleculeCompletionFields.has(field))
);

const splitSourceLines = (source: string): string[] =>
  source.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

export const getChemdCompletionContext = (
  request: ChemdCompletionRequest
): ChemdCompletionContext => {
  const offset = resolveOffset(request);
  const position = offsetToPosition(request.source, offset);
  const lines = splitSourceLines(request.source);
  const lineText = lines[position.line - 1] ?? "";
  const linePrefix = lineText.slice(0, Math.max(position.column - 1, 0));
  const tokenPrefix = readTokenPrefix(linePrefix);
  const range = createCompletionRange(position, tokenPrefix.length);
  const block = findOpenProgramBlock(lines, position.line);
  const field = readFieldAtCursor(linePrefix);
  const stepParam = readStepParamContext(linePrefix);
  const stepFamilyPrefix = isStepFamilyPrefix(linePrefix);

  return {
    source: request.source,
    offset,
    position,
    lineText,
    linePrefix,
    tokenPrefix,
    range,
    isFrontmatter: isInsideFrontmatter(lines, position.line),
    isChemdBlock: Boolean(block),
    isUseHeaderPosition: false,
    isReferencePosition: tokenPrefix.startsWith("@") ||
      (request.triggerCharacter === "@" && linePrefix.endsWith("@")),
    isStepFamilyPosition: stepFamilyPrefix,
    isFieldKeyPosition: Boolean(block) &&
      !field.hasColon &&
      !linePrefix.trim().startsWith("}") &&
      !stepFamilyPrefix,
    isFieldValuePosition: Boolean(block) && field.hasColon,
    fieldKey: field.key,
    fieldPrefix: field.hasColon ? "" : field.key ?? tokenPrefix,
    stepParam,
    block
  };
};

const resolveOffset = (request: ChemdCompletionRequest): number => {
  if (typeof request.cursorOffset === "number") {
    return clamp(request.cursorOffset, 0, request.source.length);
  }
  if (request.position) {
    return positionToOffset(request.source, request.position);
  }

  return request.source.length;
};

const positionToOffset = (source: string, position: ChemdEditorPosition): number => {
  const lines = splitSourceLines(source);
  let offset = 0;
  for (let index = 0; index < Math.max(position.line - 1, 0); index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return clamp(offset + Math.max(position.column - 1, 0), 0, source.length);
};

const offsetToPosition = (source: string, offset: number): ChemdEditorPosition => {
  const before = source.slice(0, clamp(offset, 0, source.length));
  const lines = splitSourceLines(before);
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1
  };
};

const createCompletionRange = (
  position: ChemdEditorPosition,
  prefixLength: number
) => ({
  startLine: position.line,
  startColumn: Math.max(position.column - prefixLength, 1),
  endLine: position.line,
  endColumn: position.column
});

const findOpenProgramBlock = (
  lines: string[],
  cursorLine: number
): ChemdCompletionContext["block"] => {
  const stack: Array<{
    type: string;
    id?: string;
    startLine: number;
    fields: Map<string, string>;
  }> = [];

  for (let index = 0; index < cursorLine; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const header = readProgramBlockHeader(line);
    if (header) {
      stack.push({
        type: header.type,
        id: header.id,
        startLine: index + 1,
        fields: new Map()
      });
      continue;
    }
    if (trimmed.startsWith("}") && stack.length > 0) {
      stack.pop();
      continue;
    }
    const open = stack.at(-1);
    const field = readFieldLine(line);
    if (open && field) {
      const canonicalField = resolveDeclarationField(open.type, field.key)?.canonicalName ?? field.key;
      open.fields.set(canonicalField, field.value.trim());
    }
  }

  const open = stack.at(-1);
  return open ? {
    type: open.type,
    id: open.id,
    startLine: open.startLine,
    kind: inferProgramBlockKind(open.type, open.fields),
    fields: new Set(open.fields.keys())
  } : undefined;
};

const inferBlockKind = (
  blockType: string,
  fields: Map<string, string>
): ChemdCompletionBlockKind => {
  if ([...fields.keys()].some((field) => reactionOnlyFields.has(field))) {
    return "reaction";
  }
  if ([...fields.keys()].some((field) => moleculeOnlyFields.has(field))) {
    return "molecule";
  }

  return "unknown";
};

const inferProgramBlockKind = (
  blockType: string,
  fields: Map<string, string>
): ChemdCompletionBlockKind => {
  if (blockType === "meta") {
    return "unknown";
  }
  if (isKnownCompletionBlockKind(blockType)) {
    return blockType;
  }
  return inferBlockKind(blockType, fields);
};

const isKnownCompletionBlockKind = (type: string): type is ChemdCompletionBlockKind =>
  type === "step" || isKnownDeclarationKind(type);

const readFieldAtCursor = (linePrefix: string): { hasColon: boolean; key?: string } => {
  const colonIndex = linePrefix.indexOf(":");
  const key = linePrefix.slice(0, colonIndex >= 0 ? colonIndex : undefined).trim();
  return {
    hasColon: colonIndex >= 0,
    key: key || undefined
  };
};

const isNameStart = (char: string): boolean =>
  (char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_";

const isNameChar = (char: string): boolean =>
  isNameStart(char) || (char >= "0" && char <= "9") || char === "-";

const readProgramBlockHeader = (
  line: string
): { type: string; id?: string } | undefined => {
  const trimmed = line.trim();
  if (!trimmed.endsWith("{")) return undefined;
  if (trimmed === "meta {") {
    return { type: "meta" };
  }

  const agent = trimmed.match(/^agent\s+run\s+([A-Za-z_][\w-]*)\s*\{$/u);
  if (agent) {
    return { type: "agent_run", id: agent[1] };
  }

  const declaration = trimmed.match(/^([A-Za-z_][\w-]*)\s+([A-Za-z_][\w-]*)(?:\s+for\s+@[A-Za-z0-9_.#/-]+)?\s*\{$/u);
  if (!declaration) {
    return undefined;
  }

  return {
    type: declaration[1] ?? "",
    id: declaration[2]
  };
};

const readFieldLine = (line: string): { key: string; value: string } | undefined => {
  let index = 0;
  while (line[index] === " " || line[index] === "\t") index += 1;
  const start = index;
  if (!isNameStart(line[index] ?? "")) return undefined;
  index += 1;
  while (isNameChar(line[index] ?? "")) index += 1;
  const key = line.slice(start, index);
  while (line[index] === " " || line[index] === "\t") index += 1;
  if (line[index] !== ":") return undefined;
  return { key, value: line.slice(index + 1) };
};

const isStepFamilyPrefix = (linePrefix: string): boolean => {
  return /^\s*step\s+[A-Za-z_][\w-]*\s*=\s*[A-Za-z_][\w-]*$/u.test(linePrefix) ||
    /^\s*step\s+[A-Za-z_][\w-]*\s*=\s*$/u.test(linePrefix);
};

const readStepParamContext = (
  linePrefix: string
): ChemdCompletionContext["stepParam"] => {
  const programStep = linePrefix.match(/^\s*step\s+[A-Za-z_][\w-]*\s*=\s*([A-Za-z_][\w-]*)\((.*)$/u);
  if (!programStep) {
    return undefined;
  }
  const family = programStep[1] ?? "";
  const args = programStep[2] ?? "";
  const usedParams = new Set<string>();
  const parts = args.split(",");
  for (const part of parts.slice(0, -1)) {
    const name = part.trim().match(/^([A-Za-z_][\w-]*)(?=\s*[:=])/u)?.[1];
    if (name) {
      usedParams.add(name);
    }
  }
  const current = parts.at(-1)?.trim() ?? "";
  if (current.includes("=") || current.includes(":")) {
    return undefined;
  }

  return {
    family,
    prefix: current,
    usedParams
  };
};

const readTokenPrefix = (linePrefix: string): string => {
  let start = linePrefix.length;
  while (start > 0 && isTokenPrefixChar(linePrefix[start - 1])) {
    start -= 1;
  }
  return linePrefix.slice(start);
};

const isTokenPrefixChar = (char: string): boolean =>
  (char >= "A" && char <= "Z")
  || (char >= "a" && char <= "z")
  || (char >= "0" && char <= "9")
  || ["_", "@", "#", ".", "/", ":", "-"].includes(char);

const isInsideFrontmatter = (lines: string[], cursorLine: number): boolean => {
  if (lines[0]?.trim() !== "---") {
    return false;
  }
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return endIndex < 0 || cursorLine <= endIndex + 1;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
