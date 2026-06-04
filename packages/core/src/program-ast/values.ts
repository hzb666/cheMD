import type { ReferenceResolution, SourceMappedNode } from "../ast";

export type ChemdValue =
  | ChemdStringValue
  | ChemdIdentifierValue
  | ChemdBooleanValue
  | ChemdNumberValue
  | ChemdQuantityValue
  | ChemdPercentValue
  | ChemdReferenceExpr
  | ChemdListValue
  | ChemdRecordValue
  | ChemdCallExpr
  | ChemdPatchExpr;

export interface ChemdValueBase extends SourceMappedNode {
  type: ChemdValueKind;
  raw: string;
}

export type ChemdValueKind =
  | "string"
  | "identifier"
  | "boolean"
  | "number"
  | "quantity"
  | "percent"
  | "reference"
  | "list"
  | "record"
  | "call"
  | "patch";

export interface ChemdStringValue extends ChemdValueBase {
  type: "string";
  value: string;
}

export interface ChemdIdentifierValue extends ChemdValueBase {
  type: "identifier";
  name: string;
}

export interface ChemdBooleanValue extends ChemdValueBase {
  type: "boolean";
  value: boolean;
}

export interface ChemdNumberValue extends ChemdValueBase {
  type: "number";
  value?: number;
}

export interface ChemdQuantityValue extends ChemdValueBase {
  type: "quantity";
  value?: number;
  unit: string;
  quantityClass?: string;
}

export interface ChemdPercentValue extends ChemdValueBase {
  type: "percent";
  value?: number;
}

export type ChemdReferenceExpr =
  | ChemdLocalReferenceExpr
  | ChemdFieldReferenceExpr
  | ChemdModuleReferenceExpr
  | ChemdExternalDocumentReferenceExpr;

export interface ChemdReferenceExprBase extends ChemdValueBase {
  type: "reference";
  refKind: ChemdReferenceKind;
  target: string;
  resolved?: ReferenceResolution;
}

export type ChemdReferenceKind =
  | "local"
  | "field"
  | "module"
  | "external_document";

export interface ChemdLocalReferenceExpr extends ChemdReferenceExprBase {
  refKind: "local";
}

export interface ChemdFieldReferenceExpr extends ChemdReferenceExprBase {
  refKind: "field";
  field: string;
}

export interface ChemdModuleReferenceExpr extends ChemdReferenceExprBase {
  refKind: "module";
  moduleName: string;
  field?: string;
}

export interface ChemdExternalDocumentReferenceExpr
  extends ChemdReferenceExprBase {
  refKind: "external_document";
  externalDocumentId: string;
  field?: string;
}

export interface ChemdListValue extends ChemdValueBase {
  type: "list";
  items: ChemdValue[];
}

export interface ChemdRecordValue extends ChemdValueBase {
  type: "record";
  fields: ChemdRecordField[];
}

export interface ChemdRecordField extends SourceMappedNode {
  key: string;
  value: ChemdValue;
}

export interface ChemdCallExpr extends ChemdValueBase {
  type: "call";
  callee: string;
  args: ChemdCallArg[];
}

export interface ChemdCallArg extends SourceMappedNode {
  name: string;
  value: ChemdValue;
}

export interface ChemdPatchExpr extends ChemdValueBase {
  type: "patch";
  target: ChemdPatchTarget;
  value: ChemdValue;
}

export type ChemdPatchTarget =
  | ChemdMetaFieldPatchTarget
  | ChemdDeclarationPatchTarget
  | ChemdDeclarationFieldPatchTarget
  | ChemdDocCommentPatchTarget;

export interface ChemdMetaFieldPatchTarget {
  kind: "meta_field";
  field: string;
}

export interface ChemdDeclarationPatchTarget {
  kind: "declaration";
  declarationId: string;
}

export interface ChemdDeclarationFieldPatchTarget {
  kind: "declaration_field";
  declarationId: string;
  field: string;
}

export interface ChemdDocCommentPatchTarget {
  kind: "doc_comment";
  docId: string;
}
