import {
  type ExpressionContext,
  type ExpressionValue,
  parseValueLiteral
} from "./expression-types";

const UNIT_FACTORS: Record<string, Record<string, number>> = {
  mg: { mg: 1, g: 1000, kg: 1000000 },
  g: { mg: 0.001, g: 1, kg: 1000 },
  mmol: { mmol: 1, mol: 1000 },
  mol: { mmol: 0.001, mol: 1 },
  ml: { ml: 1, l: 1000 },
  l: { ml: 0.001, l: 1 }
};

const PURE_FUNCTIONS = new Set([
  "to_unit",
  "percent",
  "ratio",
  "sum",
  "coalesce",
  "theoretical_yield"
]);

const requireArg = (args: ExpressionValue[], index: number, name: string): ExpressionValue => {
  const value = args[index];
  if (!value) {
    throw new Error(`${name} requires argument ${index + 1}`);
  }
  return value;
};

export const toNumber = (value: ExpressionValue): number => {
  if (value.kind === "number" || value.kind === "quantity") {
    return value.value;
  }

  const parsed = Number(value.value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Expected numeric expression value");
  }

  return parsed;
};

const isMissingValue = (value: ExpressionValue): boolean =>
  value.kind === "string" && value.value.length === 0;

const assertSameUnit = (left: ExpressionValue, right: ExpressionValue): string => {
  if (left.kind !== "quantity" || right.kind !== "quantity" || left.unit !== right.unit) {
    throw new Error("Quantity arithmetic requires matching units");
  }

  return left.unit;
};

export const addValues = (left: ExpressionValue, right: ExpressionValue): ExpressionValue => {
  if (left.kind === "quantity" || right.kind === "quantity") {
    return { kind: "quantity", value: toNumber(left) + toNumber(right), unit: assertSameUnit(left, right) };
  }

  return { kind: "number", value: toNumber(left) + toNumber(right) };
};

export const subtractValues = (left: ExpressionValue, right: ExpressionValue): ExpressionValue => {
  if (left.kind === "quantity" || right.kind === "quantity") {
    return { kind: "quantity", value: toNumber(left) - toNumber(right), unit: assertSameUnit(left, right) };
  }

  return { kind: "number", value: toNumber(left) - toNumber(right) };
};

export const multiplyValues = (left: ExpressionValue, right: ExpressionValue): ExpressionValue => {
  if (left.kind === "quantity" && right.kind === "number") {
    return { ...left, value: left.value * right.value };
  }

  if (right.kind === "quantity" && left.kind === "number") {
    return { ...right, value: right.value * left.value };
  }

  return { kind: "number", value: toNumber(left) * toNumber(right) };
};

export const divideValues = (left: ExpressionValue, right: ExpressionValue): ExpressionValue => {
  if (right.kind !== "number") {
    throw new Error("Division denominator must be numeric");
  }

  if (right.value === 0) {
    throw new Error("Division by zero is not allowed");
  }

  if (left.kind === "quantity") {
    return { ...left, value: left.value / right.value };
  }

  return { kind: "number", value: toNumber(left) / right.value };
};

export const resolveReferenceValue = (reference: string, context: ExpressionContext): ExpressionValue => {
  const match = reference.match(/^@([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) {
    throw new Error(`Invalid field reference: ${reference}`);
  }

  const [, nodeId, field] = match;
  const node = context.objectIndex.get(nodeId);
  const value = node ? (node as unknown as Record<string, unknown>)[field] : undefined;

  if (typeof value !== "string") {
    throw new Error(`Unable to resolve field reference: ${reference}`);
  }

  return parseValueLiteral(value);
};

export const evaluateFunction = (name: string, args: ExpressionValue[]): ExpressionValue => {
  if (!PURE_FUNCTIONS.has(name)) {
    throw new Error(`Function is not allowed: ${name}`);
  }

  if (name === "percent") {
    return evaluatePercent(args);
  }

  if (name === "ratio") {
    return evaluateRatio(args);
  }

  if (name === "coalesce") {
    return args.find((arg) => !isMissingValue(arg)) ?? { kind: "string", value: "" };
  }

  if (name === "to_unit") {
    return convertUnit(requireArg(args, 0, name), requireArg(args, 1, name));
  }

  if (name === "theoretical_yield") {
    return args.reduce((product, arg) => multiplyValues(product, arg), { kind: "number", value: 1 });
  }

  return args.reduce((sum, arg) => addValues(sum, arg), { kind: "number", value: 0 });
};

const evaluatePercent = (args: ExpressionValue[]): ExpressionValue => {
  const denominator = toNumber(requireArg(args, 1, "percent"));
  if (denominator === 0) {
    throw new Error("percent denominator cannot be zero");
  }

  return {
    kind: "quantity",
    value: (toNumber(requireArg(args, 0, "percent")) / denominator) * 100,
    unit: "%"
  };
};

const evaluateRatio = (args: ExpressionValue[]): ExpressionValue => {
  const denominator = toNumber(requireArg(args, 1, "ratio"));
  if (denominator === 0) {
    throw new Error("ratio denominator cannot be zero");
  }

  return { kind: "number", value: toNumber(requireArg(args, 0, "ratio")) / denominator };
};

const convertUnit = (quantity: ExpressionValue, unitValue: ExpressionValue): ExpressionValue => {
  if (quantity.kind !== "quantity" || unitValue.kind !== "string") {
    throw new Error("to_unit expects a quantity and unit");
  }

  const targetUnit = unitValue.value;
  const factor = UNIT_FACTORS[targetUnit.toLowerCase()]?.[quantity.unit.toLowerCase()];
  if (factor === undefined) {
    throw new Error(`Unsupported unit conversion: ${quantity.unit} to ${targetUnit}`);
  }

  return {
    kind: "quantity",
    value: quantity.value * factor,
    unit: targetUnit
  };
};
