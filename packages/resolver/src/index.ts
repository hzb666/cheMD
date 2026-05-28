import type { ChemdProgramDocument, Diagnostic } from "@chemd/core";

import { resolveProgramDocs } from "./program-docs";
import { buildProgramSymbolTable } from "./program-index";
import { resolveProgramReferences } from "./program-references";

export { buildProgramSymbolTable } from "./program-index";
export type { ImportedModuleSymbols } from "./program-imports";
export type { ProgramSymbolTable } from "./program-index";

export const resolveChemd = (
  program: ChemdProgramDocument
): ChemdProgramDocument => {
  const diagnostics: Diagnostic[] = [...program.diagnostics];
  const symbols = buildProgramSymbolTable(program, diagnostics);
  const withReferences = resolveProgramReferences(program, symbols, diagnostics);
  const withDocs = resolveProgramDocs(withReferences, symbols, diagnostics);

  return {
    ...withDocs,
    diagnostics
  };
};
