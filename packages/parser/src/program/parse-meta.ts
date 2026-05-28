import type {
  ChemdMetaDeclaration,
  ChemdMetaPrimaryReferences,
  ChemdReferenceExpr,
  ChemdValue
} from "@chemd/core";

import type { ProgramParserContext, ProgramParserCursor } from "./parser";
import { parseFieldBlock, valueAsString } from "./parse-declarations";

const PRIMARY_FIELD_TARGETS: Record<string, keyof ChemdMetaPrimaryReferences> = {
  primary_molecule: "molecule",
  primary_reaction: "reaction",
  primary_result: "result",
  primary_analysis: "analysis",
  primary_sample: "sample"
};

export const parseMetaDeclaration = (
  cursor: ProgramParserCursor,
  context: ProgramParserContext
): ChemdMetaDeclaration => {
  const docs = cursor.collectDocs();
  const start = cursor.expectValue("meta", "E_PROGRAM_META_EXPECTED");
  const parsed = parseFieldBlock(cursor);
  const primary = collectPrimaryReferences(parsed.fields);

  return {
    kind: "meta",
    id: valueAsString(parsed.fields.id),
    title: valueAsString(parsed.fields.title),
    date: valueAsString(parsed.fields.date),
    fields: parsed.fields,
    ...(Object.keys(primary).length > 0 ? { primary } : {}),
    docs: context.addDocs(docs, { kind: "file" }),
    sourceSpan: cursor.sourceSpanFrom(start, parsed.endToken),
    fieldSpans: parsed.fieldSpans
  };
};

const collectPrimaryReferences = (
  fields: Record<string, ChemdValue>
): ChemdMetaPrimaryReferences => {
  const primary: ChemdMetaPrimaryReferences = {};
  for (const [fieldName, targetName] of Object.entries(PRIMARY_FIELD_TARGETS)) {
    const value = fields[fieldName];
    if (value?.type === "reference") {
      primary[targetName] = value as ChemdReferenceExpr;
    }
  }
  return primary;
};
