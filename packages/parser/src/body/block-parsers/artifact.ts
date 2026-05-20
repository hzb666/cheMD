import { getAllowedBlockFieldSet, type ArtifactNode } from "@chemd/core";

import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const ARTIFACT_FIELDS = getAllowedBlockFieldSet("artifact");

export const parseArtifactBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "artifact", ARTIFACT_FIELDS, {
    listFields: new Set(["chemistry_features"]),
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(lines, ARTIFACT_FIELDS, "artifact");
  const { chemistry_features: _chemistryFeatures, ...rest } = fields;

  return {
    type: "artifact",
    id,
    ...rest,
    chemistryFeatureRefs: readChemistryFeatureRefs(fields.chemistry_features, "artifact"),
    fieldSpans
  } as ArtifactNode;
};
