import type { SourceSpan } from "../ast";

export type ProgramConditionExpression =
  | ProgramConditionBinaryExpr
  | ProgramConditionUnaryExpr
  | ProgramConditionReferenceExpr
  | ProgramConditionRuntimeRefExpr
  | ProgramConditionLiteralExpr
  | ProgramConditionQuantityExpr;

export type ProgramConditionBinaryOperator =
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "and"
  | "or"
  | "in"
  | "matches";

export type ProgramConditionUnaryOperator = "not" | "exists";

export interface ProgramConditionExpressionBase {
  raw: string;
  sourceSpan?: SourceSpan;
}

export interface ProgramConditionBinaryExpr extends ProgramConditionExpressionBase {
  kind: "binary";
  op: ProgramConditionBinaryOperator;
  left: ProgramConditionExpression;
  right: ProgramConditionExpression;
}

export interface ProgramConditionUnaryExpr extends ProgramConditionExpressionBase {
  kind: "unary";
  op: ProgramConditionUnaryOperator;
  argument: ProgramConditionExpression;
}

export interface ProgramConditionReferenceExpr extends ProgramConditionExpressionBase {
  kind: "reference";
  refId: string;
}

export interface ProgramConditionRuntimeRefExpr extends ProgramConditionExpressionBase {
  kind: "runtime_reference";
  namespace: string;
  path: string;
}

export interface ProgramConditionLiteralExpr extends ProgramConditionExpressionBase {
  kind: "literal";
  value: boolean | number | string;
  valueKind: "boolean" | "number" | "string";
}

export interface ProgramConditionQuantityExpr extends ProgramConditionExpressionBase {
  kind: "quantity";
  value: number;
  unit: string;
}
