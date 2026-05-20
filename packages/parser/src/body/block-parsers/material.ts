import { getAllowedBlockFieldSet, type MaterialNode } from "@chemd/core";

import {
  parseAllowedFields,
  parseAllowedFieldSpans,
  readChemistryFeatureRefs,
  readStructuredBlockId
} from "./common";
import type { BlockParser } from "./types";

const MATERIAL_FIELDS = getAllowedBlockFieldSet("material");

export const parseMaterialBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "material", MATERIAL_FIELDS, {
    listFields: new Set(["chemistry_features"]),
    sourceNodeId: id
  });
  const fieldSpans = parseAllowedFieldSpans(lines, MATERIAL_FIELDS, "material");
  const { chemistry_features: _chemistryFeatures, ...rest } = fields;

  return {
    type: "material",
    id,
    ...rest,
    chemistryFeatureRefs: readChemistryFeatureRefs(fields.chemistry_features, "material"),
    fieldSpans
  } as MaterialNode;
};
