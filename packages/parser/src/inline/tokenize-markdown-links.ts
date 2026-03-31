import { createMarkdownLinkToken, type Diagnostic, type MarkdownLinkToken } from "@chemd/core";
import { MARKDOWN_LINK_PATTERN } from "../shared/patterns";
import { getMatchSpan } from "../shared/source-location";
import { isSafeMarkdownHref } from "./markdown-link-policy";

export const tokenizeMarkdownLinks = (value: string, diagnostics: Diagnostic[]): MarkdownLinkToken[] => {
  const tokens: MarkdownLinkToken[] = [];

  for (const match of value.matchAll(MARKDOWN_LINK_PATTERN)) {
    const href = match[2].trim();
    const safe = isSafeMarkdownHref(href);

    if (!safe) {
      diagnostics.push({
        code: "W_UNSAFE_LINK_HREF",
        severity: "warning",
        message: `Unsafe markdown link href: ${href}`
      });
    }

    tokens.push(
      createMarkdownLinkToken({
        raw: match[0],
        label: match[1],
        href,
        safe,
        ...getMatchSpan(value, match)
      })
    );
  }

  return tokens;
};
