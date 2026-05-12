import type {
  ChemdCompletionBlockKind,
  ChemdCompletionContext,
  ChemdCompletionRequest,
  ChemdEditorPosition
} from "./completion-types";

const blockHeaderPattern = /^\s*:::([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+(.*))?\s*$/;
const fieldPattern = /^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/;
const reactionFields = new Set(["reactants", "products", "route", "prev", "reagents"]);
const moleculeFields = new Set(["smiles", "cas", "formula", "amount", "equivalents"]);

export const getChemdCompletionContext = (
  request: ChemdCompletionRequest
): ChemdCompletionContext => {
  const offset = resolveOffset(request);
  const position = offsetToPosition(request.source, offset);
  const lines = request.source.split(/\r?\n/);
  const lineText = lines[position.line - 1] ?? "";
  const linePrefix = lineText.slice(0, Math.max(position.column - 1, 0));
  const tokenPrefix = readTokenPrefix(linePrefix);
  const range = createCompletionRange(position, tokenPrefix.length);
  const block = findOpenBlock(lines, position.line);
  const field = readFieldAtCursor(linePrefix);

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
    isFieldKeyPosition: Boolean(block) && !field.hasColon,
    isFieldValuePosition: Boolean(block) && field.hasColon,
    fieldKey: field.key,
    fieldPrefix: field.hasColon ? "" : field.key ?? tokenPrefix,
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
  const lines = source.split(/\r?\n/);
  let offset = 0;
  for (let index = 0; index < Math.max(position.line - 1, 0); index += 1) {
    offset += (lines[index]?.length ?? 0) + 1;
  }

  return clamp(offset + Math.max(position.column - 1, 0), 0, source.length);
};

const offsetToPosition = (source: string, offset: number): ChemdEditorPosition => {
  const before = source.slice(0, clamp(offset, 0, source.length));
  const lines = before.split(/\r?\n/);
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
    const header = line.match(blockHeaderPattern);
    if (line.trim() === ":::" && open) {
      open = undefined;
      continue;
    }
    if (header) {
      open = {
        type: header[1] ?? "",
        id: readBlockId(header[2]),
        startLine: index + 1,
        fields: new Map()
      };
      continue;
    }
    const field = line.match(fieldPattern);
    if (open && field) {
      open.fields.set(field[1] ?? "", field[2]?.trim() ?? "");
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
    return "unknown";
  }
  const explicitKind = fields.get("kind");
  if (explicitKind === "molecule" || explicitKind === "reaction") {
    return explicitKind;
  }
  if ([...fields.keys()].some((field) => reactionFields.has(field))) {
    return "reaction";
  }
  if ([...fields.keys()].some((field) => moleculeFields.has(field))) {
    return "molecule";
  }

  return "unknown";
};

const readFieldAtCursor = (linePrefix: string): { hasColon: boolean; key?: string } => {
  const colonIndex = linePrefix.indexOf(":");
  const key = linePrefix.slice(0, colonIndex >= 0 ? colonIndex : undefined).trim();
  return {
    hasColon: colonIndex >= 0,
    key: key || undefined
  };
};

const readBlockId = (headerArg: string | undefined): string | undefined => {
  const token = headerArg?.trim().split(/\s+/, 1)[0] ?? "";
  return token.startsWith("#") ? token.slice(1) : undefined;
};

const readTokenPrefix = (linePrefix: string): string => {
  const match = linePrefix.match(/[A-Za-z0-9_-]*$/);
  return match?.[0] ?? "";
};

const isInsideFrontmatter = (lines: string[], cursorLine: number): boolean => {
  if (lines[0]?.trim() !== "---") {
    return false;
  }
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return endIndex < 0 || cursorLine <= endIndex + 1;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
