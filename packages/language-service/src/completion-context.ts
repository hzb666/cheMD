import type {
  ChemdCompletionBlockKind,
  ChemdCompletionContext,
  ChemdCompletionRequest,
  ChemdEditorPosition
} from "./completion-types";
import {
  getCompletionBlockFields,
  isKnownBlockType,
  normalizeChemdKind,
  resolveBlockField
} from "@chemd/core";

const moleculeCompletionFields = new Set(getCompletionBlockFields("chemd", "molecule"));
const reactionCompletionFields = new Set(getCompletionBlockFields("chemd", "reaction"));
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
  const block = findOpenBlock(lines, position.line);
  const field = readFieldAtCursor(linePrefix);
  const stepParam = readStepParamContext(linePrefix);

  return {
    source: request.source,
    offset,
    position,
    lineText,
    linePrefix,
    tokenPrefix,
    range,
    isFrontmatter: isInsideFrontmatter(lines, position.line),
    isChemdBlock: block?.type === "chemd",
    isUseHeaderPosition: isUseHeaderPrefix(linePrefix),
    isReferencePosition: tokenPrefix.startsWith("@") ||
      (request.triggerCharacter === "@" && linePrefix.endsWith("@")),
    isStepFamilyPosition: isStepFamilyPrefix(linePrefix),
    isFieldKeyPosition: Boolean(block) && !field.hasColon && !linePrefix.trim().startsWith(":::"),
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

const findOpenBlock = (
  lines: string[],
  cursorLine: number
): ChemdCompletionContext["block"] => {
  let open:
    | { type: string; id?: string; startLine: number; fields: Map<string, string> }
    | undefined;

  for (let index = 0; index < cursorLine; index += 1) {
    const line = lines[index] ?? "";
    const header = readBlockHeader(line);
    if (line.trim() === ":::" && open) {
      open = undefined;
      continue;
    }
    if (header) {
      open = {
        type: normalizeBlockType(header.type),
        id: readBlockId(header.arg),
        startLine: index + 1,
        fields: new Map()
      };
      continue;
    }
    const field = readFieldLine(line);
    if (open && field) {
      const schemaBlockType = toSchemaBlockType(open.type);
      const canonicalField = resolveBlockField(schemaBlockType, field.key)?.canonicalName ?? field.key;
      open.fields.set(canonicalField, field.value.trim());
    }
  }

  return open ? {
    type: open.type,
    id: open.id,
    startLine: open.startLine,
    kind: inferBlockKind(open.type, open.fields),
    fields: new Set(open.fields.keys())
  } : undefined;
};

const inferBlockKind = (
  blockType: string,
  fields: Map<string, string>
): ChemdCompletionBlockKind => {
  if (blockType !== "chemd") {
    return isKnownCompletionBlockKind(blockType) ? blockType : "unknown";
  }
  const explicitKind = fields.get("kind");
  const normalizedKind = explicitKind ? normalizeChemdKind(explicitKind) : undefined;
  if (normalizedKind) {
    return normalizedKind;
  }
  if ([...fields.keys()].some((field) => reactionOnlyFields.has(field))) {
    return "reaction";
  }
  if ([...fields.keys()].some((field) => moleculeOnlyFields.has(field))) {
    return "molecule";
  }

  return "unknown";
};

const normalizeBlockType = (type: string): string =>
  type === "condition-varies" ? "condition_varies" : type;

const toSchemaBlockType = (type: string): string =>
  type === "condition_varies" ? "condition-varies" : type;

const isKnownCompletionBlockKind = (type: string): type is ChemdCompletionBlockKind =>
  [
    "molecule",
    "material",
    "batch",
    "reaction",
    "result",
    "analysis",
    "procedure",
    "trace",
    "observation",
    "step",
    "event",
    "template",
    "use",
    "sample",
    "artifact",
    "condition_varies"
  ].includes(type) || isKnownBlockType(toSchemaBlockType(type));

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

const readBlockHeader = (line: string): { type: string; arg?: string } | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(":::")) return undefined;
  let index = 3;
  if (!isNameStart(trimmed[index] ?? "")) return undefined;
  index += 1;
  while (isNameChar(trimmed[index] ?? "")) index += 1;
  const type = trimmed.slice(3, index);
  if (index >= trimmed.length) return { type };
  if (trimmed[index] !== " " && trimmed[index] !== "\t") return undefined;
  return { type, arg: trimmed.slice(index).trim() };
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

const isUseHeaderPrefix = (linePrefix: string): boolean => {
  const trimmed = linePrefix.trimStart();
  if (!trimmed.startsWith(":::use")) return false;
  const rest = trimmed.slice(":::use".length);
  return rest.length > 0 && rest.trim().length > 0 && !rest.trim().includes(" ");
};

const isStepFamilyPrefix = (linePrefix: string): boolean => {
  const field = readFieldLine(linePrefix);
  return field?.key === "step" && !field.value.includes("|");
};

const readStepParamContext = (
  linePrefix: string
): ChemdCompletionContext["stepParam"] => {
  const field = readFieldLine(linePrefix);
  if (field?.key !== "step" || !field.value.includes("|")) {
    return undefined;
  }

  const segments = field.value.split("|").map((segment) => segment.trim());
  const family = segments[0]?.split(/\s+/)[0]?.trim();
  if (!family) {
    return undefined;
  }

  const usedParams = new Set<string>();
  for (const segment of segments.slice(1, -1)) {
    const equalsIndex = segment.indexOf("=");
    if (equalsIndex > 0) {
      usedParams.add(segment.slice(0, equalsIndex).trim());
    }
  }

  const current = segments[segments.length - 1] ?? "";
  if (current.includes("=")) {
    return undefined;
  }

  return {
    family,
    prefix: current,
    usedParams
  };
};

const readBlockId = (headerArg: string | undefined): string | undefined => {
  const trimmed = headerArg?.trim() ?? "";
  const end = Array.from(trimmed).findIndex((char) => char === " " || char === "\t");
  const token = end >= 0 ? trimmed.slice(0, end) : trimmed;
  return token.startsWith("#") ? token.slice(1) : undefined;
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
