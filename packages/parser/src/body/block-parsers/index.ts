import type { ColNode, StructuredNode, UseNode } from "@chemd/core";

import { parseKeyValueLines } from "../parse-body-shared";
import { parseAnalysisBlock } from "./analysis";
import { parseArtifactBlock } from "./artifact";
import { parseChemdBlock } from "./chemd";
import { parseConditionVariesBlock } from "./condition-varies";
import { readStructuredBlockId } from "./common";
import { parseObservationBlock } from "./observation";
import { parseProcedureBlock } from "./procedure";
import { parseResultBlock } from "./result";
import { parseSampleBlock } from "./sample";
import type { BlockParser, BlockParserContext } from "./types";

const parseUseBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const fields = parseKeyValueLines(lines, diagnostics, { allowField: () => true });

  return {
    type: "use",
    template: headerArg?.trim() ?? "",
    values: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(" | ") : value])
    )
  } as UseNode;
};

const parseColColumns = (headerArg: string | undefined, diagnostics: BlockParserContext["diagnostics"]): number => {
  const trimmed = headerArg?.trim() ?? "";
  const matched = trimmed.match(/^(\d+)$/);
  const columns = matched ? Number.parseInt(matched[1], 10) : Number.NaN;

  if (!Number.isFinite(columns) || columns < 1) {
    diagnostics.push({
      code: "W_INVALID_COL_COLUMNS",
      severity: "warning",
      message: `Invalid column count on col block: ${trimmed || "(empty)"}, fallback to 1`
    });
    return 1;
  }

  return columns;
};

const parseColBlock: BlockParser = ({ headerArg, diagnostics, bodyChildren }) => {
  const columns = parseColColumns(headerArg, diagnostics);
  const children = bodyChildren ?? [];

  if (children.length !== columns) {
    diagnostics.push({
      code: "W_COL_COUNT_MISMATCH",
      severity: "warning",
      message: `Invalid col child count: expected ${columns}, got ${children.length}`
    });
  }

  return {
    type: "col",
    columns,
    children
  } as ColNode;
};

const PARSERS = new Map<string, BlockParser>([
  ["chemd", parseChemdBlock],
  ["result", parseResultBlock],
  ["analysis", parseAnalysisBlock],
  ["artifact", parseArtifactBlock],
  ["sample", parseSampleBlock],
  ["condition-varies", parseConditionVariesBlock],
  ["procedure", parseProcedureBlock],
  ["observation", parseObservationBlock],
  ["use", parseUseBlock],
  ["col", parseColBlock]
]);

export const hasRegisteredBlockParser = (blockType: string): boolean => PARSERS.has(blockType);

export const parseRegisteredBlock = (
  blockType: string,
  context: BlockParserContext
): StructuredNode | undefined => PARSERS.get(blockType)?.(context);

export { readStructuredBlockId };
