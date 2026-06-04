import type {
  ProgramConditionBinaryOperator,
  ProgramConditionExpression,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  QuantityClass
} from "@chemd/core";
import { getQuantityUnit, isQuantityClass } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import { createProgramControlDiagnostic } from "./program-procedure-diagnostics";

type ConditionType =
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "quantity"; quantityClass: QuantityClass }
  | { kind: "string" }
  | { kind: "list"; itemTypes: ConditionType[] }
  | { kind: "unknown" };

const BOOLEAN_BINARY_OPERATORS = new Set<ProgramConditionBinaryOperator>(["and", "or"]);
const COMPARISON_OPERATORS = new Set<ProgramConditionBinaryOperator>([
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "in",
  "matches"
]);

const FIELD_QUANTITY_TYPES: Record<string, QuantityClass> = {
  conversion: "percent",
  duration: "time",
  isolated_mass: "mass",
  mass: "mass",
  pressure: "pressure",
  purity: "percent",
  selectivity: "percent",
  temperature: "temperature",
  time: "time",
  volume: "volume",
  yield: "percent"
};

export const validateConditionExpressionTypes = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration
): V03Diagnostic[] =>
  control.condition
    ? validateExpression(procedure, control, control.condition).diagnostics
    : [];

const validateExpression = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  expression: ProgramConditionExpression
): { type: ConditionType; diagnostics: V03Diagnostic[] } => {
  if (expression.kind === "binary") {
    return validateBinaryExpression(procedure, control, expression);
  }
  if (expression.kind === "unary") {
    return {
      type: { kind: "boolean" },
      diagnostics: validateExpression(procedure, control, expression.argument).diagnostics
    };
  }
  return { type: inferExpressionType(expression), diagnostics: [] };
};

const validateBinaryExpression = (
  procedure: ProcedureDeclaration,
  control: ProcedureControlDeclaration,
  expression: Extract<ProgramConditionExpression, { kind: "binary" }>
): { type: ConditionType; diagnostics: V03Diagnostic[] } => {
  const left = validateExpression(procedure, control, expression.left);
  const right = validateExpression(procedure, control, expression.right);
  const diagnostics = [...left.diagnostics, ...right.diagnostics];
  const compatible = BOOLEAN_BINARY_OPERATORS.has(expression.op)
    ? booleanCompatible(left.type, right.type)
    : comparisonCompatible(expression.op, left.type, right.type);
  if (!compatible) {
    diagnostics.push(createProgramControlDiagnostic(
      "E_CONDITION_TYPE_MISMATCH",
      "error",
      `Condition operator ${expression.op} cannot compare ${formatType(left.type)} and ${formatType(right.type)}.`,
      procedure,
      control,
      {
        left_type: formatType(left.type),
        operator: expression.op,
        right_type: formatType(right.type)
      }
    ));
  }
  return { type: { kind: "boolean" }, diagnostics };
};

const inferExpressionType = (
  expression: ProgramConditionExpression
): ConditionType => {
  if (expression.kind === "runtime_reference") {
    return inferRuntimeReferenceType(expression.namespace, expression.path);
  }
  if (expression.kind === "reference") {
    return inferReferenceType(expression.refId);
  }
  if (expression.kind === "quantity") {
    const quantityClass = quantityClassForUnit(expression.unit);
    return quantityClass
      ? { kind: "quantity", quantityClass }
      : { kind: "unknown" };
  }
  if (expression.kind === "literal") {
    return { kind: expression.valueKind };
  }
  if (expression.kind === "list") {
    return {
      kind: "list",
      itemTypes: expression.items.map(inferExpressionType)
    };
  }
  return { kind: "unknown" };
};

const inferRuntimeReferenceType = (
  namespace: string,
  path: string
): ConditionType => {
  if (namespace === "operator") return { kind: "boolean" };
  if (namespace === "sensor") {
    return inferReferenceType(path);
  }
  if (namespace === "time") return { kind: "unknown" };
  if (namespace === "run") return { kind: "unknown" };
  return { kind: "unknown" };
};

const inferReferenceType = (refId: string): ConditionType => {
  const field = refId.split(".").at(-1);
  const quantityClass = field ? FIELD_QUANTITY_TYPES[field] : undefined;
  if (quantityClass) return { kind: "quantity", quantityClass };
  if (field === "status" || field === "name" || field === "type") return { kind: "string" };
  return { kind: "unknown" };
};

const quantityClassForUnit = (unit: string): QuantityClass | undefined => {
  if (isQuantityClass(unit)) return unit;
  const classes: QuantityClass[] = [
    "amount",
    "mass",
    "volume",
    "temperature",
    "time",
    "pressure",
    "concentration",
    "equivalent",
    "percent",
    "rate",
    "rpm",
    "ph"
  ];
  return classes.find((quantityClass) => Boolean(getQuantityUnit(quantityClass, unit)));
};

const booleanCompatible = (
  left: ConditionType,
  right: ConditionType
): boolean =>
  compatibleWithUnknown(left, right)
  || (left.kind === "boolean" && right.kind === "boolean");

const comparisonCompatible = (
  operator: ProgramConditionBinaryOperator,
  left: ConditionType,
  right: ConditionType
): boolean => {
  if (compatibleWithUnknown(left, right)) return true;
  if (operator === "in") {
    return right.kind === "list"
      && right.itemTypes.every((itemType) => scalarComparisonCompatible(left, itemType));
  }
  if (right.kind === "list" || left.kind === "list") return false;
  if (operator === "matches") {
    return left.kind === "string" && right.kind === "string";
  }
  return scalarComparisonCompatible(left, right);
};

const scalarComparisonCompatible = (
  left: ConditionType,
  right: ConditionType
): boolean => {
  if (compatibleWithUnknown(left, right)) return true;
  if (left.kind === "quantity" && right.kind === "number") return true;
  if (left.kind === "number" && right.kind === "quantity") return true;
  if (left.kind !== right.kind) return false;
  return left.kind !== "quantity" || left.quantityClass === (right as typeof left).quantityClass;
};

const compatibleWithUnknown = (
  left: ConditionType,
  right: ConditionType
): boolean =>
  left.kind === "unknown" || right.kind === "unknown";

const formatType = (type: ConditionType): string =>
  type.kind === "quantity"
    ? `quantity:${type.quantityClass}`
    : type.kind === "list"
      ? `list<${type.itemTypes.map(formatType).join("|") || "unknown"}>`
      : type.kind;
