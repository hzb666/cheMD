import type { MarkdownRenderNode } from "./markdown-render";
import {
  applyMarkdownInlineStylesInHtmlText,
  escapeHtml,
  sanitizeHref,
  stringifyValue
} from "./shared";

const applyInlineTokens = (escapedValue: string, node: MarkdownRenderNode): string => {
  let rendered = escapedValue;

  for (const reference of node.references) {
    if (reference.resolution?.status !== "resolved") {
      continue;
    }

    rendered = rendered.split(escapeHtml(reference.raw)).join(
      escapeHtml(stringifyValue(reference.resolution.value))
    );
  }

  for (const token of node.inlineChem) {
    rendered = rendered.split(escapeHtml(token.raw)).join(
      `<span class="chem-inline" data-chem="${escapeHtml(token.value)}">${escapeHtml(token.value)}</span>`
    );
  }

  return rendered;
};

const hasValidSpan = (value: string, raw: string, start?: number, end?: number): boolean => {
  if (typeof start !== "number" || typeof end !== "number") {
    return false;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return false;
  }

  if (start < 0 || end <= start || end > value.length) {
    return false;
  }

  return value.slice(start, end) === raw;
};

const applyUnpositionedInlineTokens = (escapedValue: string, node: MarkdownRenderNode): string => {
  let rendered = escapedValue;

  for (const reference of node.references) {
    if (typeof reference.start === "number" && typeof reference.end === "number") {
      continue;
    }

    if (reference.resolution?.status !== "resolved") {
      continue;
    }

    rendered = rendered.split(escapeHtml(reference.raw)).join(
      escapeHtml(stringifyValue(reference.resolution.value))
    );
  }

  for (const token of node.inlineChem) {
    if (typeof token.start === "number" && typeof token.end === "number") {
      continue;
    }

    rendered = rendered.split(escapeHtml(token.raw)).join(
      `<span class="chem-inline" data-chem="${escapeHtml(token.value)}">${escapeHtml(token.value)}</span>`
    );
  }

  return rendered;
};

const findClosingBracket = (value: string, start: number): number => {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === "]") return index;
  }
  return -1;
};

const findClosingParen = (value: string, start: number): number => {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\r" || char === "\n") return -1;
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
};

const findMarkdownLink = (
  value: string,
  start: number
): { index: number; end: number; label: string; rawHref: string } | undefined => {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] !== "[") continue;
    const labelEnd = findClosingBracket(value, index + 1);
    if (labelEnd <= index + 1 || value[labelEnd + 1] !== "(") continue;
    const hrefStart = labelEnd + 2;
    const hrefEnd = findClosingParen(value, hrefStart);
    if (hrefEnd < 0 || hrefEnd === hrefStart) continue;
    return {
      index,
      end: hrefEnd + 1,
      label: value.slice(index + 1, labelEnd),
      rawHref: value.slice(hrefStart, hrefEnd)
    };
  }
  return undefined;
};

const renderTextSegmentByRegex = (value: string, node: MarkdownRenderNode): string => {
  let rendered = "";
  let cursor = 0;

  while (cursor < value.length) {
    const link = findMarkdownLink(value, cursor);
    if (!link) break;
    const fullMatch = value.slice(link.index, link.end);

    rendered += applyMarkdownInlineStylesInHtmlText(
      applyInlineTokens(escapeHtml(value.slice(cursor, link.index)), node)
    );

    const safeHref = sanitizeHref(link.rawHref);

    if (!safeHref) {
      rendered += applyMarkdownInlineStylesInHtmlText(
        applyInlineTokens(escapeHtml(fullMatch), node)
      );
    } else {
      const labelHtml = applyMarkdownInlineStylesInHtmlText(
        applyInlineTokens(escapeHtml(link.label), node)
      );
      rendered += `<a class="chemd-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer noopener">${labelHtml}</a>`;
    }

    cursor = link.end;
  }

  rendered += applyMarkdownInlineStylesInHtmlText(
    applyInlineTokens(escapeHtml(value.slice(cursor)), node)
  );

  return rendered;
};

const renderInlineTextByRegex = (value: string, node: MarkdownRenderNode): string => {
  let rendered = "";
  let cursor = 0;

  while (cursor < value.length) {
    const open = value.indexOf("`", cursor);
    if (open < 0) break;
    const close = value.indexOf("`", open + 1);
    if (close < 0 || value.slice(open + 1, close).includes("\n") || value.slice(open + 1, close).includes("\r")) {
      break;
    }
    rendered += renderTextSegmentByRegex(value.slice(cursor, open), node);
    rendered += `<code class="chemd-inline-code">${escapeHtml(value.slice(open + 1, close))}</code>`;
    cursor = close + 1;
  }

  rendered += renderTextSegmentByRegex(value.slice(cursor), node);

  return rendered;
};

type TokenRangeKind = "code" | "link" | "chem" | "reference";

interface TokenRange {
  kind: TokenRangeKind;
  tokenIndex: number;
  start: number;
  end: number;
}

