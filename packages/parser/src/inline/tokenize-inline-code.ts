import { createInlineCodeToken, type InlineCodeToken } from "@chemd/core";
import { INLINE_CODE_VALUE_PATTERN } from "../shared/patterns";
import { getMatchSpan } from "../shared/source-location";

export const tokenizeInlineCode = (value: string): InlineCodeToken[] => {
  const tokens: InlineCodeToken[] = [];

  for (const match of value.matchAll(INLINE_CODE_VALUE_PATTERN)) {
    tokens.push(
      createInlineCodeToken({
        raw: match[0],
        value: match[1],
        ...getMatchSpan(value, match)
      })
    );
  }

  return tokens;
};
