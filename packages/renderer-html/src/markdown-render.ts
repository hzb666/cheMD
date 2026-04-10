import type { MarkdownNode } from "@chemd/core";
import { renderInlineText } from "./inline-render";
import { escapeHtml, normalizeWhitespace } from "./shared";

const MARKDOWN_HR_PATTERN = /^([-*_])(?:\s*\1){2,}\s*$/;

const getMarkdownIndentLevel = (indent: string): number => {
  let width = 0;

  for (const char of indent) {
    width += char === "\t" ? 2 : 1;
  }

  return Math.floor(width / 2);
};

interface MarkdownTaskItem {
  checked: boolean;
  text: string;
}

interface MarkdownTableAlignment {
  horizontal?: "left" | "center" | "right";
}

interface MarkdownListEntry {
  type: "ul" | "ol";
  depth: number;
  content: string;
  order?: number;
  task?: MarkdownTaskItem;
}

export interface RenderMarkdownNodeOptions {
  suppressLeadingHeadingText?: string;
}

const parseMarkdownTaskItem = (content: string): MarkdownTaskItem | undefined => {
  const taskMatch = content.match(/^\[( |x|X)\]\s+(.+)$/);

  if (!taskMatch) {
    return undefined;
  }

  return {
    checked: taskMatch[1].toLowerCase() === "x",
    text: taskMatch[2]
  };
};

const splitMarkdownTableCells = (line: string): string[] => {
  const trimmed = line.trim();
  const body = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return body.split("|").map((cell) => cell.trim());
};

const isMarkdownTableSeparatorLine = (line: string): boolean => {
  const cells = splitMarkdownTableCells(line);

  if (cells.length === 0) {
    return false;
  }

  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
};

const isMarkdownTableHeaderCandidate = (line: string): boolean => {
  if (!line.includes("|")) {
    return false;
  }

  const cells = splitMarkdownTableCells(line);
  return cells.length >= 2;
};

const renderMarkdownTable = (lines: string[], node: MarkdownNode): string => {
  if (lines.length < 2 || !isMarkdownTableSeparatorLine(lines[1])) {
    return lines
      .map((line) => `<p class="chemd-markdown">${renderInlineText(line, node)}</p>`)
      .join("");
  }

  const headerCells = splitMarkdownTableCells(lines[0]);
  const separatorCells = splitMarkdownTableCells(lines[1]);
  const alignments: MarkdownTableAlignment[] = separatorCells.map((cell) => ({
    horizontal: cell.startsWith(":") && cell.endsWith(":")
      ? "center"
      : cell.endsWith(":")
        ? "right"
        : cell.startsWith(":")
          ? "left"
          : undefined
  }));
  const bodyRows = lines.slice(2).map((line) => splitMarkdownTableCells(line));

  const normalizeRow = (row: string[]): string[] => {
    if (row.length === headerCells.length) {
      return row;
    }

    if (row.length > headerCells.length) {
      return row.slice(0, headerCells.length);
    }

    return [...row, ...Array.from({ length: headerCells.length - row.length }, () => "")];
  };

  const renderCell = (tag: "th" | "td", value: string, index: number): string => {
    const alignment = alignments[index]?.horizontal;
    const style = alignment ? ` style="text-align:${alignment}"` : "";
    return `<${tag}${style}>${renderInlineText(value, node)}</${tag}>`;
  };

  const thead = `<thead><tr>${headerCells
    .map((cell, index) => renderCell("th", cell, index))
    .join("")}</tr></thead>`;
  const tbodyRows = bodyRows
    .map((row) => {
      const normalizedRow = normalizeRow(row);
      return `<tr>${normalizedRow.map((cell, index) => renderCell("td", cell, index)).join("")}</tr>`;
    })
    .join("");
  const tbody = `<tbody>${tbodyRows}</tbody>`;

  return `<table class="chemd-markdown-table">${thead}${tbody}</table>`;
};

