import type {
  ChemdNode,
  Diagnostic
} from "@chemd/core";
import { parseChildren } from "./parse-children";
import type { ParserOptions } from "./block-parsers/types";

export const parseBody = (
  body: string,
  options: ParserOptions = {}
): { children: ChemdNode[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const lines = body.split(/\r?\n/);
  const result = parseChildren(lines, diagnostics, 0, false, options);

  return { children: result.children, diagnostics };
};
