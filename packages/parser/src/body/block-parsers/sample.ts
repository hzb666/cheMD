import type { SampleNode } from "@chemd/core";

import { parseAllowedFields, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const SAMPLE_FIELDS = new Set(["name", "sample_id", "batch", "purity", "supplier", "notes", "ref"]);

export const parseSampleBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "sample", SAMPLE_FIELDS);

  return { type: "sample", id, ...fields } as SampleNode;
};
