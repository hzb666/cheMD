import type { Diagnostic } from "@chemd/core";
import { createMarkdownLinkToken, type MarkdownLinkToken } from "@chemd/core/compat";

import { getSpanFromOffsets } from "../shared/source-location";
import { isSafeMarkdownHref } from "./markdown-link-policy";

interface MarkdownLinkCandidate {
  labelStart: number;
  hrefEnd: number;
  label: string;
  href: string;
}

const advanceFromLabelStart = (labelStart: number): number => labelStart + 1;

const readMarkdownLabel = (
  value: string,
  labelStart: number,
  labelEnd: number
): string | undefined => {
  if (labelEnd < 0 || labelEnd === labelStart + 1) {
    return undefined;
  }

  const label = value.slice(labelStart + 1, labelEnd);
  return label.includes("\n") || label.includes("\r") ? undefined : label;
};

// Markdown 链接允许 href 内嵌套括号；换行会结束当前候选，避免跨行吞掉后续正文。
const findHrefEnd = (value: string, openParenIndex: number): number | undefined => {
  let depth = 1;
  let hrefEnd = openParenIndex + 1;

  while (hrefEnd < value.length && depth > 0) {
    const char = value[hrefEnd];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "\n" || char === "\r") {
      return undefined;
    }
    hrefEnd += 1;
  }

  return depth === 0 ? hrefEnd : undefined;
};

const readMarkdownLinkCandidate = (
  value: string,
  labelStart: number
): MarkdownLinkCandidate | undefined => {
  const labelEnd = value.indexOf("]", labelStart + 1);
  const label = readMarkdownLabel(value, labelStart, labelEnd);
  if (!label) {
    return undefined;
  }

  const openParenIndex = labelEnd + 1;
  if (value[openParenIndex] !== "(") {
    return undefined;
  }

  const hrefEnd = findHrefEnd(value, openParenIndex);
  if (!hrefEnd) {
    return undefined;
  }

  const hrefRaw = value.slice(openParenIndex + 1, hrefEnd - 1);
  if (hrefRaw.length === 0) {
    return undefined;
  }

  return {
    labelStart,
    hrefEnd,
    label,
    href: hrefRaw.trim()
  };
};

export const tokenizeMarkdownLinks = (
  value: string,
  diagnostics: Diagnostic[]
): MarkdownLinkToken[] => {
  const tokens: MarkdownLinkToken[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const labelStart = value.indexOf("[", cursor);
    if (labelStart < 0) {
      break;
    }

    const candidate = readMarkdownLinkCandidate(value, labelStart);
    if (!candidate) {
      cursor = advanceFromLabelStart(labelStart);
      continue;
    }
    const { href, hrefEnd, label } = candidate;
    const safe = isSafeMarkdownHref(href);

    if (!safe) {
      diagnostics.push({
        code: "W_UNSAFE_LINK_HREF",
        severity: "error",
        message: `Unsafe markdown link href: ${href}`,
        sourceLayer: "parser"
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
