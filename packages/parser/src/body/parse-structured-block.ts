import type { ChemdNode, Diagnostic, StructuredNode } from "@chemd/core";

import { hasRegisteredBlockParser, parseRegisteredBlock } from "./block-parsers";

export const parseStructuredBlock = (
  blockType: string,
  headerArg: string | undefined,
  lines: string[],
  diagnostics: Diagnostic[],
  bodyChildren?: ChemdNode[]
): StructuredNode | undefined => {
  if (!hasRegisteredBlockParser(blockType)) {
    diagnostics.push({
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: `Unknown block type: ${blockType}`
    });
    return undefined;
  }

  return parseRegisteredBlock(blockType, {
    headerArg,
    lines,
    diagnostics,
    bodyChildren
  });
};
