import type { AnalysisNode } from "@chemd/core";

import { parseAllowedFields, parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const ANALYSIS_FIELDS = new Set([
  "type",
  "ref",
  "time",
  "eluent",
  "plate",
  "visualization",
  "result",
  "instrument",
  "solvent",
  "frequency",
  "method",
  "data",
  "notes"
]);

const LANE_FIELD_PATTERN = /^p\d+$/;

const applyTlcDefaults = (node: AnalysisNode): AnalysisNode => {
  if (node.type_name?.toLowerCase() !== "tlc") {
    return node;
  }

  return {
    ...node,
    plate: node.plate ?? "silica gel GF254",
    visualization: node.visualization ?? "UV 254 nm"
  };
};

export const parseAnalysisBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "analysis", ANALYSIS_FIELDS, {
    allowExtraField: (key) => LANE_FIELD_PATTERN.test(key),
    listFields: new Set()
  });
  const fieldSpans = parseAllowedFieldSpans(lines, ANALYSIS_FIELDS, {
    allowExtraField: (key) => LANE_FIELD_PATTERN.test(key)
  });
  const { type: analysisType, ...rest } = fields;

  return applyTlcDefaults({
    type: "analysis",
    id,
    fieldSpans,
    type_name: typeof analysisType === "string" ? analysisType : undefined,
    ...rest
  } as AnalysisNode);
};
