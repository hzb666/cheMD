import type { ProcedureNode } from "@chemd/core";

import { createBodyText, parseAllowedFields, readStructuredBlockId, splitLeadingFieldLines } from "./common";
import type { BlockParser } from "./types";

const PROCEDURE_FIELDS = new Set(["ref"]);

export const parseProcedureBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const { fieldLines, bodyLines } = splitLeadingFieldLines(lines, PROCEDURE_FIELDS);
  const fields = parseAllowedFields(fieldLines, diagnostics, "procedure", PROCEDURE_FIELDS, {
    listFields: new Set()
  });

  return {
    type: "procedure",
    id,
    ref: typeof fields.ref === "string" ? fields.ref : undefined,
    body: createBodyText(bodyLines)
  } as ProcedureNode;
};
