import type { ObservationNode } from "@chemd/core";

import { createBodyText, parseAllowedFields, readStructuredBlockId, splitLeadingFieldLines } from "./common";
import type { BlockParser } from "./types";

const OBSERVATION_FIELDS = new Set(["ref"]);

export const parseObservationBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const { fieldLines, bodyLines } = splitLeadingFieldLines(lines, OBSERVATION_FIELDS);
  const fields = parseAllowedFields(fieldLines, diagnostics, "observation", OBSERVATION_FIELDS, {
    listFields: new Set()
  });

  return {
    type: "observation",
    id,
    ref: typeof fields.ref === "string" ? fields.ref : undefined,
    body: createBodyText(bodyLines)
  } as ObservationNode;
};
