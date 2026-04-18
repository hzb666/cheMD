import type { ChemdNode, Diagnostic, StructuredNode } from "@chemd/core";

import { hasRegisteredBlockParser, parseRegisteredBlock } from "./block-parsers";
import type { ParserOptions } from "./block-parsers/types";

const LEGACY_SURFACE_BLOCKS = new Set(["molecule", "reaction"]);

interface ParseStructuredBlockInput {
  blockType: string;
  headerArg: string | undefined;
  lines: string[];
  diagnostics: Diagnostic[];
  bodyChildren?: ChemdNode[];
  options?: ParserOptions;
}

const readLegacyBlockId = (headerArg: string | undefined): string | undefined => {
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
  const sourceNodeId = readLegacyBlockId(headerArg);

  if (!LEGACY_SURFACE_BLOCKS.has(blockType)) {
    return {
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: `Unknown block type: ${blockType}`
    };
  }

  return {
    code: "W_UNKNOWN_BLOCK",
    severity: "warning",
    message: `Unknown block type: ${blockType}`,
    sourceLayer: "parser",
    sourceNodeType: blockType,
    sourceNodeId,
    facts: { legacy_block_kind: blockType },
    quickFixes: [{
      title: "Convert this legacy block to canonical chemd syntax",
      kind: "convert_legacy_block",
      patch: {
        source_node_type: blockType,
        source_node_id: sourceNodeId,
        kind: blockType
      }
    }]
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