const renderMarkdownListEntries = (entries: MarkdownListEntry[], node: MarkdownNode): string => {
  if (entries.length === 0) {
    return "";
  }

  const renderListItemContent = (entry: MarkdownListEntry): string => {
    if (!entry.task) {
      return renderInlineText(entry.content, node);
    }

    const checkedAttribute = entry.task.checked ? " checked" : "";

    return `<label class="chemd-task-label"><input class="chemd-task-checkbox" type="checkbox" disabled${checkedAttribute} /><span>${renderInlineText(entry.task.text, node)}</span></label>`;
  };

  const buildList = (
    startIndex: number,
    depth: number,
    type: "ul" | "ol"
  ): { html: string; nextIndex: number } => {
    let index = startIndex;
    const items: string[] = [];

    while (index < entries.length) {
      const entry = entries[index];

      if (entry.depth < depth) {
        break;
      }

      if (entry.depth > depth || entry.type !== type) {
        break;
      }

      index += 1;

      let nestedHtml = "";

      while (index < entries.length) {
        const nestedEntry = entries[index];

        if (nestedEntry.depth <= depth) {
          break;
        }

        const nestedList = buildList(index, nestedEntry.depth, nestedEntry.type);
        nestedHtml += nestedList.html;
        index = nestedList.nextIndex;
      }

      const taskClass = entry.task ? ' class="chemd-task-item"' : "";
      const itemContent = renderListItemContent(entry);
      items.push(`<li${taskClass}>${itemContent}${nestedHtml}</li>`);
    }

    const firstEntry = entries[startIndex];
    const startAttribute =
      type === "ol" && (firstEntry?.order ?? 1) > 1
        ? ` start="${firstEntry.order}"`
        : "";

    return {
      html: `<${type} class="chemd-markdown-list"${startAttribute}>${items.join("")}</${type}>`,
      nextIndex: index
    };
  };

  let index = 0;
  const segments: string[] = [];

  while (index < entries.length) {
    const entry = entries[index];
    const segment = buildList(index, entry.depth, entry.type);
    segments.push(segment.html);
    index = segment.nextIndex;
  }

  return segments.join("");
};

interface MarkdownRenderState {
  blocks: string[];
  paragraphLines: string[];
  listEntries: MarkdownListEntry[];
  quoteLines: string[];
  tableLines: string[];
  codeFenceLines: string[];
  codeFenceLanguage?: string;
  inCodeFence: boolean;
  canSuppressLeadingHeading: boolean;
}

const createMarkdownRenderState = (): MarkdownRenderState => ({
  blocks: [],
  paragraphLines: [],
  listEntries: [],
  quoteLines: [],
  tableLines: [],
  codeFenceLines: [],
  codeFenceLanguage: undefined,
  inCodeFence: false,
  canSuppressLeadingHeading: true
});

const flushParagraph = (state: MarkdownRenderState, node: MarkdownNode) => {
  if (state.paragraphLines.length === 0) {
    return;
  }

  state.blocks.push(
    `<p class="chemd-markdown">${renderInlineText(state.paragraphLines.join(" "), node)}</p>`
  );
  state.paragraphLines = [];
};

const flushList = (state: MarkdownRenderState, node: MarkdownNode) => {
  if (state.listEntries.length === 0) {
    return;
  }

  state.blocks.push(renderMarkdownListEntries(state.listEntries, node));
  state.listEntries = [];
};

const flushQuote = (state: MarkdownRenderState, node: MarkdownNode) => {
  if (state.quoteLines.length === 0) {
    return;
  }

  const quoteNode: MarkdownNode = {
    ...node,
    value: state.quoteLines.join("\n")
  };

  state.blocks.push(
    `<blockquote class="chemd-markdown-quote">${renderMarkdownNode(quoteNode)}</blockquote>`
  );
  state.quoteLines = [];
};

const flushTable = (state: MarkdownRenderState, node: MarkdownNode) => {
  if (state.tableLines.length === 0) {
    return;
  }

  state.blocks.push(renderMarkdownTable(state.tableLines, node));
  state.tableLines = [];
};

const flushCodeFence = (state: MarkdownRenderState) => {
  if (!state.inCodeFence) {
    return;
  }

  const languageAttribute = state.codeFenceLanguage
    ? ` data-language="${state.codeFenceLanguage}"`
    : "";

  state.blocks.push(
    `<pre class="chemd-markdown-code"><code${languageAttribute}>${escapeHtml(
      state.codeFenceLines.join("\n")
    )}</code></pre>`
  );

  state.codeFenceLines = [];
  state.codeFenceLanguage = undefined;
  state.inCodeFence = false;
};

const flushParagraphContext = (state: MarkdownRenderState, node: MarkdownNode) => {
  flushParagraph(state, node);
  flushList(state, node);
  flushQuote(state, node);
  flushTable(state, node);
};

const flushListContext = (state: MarkdownRenderState, node: MarkdownNode) => {
  flushParagraph(state, node);
  flushQuote(state, node);
  flushTable(state, node);
};

const handleCodeFenceContent = (
  trimmed: string,
  line: string,
  state: MarkdownRenderState
): boolean => {
  if (!state.inCodeFence) {
    return false;
  }

  if (/^```/.test(trimmed)) {
    flushCodeFence(state);
  } else {
    state.codeFenceLines.push(line);
  }

  return true;
};

const handleCodeFenceStart = (
  trimmed: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  const match = trimmed.match(/^```([a-zA-Z0-9_-]+)?\s*$/);

  if (!match) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraphContext(state, node);
  state.inCodeFence = true;
  state.codeFenceLanguage = match[1];
  return true;
};

const handleBlankLine = (trimmed: string, node: MarkdownNode, state: MarkdownRenderState): boolean => {
  if (trimmed) {
    return false;
  }

  flushParagraphContext(state, node);
  return true;
};

