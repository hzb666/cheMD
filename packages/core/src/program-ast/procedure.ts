import type { SourceMappedNode } from "../ast";
import type { ChemdDeclarationBase } from "./declarations";
import type { ProgramConditionExpression } from "./conditions";
import type { ChemdDocCommentRef } from "./docs";
import type { ChemdReferenceExpr, ChemdValue } from "./values";

export interface ProcedureDeclaration extends ChemdDeclarationBase {
  kind: "procedure";
  target?: ChemdReferenceExpr;
  evidence?: ChemdReferenceExpr[];
  children: ProcedureStatement[];
}

export type ProcedureStatement =
  | ProcedureStepDeclaration
  | ProcedureControlDeclaration
  | ProcedureDocStatement;

export interface ProcedureStepDeclaration extends SourceMappedNode {
  kind: "step";
  id: string;
  family: string;
  args: Record<string, ChemdValue>;
  inputs?: ChemdReferenceExpr[];
  outputs?: ChemdReferenceExpr[];
  dependsOn?: string[];
  evidence?: ChemdReferenceExpr[];
  confidence?: number;
  docs?: ChemdDocCommentRef[];
}

export interface ProcedureControlDeclaration extends SourceMappedNode {
  kind: "control";
  id?: string;
  controlKind: ProgramProcedureControlKind;
  args: Record<string, ChemdValue>;
  condition?: ProgramConditionExpression;
  children: ProcedureStatement[];
  docs?: ChemdDocCommentRef[];
}

export type ProgramProcedureControlKind =
  | "repeat"
  | "until"
  | "branch"
  | "parallel"
  | "case"
  | "default"
  | "path"
  | "wait"
  | "abort_if";

export interface ProcedureDocStatement extends SourceMappedNode {
  kind: "doc";
  doc: ChemdDocCommentRef;
}
