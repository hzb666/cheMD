import type { Diagnostic } from "../diagnostics";
import type { RenderSelection, SourceMappedNode } from "../ast";
import type {
  ChemdDeclaration,
  ChemdImportDeclaration,
  ChemdMetaDeclaration,
  ChemdModuleDeclaration
} from "./declarations";
import type { ChemdDocComment } from "./docs";

export type ChemdProgramAstSchemaVersion = "chemd-program-ast/v1";

export type ChemdProgramSourceLanguage = "chemd/program-v1";

export interface ChemdProgramDocument extends SourceMappedNode {
  type: "program_document";
  schemaVersion: ChemdProgramAstSchemaVersion;
  sourceLanguage: ChemdProgramSourceLanguage;
  module: ChemdModuleDeclaration;
  meta: ChemdMetaDeclaration;
  imports: ChemdImportDeclaration[];
  declarations: ChemdDeclaration[];
  docs: ChemdDocComment[];
  diagnostics: Diagnostic[];
  source?: string;
  renderSelection?: RenderSelection;
}
