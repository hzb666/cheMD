import type { CompileResult } from "@chemd/compiler";
import {
  buildProgramOutline,
  buildProgramSymbols
} from "./program-model";
import type {
  ChemdOutlineItem,
  ChemdSymbol
} from "./types";

export const buildOutline = (
  result: CompileResult,
  source: string
): ChemdOutlineItem[] => buildProgramOutline(result, source);

export const buildSymbols = (
  result: CompileResult,
  source: string
): ChemdSymbol[] => buildProgramSymbols(result, source);
