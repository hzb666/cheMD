import type { ChemdCallArg, ChemdRecordField, ChemdReferenceExpr, ChemdValue, SourceSpan } from "@chemd/core";

import type { ProgramValueParser } from "./parse-value-parser";
import type { ProgramToken } from "./tokens";
import { spanFromTokens, tokenSourceSpan } from "./tokens";

export const stringValue = (token: ProgramToken): ChemdValue => ({
  type: "string",
  raw: token.raw,
  value: decodeStringToken(token.raw),
  sourceSpan: tokenSourceSpan(token)
});

export const identifierValue = (token: ProgramToken): ChemdValue => {
  if (token.raw === "true" || token.raw === "false") {
    return {
      type: "boolean",
      raw: token.raw,
      value: token.raw === "true",
      sourceSpan: tokenSourceSpan(token)
    };
  }
  return {
    type: "identifier",
    raw: token.raw,
    name: token.raw,
    sourceSpan: tokenSourceSpan(token)
  };
};

export const numericValue = (parser: ProgramValueParser): ChemdValue => {
  const numberToken = parser.advance();
  const value = parseFiniteNumber(numberToken.raw);
  if (parser.match("percent")) {
    const endToken = parser.previous();
    return {
      type: "percent",
      raw: parser.rawBetween(numberToken, endToken),
      value,
      sourceSpan: spanFromTokens(numberToken, endToken)
    };
  }
  if (parser.current().type === "identifier") {
    const unitToken = parser.advance();
    return {
      type: "quantity",
      raw: parser.rawBetween(numberToken, unitToken),
      value,
      unit: unitToken.raw,
      sourceSpan: spanFromTokens(numberToken, unitToken)
    };
  }
  return {
    type: "number",
    raw: numberToken.raw,
    value,
    sourceSpan: tokenSourceSpan(numberToken)
  };
};

export const referenceValue = (
  parser: ProgramValueParser
): ChemdReferenceExpr | undefined => {
  const atToken = parser.advance();
  const first = parser.consume("identifier", "Expected reference target after '@'.");
  if (!first) {
    return undefined;
  }
  if (parser.match("hash")) {
    return externalReference(parser, atToken, first);
  }
  return parser.match("dot")
    ? dottedReference(parser, atToken, first)
    : localReference(parser, atToken, first);
};

export const listValue = (parser: ProgramValueParser): ChemdValue => {
  const startToken = parser.advance();
  const items: ChemdValue[] = [];
  while (!parser.isAt("right_bracket") && !parser.isAt("eof")) {
    const item = parser.parseValue();
    if (item) {
      items.push(item);
    }
    if (!parser.match("comma")) {
      break;
    }
  }
  const endToken = parser.consumeClosing("right_bracket", startToken);
  return {
    type: "list",
    raw: parser.rawBetween(startToken, endToken),
    items,
    sourceSpan: spanFromTokens(startToken, endToken)
  };
};

export const recordValue = (parser: ProgramValueParser): ChemdValue => {
  const startToken = parser.advance();
  const fields: ChemdRecordField[] = [];
  while (!parser.isAt("right_brace") && !parser.isAt("eof")) {
    const field = recordField(parser);
    if (field) {
      fields.push(field);
    }
    if (!parser.match("comma")) {
      break;
    }
  }
  const endToken = parser.consumeClosing("right_brace", startToken);
  return {
    type: "record",
    raw: parser.rawBetween(startToken, endToken),
    fields,
    sourceSpan: spanFromTokens(startToken, endToken)
  };
};

export const callValue = (
  parser: ProgramValueParser,
  callee: ProgramToken
): ChemdValue => {
  const args: ChemdCallArg[] = [];
  while (!parser.isAt("right_paren") && !parser.isAt("eof")) {
    const arg = callArg(parser);
    if (arg) {
      args.push(arg);
    }
    if (!parser.match("comma")) {
      break;
    }
  }
  const endToken = parser.consumeClosing("right_paren", callee);
  return {
    type: "call",
    raw: parser.rawBetween(callee, endToken),
    callee: callee.raw,
    args,
    sourceSpan: spanFromTokens(callee, endToken)
  };
};

