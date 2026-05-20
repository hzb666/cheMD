import { getAllowedBlockFieldSet, type ResultNode } from "@chemd/core";

import { parseAllowedFields, parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const RESULT_FIELDS = getAllowedBlockFieldSet("result");

export const parseResultBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "result", RESULT_FIELDS, {
    listFields: new Set(),
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(lines, RESULT_FIELDS, "result");

  return { type: "result", id, ...fields, fieldSpans } as ResultNode;
};
