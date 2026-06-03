import type { ChemdValue, Diagnostic } from "@chemd/core";

import { lexProgram } from "./lexer";
import { ProgramValueParser } from "./parse-value-parser";
import type { ProgramToken } from "./tokens";

export interface ProgramValueParseResult {
  value?: ChemdValue;
  diagnostics: Diagnostic[];
  tokens: ProgramToken[];
}

export interface ProgramReferenceParseOptions {
  moduleNames?: ReadonlySet<string> | readonly string[];
}

export interface ProgramValueParseOptions {
  references?: ProgramReferenceParseOptions;
}

export const parseProgramValue = (
  source: string,
  options: ProgramValueParseOptions = {}
): ProgramValueParseResult => {
  const lexed = lexProgram(source);
  const tokens = lexed.tokens.filter((token) => token.type !== "comment");
  const parser = new ProgramValueParser(source, tokens, lexed.diagnostics, options);
  const value = parser.parseValue();
  parser.diagnoseTrailingTokens();

  return {
    value,
    diagnostics: parser.diagnostics,
    tokens: lexed.tokens
  };
};
