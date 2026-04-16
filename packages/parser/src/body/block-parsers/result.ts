import type { ResultNode } from "@chemd/core";

import { parseAllowedFields, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const RESULT_FIELDS = new Set([
  "status",
  "yield",
  "conversion",
  "selectivity",
  "isolated_mass",
  "product_state",
  "purity",
  "notes"
]);

export const parseResultBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "result", RESULT_FIELDS);

  return { type: "result", id, ...fields } as ResultNode;
};
