import type {
  ChemdDeclaration,
  ChemdFieldDeclarationBase,
  ChemdProgramDeclarationKind,
  ChemdReferenceExpr,
  ChemdValue,
  FieldSourceSpans,
} from "@chemd/core";

import { parseAgentRunDeclaration } from "./parse-agent";
import { parseProcedureDeclaration } from "./parse-procedure";
import type { ProgramParserContext, ProgramParserCursor } from "./parser";
import { isIdentifierToken, tokenValue } from "./parser";
import type { ProgramToken } from "./tokens";

const FIELD_DECLARATION_KINDS = new Set<ChemdProgramDeclarationKind>([
  "molecule",
  "material",
  "batch",
  "reaction",
  "reaction_template",
  "result",
  "analysis",
  "sample",
  "artifact",
  "condition_screen",
  "observation",
  "trace"
]);

const TARGETED_KINDS = new Set<ChemdProgramDeclarationKind>([
  "result",
  "analysis",
  "condition_screen",
  "observation",
  "trace"
]);

export interface ParsedFieldBlock {
  fields: Record<string, ChemdValue>;
  fieldSpans: FieldSourceSpans;
  endToken?: ProgramToken;
}

export const parseDeclarations = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext
): ChemdDeclaration[] => {
  const declarations: ChemdDeclaration[] = [];
  while (!cursor.isAtEnd()) {
    const docs = cursor.collectDocs();
    const kind = tokenValue(cursor.peek());
    if (kind === "procedure") {
      declarations.push(parseProcedureDeclaration(cursor, context, docs));
    } else if (kind === "agent") {
      declarations.push(parseAgentRunDeclaration(cursor, context, docs));
    } else if (kind && FIELD_DECLARATION_KINDS.has(kind as ChemdProgramDeclarationKind)) {
      declarations.push(parseFieldDeclaration(cursor, context, docs));
    } else {
      cursor.syntaxError("E_PROGRAM_DECLARATION_EXPECTED", "Expected a declaration.", cursor.peek());
      cursor.consume();
    }
  }
  return declarations;
};

export const parseFieldBlock = (cursor: ProgramParserCursor): ParsedFieldBlock => {
  const fields: Record<string, ChemdValue> = {};
  const fieldSpans: FieldSourceSpans = {};
  cursor.expectValue("{", "E_PROGRAM_BLOCK_OPEN_EXPECTED");
  let endToken: ProgramToken | undefined;
  let closed = false;

  while (!cursor.isAtEnd()) {
    if (tokenValue(cursor.peek()) === "}") {
      endToken = cursor.consume();
      closed = true;
      break;
    }
    const fieldStart = cursor.expectIdentifier("E_PROGRAM_FIELD_NAME_EXPECTED", "field name");
    if (!fieldStart) {
      cursor.consume();
      continue;
    }
    const colon = cursor.expectValue(":", "E_PROGRAM_FIELD_COLON_EXPECTED");
    if (!colon && isLikelyNextLineField(cursor, fieldStart)) {
      continue;
    }
    const value = cursor.parseValue();
    const fieldName = tokenValue(fieldStart) ?? "unknown";
    fields[fieldName] = value;
    fieldSpans[fieldName] = cursor.sourceSpanFrom(fieldStart, value.sourceSpan);
    consumeOptionalSeparator(cursor, fieldName);
  }

  if (!closed) {
    cursor.syntaxError("E_PROGRAM_BLOCK_CLOSE_EXPECTED", "Expected '}' to close block.");
  }
  return { fields, fieldSpans, endToken };
};

export const valueAsString = (value?: ChemdValue): string => {
  if (!value) {
    return "";
  }
  if (value.type === "string") {
    return value.value;
  }
  if (value.type === "identifier") {
    return value.name;
  }
  return value.raw;
};

export const valueAsNumber = (value?: ChemdValue): number | undefined => {
  if (!value) {
    return undefined;
  }
  if ("value" in value && typeof value.value === "number") {
    return value.value;
  }
  return undefined;
};

