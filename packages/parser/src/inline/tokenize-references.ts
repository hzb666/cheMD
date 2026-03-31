import {
  createReferenceToken,
  type ReferenceToken,
  type ReferenceKind
} from "@chemd/core";
import { REFERENCE_PATTERN } from "../shared/patterns";
import { ALIAS_NAMES } from "../shared/values";
import { getMatchSpan } from "../shared/source-location";

export const tokenizeReferences = (value: string): ReferenceToken[] => {
  const references: ReferenceToken[] = [];

  for (const match of value.matchAll(REFERENCE_PATTERN)) {
    const source = match[1];
    const field = match[2];
    let kind: ReferenceKind;

    if (source === "meta" && field) {
      kind = "meta";
    } else if (source === "param" && field) {
      kind = "param_field";
    } else if (field && ALIAS_NAMES.has(source)) {
      kind = "alias_field";
    } else if (field) {
      kind = "object_field";
    } else {
      kind = "object";
    }

    references.push(
      createReferenceToken({
        kind,
        raw: match[0],
        source,
        field,
        ...getMatchSpan(value, match)
      })
    );
  }

  return references;
};
