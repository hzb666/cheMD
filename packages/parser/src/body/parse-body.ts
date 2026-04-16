import type {
  ChemdNode,
  Diagnostic
} from "@chemd/core";
import { parseChildren } from "./parse-children";

export const parseBody = (body: string): { children: ChemdNode[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const lines = body.split(/\r?\n/);
  const result = parseChildren(lines, diagnostics);

  return { children: result.children, diagnostics };
};
