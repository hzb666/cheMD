import { createInlineChemToken, type InlineChemToken } from "@chemd/core";
import { INLINE_CHEM_VALUE_PATTERN } from "../shared/patterns";
import { getMatchSpan } from "../shared/source-location";

export const tokenizeInlineChem = (value: string): InlineChemToken[] => {
  const tokens: InlineChemToken[] = [];

  for (const match of value.matchAll(INLINE_CHEM_VALUE_PATTERN)) {
    tokens.push(
      createInlineChemToken({
        raw: match[0],
        value: match[1],
        ...getMatchSpan(value, match)
      })
    );
  }

  return tokens;
};
