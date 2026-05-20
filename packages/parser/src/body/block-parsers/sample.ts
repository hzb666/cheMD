import { getAllowedBlockFieldSet, type SampleNode } from "@chemd/core";

import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStringListField,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const SAMPLE_FIELDS = getAllowedBlockFieldSet("sample");

export const parseSampleBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "sample", SAMPLE_FIELDS, {
    listFields: new Set(["artifacts", "chemistry_features"]),
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(lines, SAMPLE_FIELDS, "sample");
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
