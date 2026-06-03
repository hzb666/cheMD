import {
  parseChemdProgram,
  type ParseChemdProgramOptions
} from "./program";

export type ParseChemdOptions = ParseChemdProgramOptions;

export const parseChemd = (
  source: string,
  options: ParseChemdOptions = {}
) => parseChemdProgram(source, options);

export {
  parseChemdProgram,
  ProgramParserCursor,
  type ParseChemdProgramOptions
} from "./program";
export {
  CHEMD_LANGUAGE_CONTRACT,
  type ChemdLanguageContract
} from "@chemd/core";
