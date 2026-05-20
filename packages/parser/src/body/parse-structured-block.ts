import type { ChemdNode, Diagnostic, StructuredNode } from "@chemd/core";

import { hasRegisteredBlockParser, parseRegisteredBlock } from "./block-parsers";
import type { ParserOptions } from "./block-parsers/types";

interface ParseStructuredBlockInput {
  blockType: string;
  headerArg: string | undefined;
  lines: string[];
  diagnostics: Diagnostic[];
  bodyChildren?: ChemdNode[];
  options?: ParserOptions;
}

const readBlockId = (headerArg: string | undefined): string | undefined => {
  const trimmed = headerArg?.trim() ?? "";
  if (!trimmed.startsWith("#")) {
    return undefined;
  }

  return trimmed.slice(1).split(/\s+/, 1)[0] || undefined;
};

const createUnknownBlockDiagnostic = (
  blockType: string,
  headerArg: string | undefined
): Diagnostic => {
  return {
    code: "W_UNKNOWN_BLOCK",
    severity: "error",
    message: `Unknown block type: ${blockType}`,
    sourceLayer: "parser",
    sourceNodeType: blockType,
    sourceNodeId: readBlockId(headerArg)
  };
};

export const parseStructuredBlock = ({
  blockType,
  headerArg,
  lines,
  diagnostics,
  bodyChildren,
  options
}: ParseStructuredBlockInput): StructuredNode | undefined => {
  if (!hasRegisteredBlockParser(blockType)) {
    diagnostics.push(createUnknownBlockDiagnostic(blockType, headerArg));
    return undefined;
  }

  return parseRegisteredBlock(blockType, {
    headerArg,
    lines,
    diagnostics,
    bodyChildren,
    options
  });
};