const handleTableContinuation = (
  trimmed: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  if (state.tableLines.length === 0) {
    return false;
  }

  if (trimmed.includes("|")) {
    state.tableLines.push(trimmed);
    return true;
  }

  flushTable(state, node);
  return false;
};

const handleTableStart = (
  trimmed: string,
  nextTrimmed: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  if (!isMarkdownTableHeaderCandidate(trimmed) || !isMarkdownTableSeparatorLine(nextTrimmed)) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraph(state, node);
  flushList(state, node);
  flushQuote(state, node);
  state.tableLines.push(trimmed);
  return true;
};

const handleHorizontalRule = (
  trimmed: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  if (!MARKDOWN_HR_PATTERN.test(trimmed)) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraphContext(state, node);
  state.blocks.push('<hr class="chemd-markdown-hr" />');
  return true;
};

const handleHeading = (
  trimmed: string,
  node: MarkdownNode,
  state: MarkdownRenderState,
  suppressLeadingHeadingText?: string
): boolean => {
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);

  if (!headingMatch) {
    return false;
  }

  flushParagraphContext(state, node);

  const level = headingMatch[1].length;
  if (
    state.canSuppressLeadingHeading &&
    level === 1 &&
    suppressLeadingHeadingText &&
    normalizeWhitespace(headingMatch[2]) === normalizeWhitespace(suppressLeadingHeadingText)
  ) {
    state.canSuppressLeadingHeading = false;
    return true;
  }

  state.canSuppressLeadingHeading = false;
  state.blocks.push(
    `<h${level} class="chemd-markdown chemd-markdown--h${level}">${renderInlineText(headingMatch[2], node)}</h${level}>`
  );
  return true;
};

const handleUnorderedList = (
  line: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  const unorderedMatch = line.match(/^(\s*)[-*]\s+(.+)$/);

  if (!unorderedMatch) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushListContext(state, node);

  const content = unorderedMatch[2];
  state.listEntries.push({
    type: "ul",
    depth: getMarkdownIndentLevel(unorderedMatch[1]),
    content,
    task: parseMarkdownTaskItem(content)
  });
  return true;
};

const handleOrderedList = (
  line: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

  if (!orderedMatch) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushListContext(state, node);
  state.listEntries.push({
    type: "ol",
    depth: getMarkdownIndentLevel(orderedMatch[1]),
    order: Number(orderedMatch[2]),
    content: orderedMatch[3]
  });
  return true;
};

const handleQuote = (
  trimmed: string,
  node: MarkdownNode,
  state: MarkdownRenderState
): boolean => {
  const quoteMatch = trimmed.match(/^>\s?(.*)$/);

  if (!quoteMatch) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraph(state, node);
  flushList(state, node);
  flushTable(state, node);
  state.quoteLines.push(quoteMatch[1]);
  return true;
};

interface HandleMarkdownLineContext {
  line: string;
  trimmed: string;
  nextTrimmed: string;
  node: MarkdownNode;
  state: MarkdownRenderState;
  suppressLeadingHeadingText?: string;
}

const handleMarkdownLine = ({
  line,
  trimmed,
  nextTrimmed,
  node,
  state,
  suppressLeadingHeadingText
}: HandleMarkdownLineContext) => {
  if (handleCodeFenceContent(trimmed, line, state)) {
    return;
  }

  if (handleCodeFenceStart(trimmed, node, state)) {
    return;
  }

  if (handleBlankLine(trimmed, node, state)) {
    return;
  }

  if (handleTableContinuation(trimmed, node, state)) {
    return;
  }

  if (handleTableStart(trimmed, nextTrimmed, node, state)) {
    return;
  }

  if (handleHorizontalRule(trimmed, node, state)) {
    return;
  }

  if (handleHeading(trimmed, node, state, suppressLeadingHeadingText)) {
    return;
  }

  if (handleUnorderedList(line, node, state)) {
    return;
  }

  if (handleOrderedList(line, node, state)) {
    return;
  }

  if (handleQuote(trimmed, node, state)) {
    return;
  }

  flushList(state, node);
  flushQuote(state, node);
  flushTable(state, node);
  state.canSuppressLeadingHeading = false;
  state.paragraphLines.push(trimmed);
};

export const renderMarkdownNode = (
  node: MarkdownNode,
  options: RenderMarkdownNodeOptions = {}
): string => {
  const { suppressLeadingHeadingText } = options;
  const lines = node.value.split(/\r?\n/);
  const state = createMarkdownRenderState();

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    handleMarkdownLine({
      line: lines[lineIndex],
      trimmed: lines[lineIndex].trim(),
      nextTrimmed: lineIndex + 1 < lines.length ? lines[lineIndex + 1].trim() : "",
      node,
      state,
      suppressLeadingHeadingText
    });
  }

  if (state.inCodeFence) {
    flushCodeFence(state);
  }

  flushParagraph(state, node);
  flushList(state, node);
  flushQuote(state, node);
  flushTable(state, node);

  return state.blocks.join("");
};
