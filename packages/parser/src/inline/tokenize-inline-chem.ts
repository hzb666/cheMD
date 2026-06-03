import { createInlineChemToken, type InlineChemToken } from "@chemd/core/compat";

import { getSpanFromOffsets } from "../shared/source-location";

export const tokenizeInlineChem = (value: string): InlineChemToken[] => {
  const tokens: InlineChemToken[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const markerStart = value.indexOf(":chem[", cursor);
    if (markerStart < 0) {
      break;
    }

    const valueStart = markerStart + 6;
    const valueEnd = value.indexOf("]", valueStart);

    if (valueEnd < 0) {
      break;
    }

    const innerValue = value.slice(valueStart, valueEnd);
    if (innerValue.length === 0 || innerValue.includes("\n") || innerValue.includes("\r")) {
      cursor = valueEnd + 1;
      continue;
    }

    const raw = value.slice(markerStart, valueEnd + 1);
    tokens.push(
      createInlineChemToken({
        raw,
        value: innerValue,
        ...getSpanFromOffsets(value, markerStart, valueEnd + 1)
      })
    );

    cursor = valueEnd + 1;
  }

  return tokens;
};
