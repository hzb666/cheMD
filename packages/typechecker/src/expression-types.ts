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
