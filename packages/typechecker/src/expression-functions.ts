import {
  type ExpressionContext,
  type ExpressionValue,
  expressionError,
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
    throw expressionError(
      "E_EXPRESSION_MISSING_ARGUMENT",
      `${name} requires argument ${index + 1}`,
      { function_name: name, argument_index: index }
    );
  }
  return value;
};

export const toNumber = (value: ExpressionValue): number => {
  if (value.kind === "number" || value.kind === "quantity") {
    return value.value;
  }

  const parsed = Number(value.value);
  if (!Number.isFinite(parsed)) {
    throw expressionError(
      "E_EXPRESSION_EXPECTED_NUMERIC",
      "Expected numeric expression value",
      { value: value.value, value_kind: value.kind }
    );
  }

  return parsed;
};

const isMissingValue = (value: ExpressionValue): boolean =>
  value.kind === "string" && value.value.length === 0;

const assertSameUnit = (left: ExpressionValue, right: ExpressionValue): string => {
  if (left.kind !== "quantity" || right.kind !== "quantity" || left.unit !== right.unit) {
    throw expressionError(
      "E_EXPRESSION_UNIT_MISMATCH",
      "Quantity arithmetic requires matching units",
      { left_kind: left.kind, right_kind: right.kind }
    );
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
    throw expressionError(
      "E_EXPRESSION_DIVISION_DENOMINATOR_TYPE",
      "Division denominator must be numeric",
      { operator: "/", denominator_kind: right.kind }
    );
  }

  if (right.value === 0) {
    throw expressionError(
      "E_EXPRESSION_DIVISION_BY_ZERO",
      "Division by zero is not allowed",
      { operator: "/" }
    );
  }

  if (left.kind === "quantity") {
    return { ...left, value: left.value / right.value };
  }

  return { kind: "number", value: toNumber(left) / right.value };
};

export const resolveReferenceValue = (reference: string, context: ExpressionContext): ExpressionValue => {
  const match = reference.match(/^@([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!match) {
    throw expressionError(
      "E_EXPRESSION_REFERENCE_INVALID",
      `Invalid field reference: ${reference}`,
      { reference }
    );
  }

  const [, nodeId, field] = match;
  const node = context.objectIndex.get(nodeId);
  const value = node ? (node as unknown as Record<string, unknown>)[field] : undefined;

  if (typeof value !== "string") {
    throw expressionError(
      "E_EXPRESSION_REFERENCE_UNRESOLVED",
      `Unable to resolve field reference: ${reference}`,
      { reference, node_id: nodeId, field }
    );
  }

  return parseValueLiteral(value);
};

export const evaluateFunction = (name: string, args: ExpressionValue[]): ExpressionValue => {
  if (!PURE_FUNCTIONS.has(name)) {
    throw expressionError(
      "E_EXPRESSION_FUNCTION_NOT_ALLOWED",
      `Function is not allowed: ${name}`,
      { function_name: name }
    );
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
    throw expressionError(
      "E_EXPRESSION_PERCENT_DENOMINATOR_ZERO",
      "percent denominator cannot be zero",
      { function_name: "percent", argument_index: 1 }
    );
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
    throw expressionError(
      "E_EXPRESSION_RATIO_DENOMINATOR_ZERO",
      "ratio denominator cannot be zero",
      { function_name: "ratio", argument_index: 1 }
    );
  }

  return { kind: "number", value: toNumber(requireArg(args, 0, "ratio")) / denominator };
};

const convertUnit = (quantity: ExpressionValue, unitValue: ExpressionValue): ExpressionValue => {
  if (quantity.kind !== "quantity" || unitValue.kind !== "string") {
    throw expressionError(
      "E_EXPRESSION_TO_UNIT_TYPE",
      "to_unit expects a quantity and unit",
      { function_name: "to_unit" }
    );
  }

  const targetUnit = unitValue.value;
  const factor = UNIT_FACTORS[targetUnit.toLowerCase()]?.[quantity.unit.toLowerCase()];
  if (factor === undefined) {
    throw expressionError(
      "E_EXPRESSION_UNIT_CONVERSION_UNSUPPORTED",
      `Unsupported unit conversion: ${quantity.unit} to ${targetUnit}`,
      { function_name: "to_unit", from_unit: quantity.unit, to_unit: targetUnit }
    );
  }

  return {
    kind: "quantity",
    value: quantity.value * factor,
    unit: targetUnit
  };
};
