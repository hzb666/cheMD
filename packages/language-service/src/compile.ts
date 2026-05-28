import {
  compileChemd,
  type CompileOptions,
  type CompileResult
} from "@chemd/compiler";
import { createFailedDiagnostic, mapCompilerDiagnostics } from "./diagnostics";
import { buildOutline, buildSymbols } from "./outline";
import { buildChemdSemanticTokens } from "./semantic-tokens";
import type {
  ChemdLanguageCompileInput,
  ChemdLanguageCompileOutput
} from "./types";

export interface ChemdLanguageServiceDependencies {
  compileChemd?: (source: string, options?: CompileOptions) => CompileResult;
  now?: () => Date;
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown compiler failure";

export const compileChemdForEditor = (
  input: ChemdLanguageCompileInput,
  dependencies: ChemdLanguageServiceDependencies = {}
): ChemdLanguageCompileOutput => {
  const compile = dependencies.compileChemd ?? compileChemd;
  const compiledAt = (dependencies.now ?? (() => new Date()))().toISOString();

  try {
    const result = compile(input.source, input.options);
    const symbols = buildSymbols(result, input.source);
    const diagnostics = mapCompilerDiagnostics(input.source, result.diagnostics)
      .map((diagnostic) => {
        const symbol = diagnostic.sourceNodeId
          ? symbols.find((item) => item.id === diagnostic.sourceNodeId)
          : undefined;
        return symbol ? { ...diagnostic, range: symbol.range } : diagnostic;
      });
    return {
      status: "ok",
      documentUri: input.documentUri,
      compiledAt,
      result,
      diagnostics,
      outline: buildOutline(result, input.source),
      semanticTokens: buildChemdSemanticTokens(input.source, symbols),
      symbols
    };
  } catch (error: unknown) {
    const message = readErrorMessage(error);
    return {
      status: "failed",
      documentUri: input.documentUri,
      compiledAt,
      diagnostics: [createFailedDiagnostic(message)],
      outline: [],
      semanticTokens: buildChemdSemanticTokens(input.source),
      symbols: [],
      error: {
        code: "LS_COMPILE_FAILED",
        message
      }
    };
  }
};

export const compileChemdLanguageService = compileChemdForEditor;
