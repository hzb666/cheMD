import { getAllowedBlockFieldSet, type BatchNode } from "@chemd/core";

import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStringListField,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const BATCH_FIELDS = getAllowedBlockFieldSet("batch");

export const parseBatchBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "batch", BATCH_FIELDS, {
    listFields: new Set(["artifacts", "chemistry_features"]),
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(lines, BATCH_FIELDS, "batch");
  const { chemistry_features: _chemistryFeatures, artifacts, ...rest } = fields;

  return {
    type: "batch",
    id,
    ...rest,
    artifacts: readStringListField(artifacts),
    chemistryFeatureRefs: readChemistryFeatureRefs(fields.chemistry_features, "batch"),
    fieldSpans
  } as BatchNode;
};