const appendTokenRanges = (
  ranges: TokenRange[],
  kind: TokenRangeKind,
  tokens: Array<{ raw: string; start?: number; end?: number }>,
  value: string
) => {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!hasValidSpan(value, token.raw, token.start, token.end)) {
      continue;
    }

    ranges.push({
      kind,
      tokenIndex: index,
      start: token.start as number,
      end: token.end as number
    });
  }
};

const reduceOverlappingRanges = (ranges: TokenRange[]): TokenRange[] => {
  const priority: Record<TokenRangeKind, number> = {
    code: 0,
    link: 1,
    chem: 2,
    reference: 3
  };
  const sorted = ranges.sort(
    (a, b) => a.start - b.start || priority[a.kind] - priority[b.kind] || b.end - a.end
  );
  const filtered: TokenRange[] = [];

  for (const range of sorted) {
    const previous = filtered[filtered.length - 1];

    if (!previous || range.start >= previous.end) {
      filtered.push(range);
      continue;
    }

    const previousPriority = priority[previous.kind];
    const currentPriority = priority[range.kind];

    // code/link token 优先级更高，避免重叠 span 被后续全局替换错位覆盖。
    if (
      currentPriority < previousPriority &&
      range.start <= previous.start &&
      range.end >= previous.end
    ) {
      filtered[filtered.length - 1] = range;
    }
  }

  return filtered;
};

const locateTokenRanges = (value: string, node: MarkdownRenderNode): TokenRange[] => {
  const ranges: TokenRange[] = [];
  appendTokenRanges(ranges, "code", node.inlineCode, value);
  appendTokenRanges(ranges, "link", node.links, value);
  appendTokenRanges(ranges, "chem", node.inlineChem, value);
  appendTokenRanges(ranges, "reference", node.references, value);
  return reduceOverlappingRanges(ranges);
};

const renderLinkRange = (range: TokenRange, value: string, node: MarkdownRenderNode): string => {
  const token = node.links[range.tokenIndex];
  const safeHref = token?.safe ? sanitizeHref(token.href) : undefined;

  if (!token || !safeHref) {
    return applyMarkdownInlineStylesInHtmlText(
      applyUnpositionedInlineTokens(
        escapeHtml(token?.raw ?? value.slice(range.start, range.end)),
        node
      )
    );
  }

  const labelHtml = applyMarkdownInlineStylesInHtmlText(
    applyUnpositionedInlineTokens(escapeHtml(token.label), node)
  );
  return `<a class="chemd-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer noopener">${labelHtml}</a>`;
};

const renderReferenceRange = (range: TokenRange, value: string, node: MarkdownRenderNode): string => {
  const reference = node.references[range.tokenIndex];

  if (reference?.resolution?.status === "resolved") {
    return escapeHtml(stringifyValue(reference.resolution.value));
  }

  return escapeHtml(reference?.raw ?? value.slice(range.start, range.end));
};

const renderRange = (range: TokenRange, value: string, node: MarkdownRenderNode): string => {
  if (range.kind === "code") {
    const token = node.inlineCode[range.tokenIndex];
    return `<code class="chemd-inline-code">${escapeHtml(token?.value ?? "")}</code>`;
  }

  if (range.kind === "link") {
    return renderLinkRange(range, value, node);
  }

  if (range.kind === "chem") {
    const token = node.inlineChem[range.tokenIndex];
    return `<span class="chem-inline" data-chem="${escapeHtml(token?.value ?? "")}">${escapeHtml(token?.value ?? "")}</span>`;
  }

  return renderReferenceRange(range, value, node);
};

const renderInlineTextWithRanges = (value: string, node: MarkdownRenderNode): string => {
  const ranges = locateTokenRanges(value, node);

  if (ranges.length === 0) {
    return renderInlineTextByRegex(value, node);
  }

  let rendered = "";
  let cursor = 0;

  for (const range of ranges) {
    rendered += applyMarkdownInlineStylesInHtmlText(
      applyUnpositionedInlineTokens(escapeHtml(value.slice(cursor, range.start)), node)
    );
    rendered += renderRange(range, value, node);
    cursor = range.end;
  }

  rendered += applyMarkdownInlineStylesInHtmlText(
    applyUnpositionedInlineTokens(escapeHtml(value.slice(cursor)), node)
  );

  return rendered;
};

export const renderInlineText = (value: string, node: MarkdownRenderNode): string => {
  const hasPositionedToken =
    node.references.some((token) => typeof token.start === "number" && typeof token.end === "number")
    || node.inlineChem.some((token) => typeof token.start === "number" && typeof token.end === "number")
    || node.inlineCode.some((token) => typeof token.start === "number" && typeof token.end === "number")
    || node.links.some((token) => typeof token.start === "number" && typeof token.end === "number");

  if (hasPositionedToken) {
    return renderInlineTextWithRanges(value, node);
  }

  return renderInlineTextByRegex(value, node);
};