const dottedReference = (
  parser: ProgramValueParser,
  atToken: ProgramToken,
  first: ProgramToken
): ChemdReferenceExpr | undefined => {
  const second = parser.consume("identifier", "Expected identifier after '.'.");
  if (!second) {
    return undefined;
  }
  if (parser.isKnownModuleName(first.raw)) {
    const field = parser.match("dot")
      ? parser.consume("identifier", "Expected module reference field after '.'.")
      : undefined;
    return moduleReference(parser, atToken, first, second, field);
  }
  if (parser.match("dot")) {
    return fieldReference(parser, atToken, `${first.raw}.${second.raw}`);
  }
  return fieldReference(parser, atToken, first.raw, second);
};

const externalReference = (
  parser: ProgramValueParser,
  atToken: ProgramToken,
  documentToken: ProgramToken
): ChemdReferenceExpr | undefined => {
  const anchor = parser.consume("identifier", "Expected external anchor after '#'.");
  if (!anchor) {
    return undefined;
  }
  const field = parser.match("dot")
    ? parser.consume("identifier", "Expected external field after '.'.")
    : undefined;
  const endToken = field ?? anchor;
  return {
    type: "reference",
    refKind: "external_document",
    raw: parser.rawBetween(atToken, endToken),
    target: anchor.raw,
    externalDocumentId: documentToken.raw,
    field: field?.raw,
    sourceSpan: spanFromTokens(atToken, endToken)
  };
};

const localReference = (
  parser: ProgramValueParser,
  atToken: ProgramToken,
  target: ProgramToken
): ChemdReferenceExpr => ({
  type: "reference",
  refKind: "local",
  raw: parser.rawBetween(atToken, target),
  target: target.raw,
  sourceSpan: spanFromTokens(atToken, target)
});

const moduleReference = (
  parser: ProgramValueParser,
  atToken: ProgramToken,
  moduleName: ProgramToken,
  target: ProgramToken,
  field?: ProgramToken
): ChemdReferenceExpr => ({
  type: "reference",
  refKind: "module",
  raw: parser.rawBetween(atToken, field ?? target),
  target: target.raw,
  moduleName: moduleName.raw,
  ...(field ? { field: field.raw } : {}),
  sourceSpan: spanFromTokens(atToken, field ?? target)
});

const fieldReference = (
  parser: ProgramValueParser,
  atToken: ProgramToken,
  target: string,
  fieldToken?: ProgramToken
): ChemdReferenceExpr | undefined => {
  const field = fieldToken ?? parser.consume("identifier", "Expected field after '.'.");
  if (!field) {
    return undefined;
  }
  return {
    type: "reference",
    refKind: "field",
    raw: parser.rawBetween(atToken, field),
    target,
    field: field.raw,
    sourceSpan: spanFromTokens(atToken, field)
  };
};

const recordField = (parser: ProgramValueParser): ChemdRecordField | undefined => {
  const key = parser.consume("identifier", "Expected record field name.");
  if (!key) {
    return undefined;
  }
  parser.consume("colon", "Expected ':' after record field name.");
  const value = parser.parseValue();
  if (!value) {
    return undefined;
  }
  return {
    key: key.raw,
    value,
    sourceSpan: spanFromValue(key, value.sourceSpan)
  };
};

const callArg = (parser: ProgramValueParser): ChemdCallArg | undefined => {
  const name = parser.consume("identifier", "Expected call argument name.");
  if (!name) {
    return undefined;
  }
  if (!parser.match("colon") && !parser.match("equal")) {
    parser.addDiagnostic(
      parser.current(),
      "E_PROGRAM_EXPECTED_CALL_ARG_ASSIGNMENT",
      "Expected ':' or '=' after call argument name."
    );
  }
  const value = parser.parseValue();
  if (!value) {
    return undefined;
  }
  return {
    name: name.raw,
    value,
    sourceSpan: spanFromValue(name, value.sourceSpan)
  };
};

const parseFiniteNumber = (raw: string): number | undefined => {
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const decodeStringToken = (raw: string): string => {
  if (!raw.startsWith("\"")) {
    return raw.slice(1, -1).replaceAll("\\'", "'");
  }
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw.slice(1, -1);
  }
};

const spanFromValue = (
  startToken: ProgramToken,
  valueSpan: SourceSpan | undefined
): SourceSpan => ({
  start: startToken.start,
  end: valueSpan?.end,
  startLine: startToken.line,
  startColumn: startToken.column,
  endLine: valueSpan?.endLine,
  endColumn: valueSpan?.endColumn
});
