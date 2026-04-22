import type { SampleNode } from "@chemd/core";

import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStringListField,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const SAMPLE_FIELDS = new Set([
  "name",
  "sample_id",
  "batch",
  "purity",
  "supplier",
  "notes",
  "ref",
  "derived_from",
  "aliquot_of",
  "batch_of",
  "artifacts",
  "chemistry_features"
]);

export const parseSampleBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "sample", SAMPLE_FIELDS, {
    listFields: new Set(["artifacts", "chemistry_features"])
  });
  const fieldSpans = parseAllowedFieldSpans(lines, SAMPLE_FIELDS);
  const { chemistry_features: _chemistryFeatures, artifacts, ...rest } = fields;

  return {
    type: "sample",
    id,
    ...rest,
    artifacts: readStringListField(artifacts),
    chemistryFeatureRefs: readChemistryFeatureRefs(fields.chemistry_features, "sample"),
    fieldSpans
  } as SampleNode;
};