export const valueAsReferenceList = (value?: ChemdValue): ChemdReferenceExpr[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.type === "reference") {
    return [value];
  }
  if (value.type !== "list") {
    return undefined;
  }
  const refs = value.items.filter((item): item is ChemdReferenceExpr => item.type === "reference");
  return refs.length > 0 ? refs : undefined;
};

export const valueAsStringList = (value?: ChemdValue): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.type === "list") {
    return value.items.map(valueAsString).filter(Boolean);
  }
  const single = valueAsString(value);
  return single ? [single] : undefined;
};

export const consumeOptionalSeparator = (
  cursor: ProgramParserCursor,
  fieldName?: string
): void => {
  const separator = tokenValue(cursor.peek());
  if (![",", ";"].includes(separator ?? "")) {
    return;
  }
  cursor.consume();
  if (separator === "," && fieldName && isBareCommaValue(cursor)) {
    cursor.syntaxError(
      "E_PROGRAM_FIELD_LIST_BRACKETS_REQUIRED",
      `Multiple field values must be wrapped in brackets, for example ${fieldName}: ["A", "B"].`,
      cursor.peek()
    );
    discardBareCommaValues(cursor);
  }
};

const isBareCommaValue = (cursor: ProgramParserCursor): boolean => {
  const next = cursor.peek();
  if (!next || ["}", "eof"].includes(tokenValue(next) ?? "")) {
    return false;
  }
  return !(isIdentifierToken(next) && tokenValue(cursor.peek(1)) === ":");
};

const discardBareCommaValues = (cursor: ProgramParserCursor): void => {
  while (!cursor.isAtEnd()) {
    const next = cursor.peek();
    if (!next || tokenValue(next) === "}") {
      return;
    }
    if (isIdentifierToken(next) && tokenValue(cursor.peek(1)) === ":") {
      return;
    }
    cursor.consume();
  }
};

const isLikelyNextLineField = (
  cursor: ProgramParserCursor,
  fieldStart: ProgramToken
): boolean => {
  const next = cursor.peek();
  return !!next
    && next.line > fieldStart.endLine
    && isIdentifierToken(next)
    && tokenValue(cursor.peek(1)) === ":";
};

export const parseTargetReference = (
  cursor: ProgramParserCursor
): ChemdReferenceExpr | undefined => {
  if (!cursor.matchValue("for")) {
    return undefined;
  }
  const value = cursor.parseValue();
  if (value.type !== "reference") {
    cursor.syntaxError("E_PROGRAM_TARGET_REFERENCE_EXPECTED", "Expected a target reference.");
    return undefined;
  }
  return value;
};

const parseFieldDeclaration = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext,
  docs: ReturnType<ProgramParserCursor["collectDocs"]>
): ChemdDeclaration => {
  const start = cursor.consume();
  const kind = tokenValue(start) as ChemdProgramDeclarationKind;
  const id = cursor.expectIdentifier("E_PROGRAM_DECLARATION_ID_EXPECTED", "declaration id");
  const declarationId = tokenValue(id) ?? "unknown";
  const target = TARGETED_KINDS.has(kind) ? parseTargetReference(cursor) : undefined;
  const parsed = parseFieldBlock(cursor);
  const base: ChemdFieldDeclarationBase = {
    kind,
    id: declarationId,
    qualifiedId: `${context.moduleName}.${declarationId}`,
    fields: parsed.fields,
    docs: context.addDocs(docs, { kind: "declaration", declarationId }),
    sourceSpan: cursor.sourceSpanFrom(start, parsed.endToken),
    fieldSpans: parsed.fieldSpans
  };
  return target ? ({ ...base, target } as ChemdDeclaration) : (base as ChemdDeclaration);
};

export const consumeIdentifierPath = (cursor: ProgramParserCursor): string[] => {
  const parts: string[] = [];
  const first = cursor.expectIdentifier("E_PROGRAM_IDENTIFIER_PATH_EXPECTED", "identifier path");
  if (first) {
    parts.push(tokenValue(first) ?? "unknown");
  }
  while (tokenValue(cursor.peek()) === "." && cursor.peek(1) && isIdentifierToken(cursor.peek(1)!)) {
    cursor.consume();
    const part = cursor.consume();
    if (part) {
      parts.push(tokenValue(part) ?? "unknown");
    }
  }
  return parts;
};
