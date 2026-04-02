import { createMarkdownLinkToken, type Diagnostic, type MarkdownLinkToken } from "@chemd/core";

import { getSpanFromOffsets } from "../shared/source-location";
import { isSafeMarkdownHref } from "./markdown-link-policy";

export const tokenizeMarkdownLinks = (
  value: string,
  diagnostics: Diagnostic[]
): MarkdownLinkToken[] => {
  const tokens: MarkdownLinkToken[] = [];
  let cursor = 0;
  const advanceFromLabelStart = (labelStart: number): number => labelStart + 1;

  while (cursor < value.length) {
    const labelStart = value.indexOf("[", cursor);
    if (labelStart < 0) {
      break;
    }

    const labelEnd = value.indexOf("]", labelStart + 1);
    if (labelEnd < 0 || labelEnd === labelStart + 1) {
      cursor = advanceFromLabelStart(labelStart);
      continue;
    }
    const label = value.slice(labelStart + 1, labelEnd);
    if (label.includes("\n") || label.includes("\r")) {
      cursor = advanceFromLabelStart(labelStart);
      continue;
    }

    const openParenIndex = labelEnd + 1;
    if (value[openParenIndex] !== "(") {
      cursor = advanceFromLabelStart(labelStart);
      continue;
    }

    let depth = 1;
    let hrefEnd = openParenIndex + 1;
    while (hrefEnd < value.length && depth > 0) {
      const char = value[hrefEnd];
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      } else if (char === "\n" || char === "\r") {
        depth = -1;
        break;
      }
      hrefEnd += 1;
    }

    if (depth !== 0) {
      cursor = labelStart + 1;
      continue;
    }

    const hrefRaw = value.slice(openParenIndex + 1, hrefEnd - 1);
    if (hrefRaw.length === 0) {
      cursor = advanceFromLabelStart(labelStart);
      continue;
    }
    const href = hrefRaw.trim();
    const safe = isSafeMarkdownHref(href);

    if (!safe) {
      diagnostics.push({
        code: "W_UNSAFE_LINK_HREF",
        severity: "warning",
        message: `Unsafe markdown link href: ${href}`
      });
    }

    const raw = value.slice(labelStart, hrefEnd);
    tokens.push(
      createMarkdownLinkToken({
        raw,
        label,
        href,
        safe,
        ...getSpanFromOffsets(value, labelStart, hrefEnd)
      })
    );

    cursor = hrefEnd;
  }

  return tokens;
};
