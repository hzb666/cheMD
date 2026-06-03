import type { ObjectNode } from "./types";

export type ExpressionValue =
  | { kind: "number"; value: number }
  | { kind: "quantity"; value: number; unit: string }
  | { kind: "string"; value: string };

export type SymbolValue = "+" | "-" | "*" | "/" | "(" | ")" | ",";

export type Token =
  | { type: "number"; value: string }
  | { type: "quantity"; value: string; unit: string }
  | { type: "reference"; value: string }
  | { type: "identifier"; value: string }
  | { type: "symbol"; value: SymbolValue };

export interface ExpressionContext {
  objectIndex: Map<string, ObjectNode>;
  sourceNodeType: string;
  sourceNodeId?: string;
  field: string;
}

export type ExpressionErrorCode =
  | "E_EXPRESSION_DIVISION_BY_ZERO"
  | "E_EXPRESSION_DIVISION_DENOMINATOR_TYPE"
  | "E_EXPRESSION_EXPECTED_NUMERIC"
  | "E_EXPRESSION_EXPECTED_SYMBOL"
  | "E_EXPRESSION_FUNCTION_NOT_ALLOWED"
  | "E_EXPRESSION_INVALID_NUMBER"
  | "E_EXPRESSION_INVALID_QUANTITY"
  | "E_EXPRESSION_MISSING_ARGUMENT"
  | "E_EXPRESSION_PERCENT_DENOMINATOR_ZERO"
  | "E_EXPRESSION_RATIO_DENOMINATOR_ZERO"
  | "E_EXPRESSION_REFERENCE_INVALID"
  | "E_EXPRESSION_REFERENCE_UNRESOLVED"
  | "E_EXPRESSION_TO_UNIT_TYPE"
  | "E_EXPRESSION_TRAILING_TOKEN"
  | "E_EXPRESSION_UNARY_TYPE"
  | "E_EXPRESSION_UNIT_CONVERSION_UNSUPPORTED"
  | "E_EXPRESSION_UNIT_MISMATCH"
  | "E_EXPRESSION_UNEXPECTED_END"
  | "E_EXPRESSION_UNEXPECTED_TOKEN"
  | "E_EXPRESSION_UNSUPPORTED_TOKEN";

export class ExpressionError extends Error {
  constructor(
    readonly code: ExpressionErrorCode,
    message: string,
    readonly facts: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ExpressionError";
  }
}

export const expressionError = (
  code: ExpressionErrorCode,
  message: string,
  facts: Record<string, unknown> = {}
): ExpressionError => new ExpressionError(code, message, facts);

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));

export const serializeValue = (value: ExpressionValue): string => {
  if (value.kind === "number") {
    return formatNumber(value.value);
  }

  if (value.kind === "string") {
    return value.value;
  }

  const formatted = formatNumber(value.value);
  if (value.unit === "%") {
    return `${formatted}%`;
  }
  return `${formatted} ${value.unit}`;
};

export const parseValueLiteral = (raw: string): ExpressionValue => {
  const trimmed = raw.trim();
  const quantityMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%°℃]+)$/);

  if (quantityMatch) {
    return {
      kind: "quantity",
      value: Number(quantityMatch[1]),
      unit: quantityMatch[2]
    };
  }

  const value = Number(trimmed);
  return Number.isFinite(value)
    ? { kind: "number", value }
    : { kind: "string", value: trimmed };
};
