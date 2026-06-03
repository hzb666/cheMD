import { createInlineCodeToken, type InlineCodeToken } from "@chemd/core/compat";

import { getMatchSpan } from "../shared/source-location";

const INLINE_CODE_VALUE_PATTERN = /`([^`\r\n]+)`/g;

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
