import type { ResultNode } from "@chemd/core";

import { parseAllowedFields, parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const RESULT_FIELDS = new Set([
  "status",
  "yield",
  "conversion",
  "selectivity",
  "isolated_mass",
  "product_state",
  "purity",
  "notes",
  "ref",
  "reaction",
  "product"
]);

export const parseResultBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "result", RESULT_FIELDS, {
    listFields: new Set()
  });
  const fieldSpans = parseAllowedFieldSpans(lines, RESULT_FIELDS);

  return { type: "result", id, ...fields, fieldSpans } as ResultNode;
};
