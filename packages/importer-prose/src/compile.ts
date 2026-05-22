import { compileChemd } from "@chemd/compiler";
import type { CompileResult } from "@chemd/compiler";

import { importProse } from "./pipeline";
import { renderChemdDraft } from "./render-chemd";
import type {
  ProseImportCandidate,
  ProseImportOptions,
  RenderChemdDraftOptions
} from "./types";

export interface ProseToChemdResult {
  candidate: ProseImportCandidate;
  chemd: string;
  compileResult: CompileResult;
  valid: boolean;
}

const hasErrorDiagnostics = (compileResult: CompileResult): boolean =>
  compileResult.diagnostics.some((diagnostic) => diagnostic.severity === "error");

export const importProseToChemd = async (
  sourceText: string,
  options: ProseImportOptions & RenderChemdDraftOptions = {}
): Promise<ProseToChemdResult> => {
  const candidate = await importProse(sourceText, options);
  const chemd = renderChemdDraft(candidate, options);
  const compileResult = compileChemd(chemd);

  return {
    candidate,
    chemd,
    compileResult,
    valid: !hasErrorDiagnostics(compileResult)
  };
};
