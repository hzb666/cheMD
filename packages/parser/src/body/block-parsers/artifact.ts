import type { ArtifactNode } from "@chemd/core";

import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const ARTIFACT_FIELDS = new Set([
  "kind",
  "ref",
  "path",
  "checksum",
  "instrument",
  "notes",
  "chemistry_features"
]);

export const parseArtifactBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "artifact", ARTIFACT_FIELDS, {
    listFields: new Set(["chemistry_features"])
  });
  const fieldSpans = parseAllowedFieldSpans(lines, ARTIFACT_FIELDS);
  const { chemistry_features: _chemistryFeatures, ...rest } = fields;

  return {
    type: "artifact",
    id,
    ...rest,
    chemistryFeatureRefs: readChemistryFeatureRefs(fields.chemistry_features, "artifact"),
    fieldSpans
  } as ArtifactNode;
};
