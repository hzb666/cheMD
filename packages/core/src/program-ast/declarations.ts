import type { SourceMappedNode } from "../ast";
import type { AgentRunDeclaration } from "./agent";
import type { ChemdDocCommentRef } from "./docs";
import type { ProcedureDeclaration } from "./procedure";
import type { ChemdReferenceExpr, ChemdValue } from "./values";

export type ChemdProgramDeclarationKind =
  | "molecule"
  | "material"
  | "batch"
  | "reaction"
  | "result"
  | "analysis"
  | "sample"
  | "artifact"
  | "condition_screen"
  | "procedure"
  | "observation"
  | "trace"
  | "agent_run";

export type ChemdDeclaration =
  | MoleculeDeclaration
  | MaterialDeclaration
  | BatchDeclaration
  | ReactionDeclaration
  | ResultDeclaration
  | AnalysisDeclaration
  | SampleDeclaration
  | ArtifactDeclaration
  | ConditionScreenDeclaration
  | ProcedureDeclaration
  | ObservationDeclaration
  | TraceDeclaration
  | AgentRunDeclaration;

export interface ChemdDeclarationBase extends SourceMappedNode {
  kind: ChemdProgramDeclarationKind;
  id: string;
  qualifiedId: string;
  docs: ChemdDocCommentRef[];
  annotations?: ChemdAnnotation[];
}

export interface ChemdAnnotation extends SourceMappedNode {
  name: string;
  args?: Record<string, ChemdValue>;
}

export interface ChemdFieldDeclarationBase extends ChemdDeclarationBase {
  fields: Record<string, ChemdValue>;
}

export interface MoleculeDeclaration extends ChemdFieldDeclarationBase {
  kind: "molecule";
}

export interface MaterialDeclaration extends ChemdFieldDeclarationBase {
  kind: "material";
}

export interface BatchDeclaration extends ChemdFieldDeclarationBase {
  kind: "batch";
}

export interface ReactionDeclaration extends ChemdFieldDeclarationBase {
  kind: "reaction";
}

export interface ResultDeclaration extends ChemdFieldDeclarationBase {
  kind: "result";
  target?: ChemdReferenceExpr;
}

export interface AnalysisDeclaration extends ChemdFieldDeclarationBase {
  kind: "analysis";
  target?: ChemdReferenceExpr;
}

export interface SampleDeclaration extends ChemdFieldDeclarationBase {
  kind: "sample";
}

export interface ArtifactDeclaration extends ChemdFieldDeclarationBase {
  kind: "artifact";
}

export interface ConditionScreenDeclaration extends ChemdFieldDeclarationBase {
  kind: "condition_screen";
  target?: ChemdReferenceExpr;
}

export interface ObservationDeclaration extends ChemdFieldDeclarationBase {
  kind: "observation";
  target?: ChemdReferenceExpr;
}

export interface TraceDeclaration extends ChemdFieldDeclarationBase {
  kind: "trace";
  target?: ChemdReferenceExpr;
}

export interface ChemdModuleDeclaration extends SourceMappedNode {
  kind: "module";
  name: string;
  docs: ChemdDocCommentRef[];
}

export interface ChemdImportDeclaration extends SourceMappedNode {
  kind: "import";
  moduleName: string;
  from: string;
  alias?: string;
  docs: ChemdDocCommentRef[];
}

export interface ChemdMetaDeclaration extends SourceMappedNode {
  kind: "meta";
  id: string;
  title: string;
  date: string;
  fields: Record<string, ChemdValue>;
  primary?: ChemdMetaPrimaryReferences;
  docs: ChemdDocCommentRef[];
}

export interface ChemdMetaPrimaryReferences {
  molecule?: ChemdReferenceExpr;
  reaction?: ChemdReferenceExpr;
  result?: ChemdReferenceExpr;
  analysis?: ChemdReferenceExpr;
  sample?: ChemdReferenceExpr;
}
