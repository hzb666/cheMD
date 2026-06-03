import type {
  ChemdDeclaration,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  Diagnostic
} from "@chemd/core";

import {
  buildImportSymbolMap,
  type ImportedModuleSymbols
} from "./program-imports";

export interface ProgramSymbolTable {
  moduleName: string;
  declarationsById: Map<string, ChemdDeclaration>;
  declarationsByQualifiedId: Map<string, ChemdDeclaration>;
  primaryAliases: Map<string, string>;
  imports: Map<string, ImportedModuleSymbols>;
}

export const buildProgramSymbolTable = (
  program: ChemdProgramDocument,
  diagnostics: Diagnostic[]
): ProgramSymbolTable => {
  const table: ProgramSymbolTable = {
    moduleName: program.module.name,
    declarationsById: new Map(),
    declarationsByQualifiedId: new Map(),
    primaryAliases: new Map(),
    imports: buildImportSymbolMap(program.imports, diagnostics)
  };

  for (const declaration of program.declarations) {
    addDeclaration(declaration, table, diagnostics);
  }
  addPrimaryAliases(program.meta.primary, table);

  return table;
};

const addDeclaration = (
  declaration: ChemdDeclaration,
  table: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): void => {
  if (table.declarationsById.has(declaration.id)) {
    diagnostics.push({
      code: "E_DUPLICATE_DECLARATION",
      severity: "error",
      message: `Duplicate declaration id: ${declaration.id}`,
      nodeId: declaration.id,
      sourceLayer: "resolver",
      sourceNodeType: declaration.kind,
      sourceNodeId: declaration.id,
      sourceSpan: declaration.sourceSpan
    });
    return;
  }

  table.declarationsById.set(declaration.id, declaration);
  if (table.declarationsByQualifiedId.has(declaration.qualifiedId)) {
    diagnostics.push({
      code: "E_DUPLICATE_QUALIFIED_DECLARATION",
      severity: "error",
      message: `Duplicate qualified declaration id: ${declaration.qualifiedId}`,
      nodeId: declaration.id,
      sourceLayer: "resolver",
      sourceNodeType: declaration.kind,
      sourceNodeId: declaration.id,
      sourceSpan: declaration.sourceSpan
    });
    return;
  }
  table.declarationsByQualifiedId.set(declaration.qualifiedId, declaration);
};

const addPrimaryAliases = (
  primary: ChemdProgramDocument["meta"]["primary"],
  table: ProgramSymbolTable
): void => {
  if (!primary) {
    return;
  }
  for (const [kind, reference] of Object.entries(primary)) {
    if (!isLocalReference(reference)) {
      continue;
    }
    table.primaryAliases.set(kind, reference.target);
    table.primaryAliases.set(`primary_${kind}`, reference.target);
  }
};

const isLocalReference = (
  value: unknown
): value is ChemdReferenceExpr & { refKind: "local" } =>
  typeof value === "object" &&
  value !== null &&
  (value as ChemdReferenceExpr).type === "reference" &&
  (value as ChemdReferenceExpr).refKind === "local";
