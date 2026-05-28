import { renderInlineText } from "./inline-render";
import { escapeHtml, normalizeWhitespace } from "./shared";

export interface MarkdownRenderNode {
  type: "markdown";
  value: string;
  references: Array<{
    raw: string;
    kind: string;
    source: string;
    field?: string;
    resolution?: {
      status: "resolved" | "unresolved";
      value?: unknown;
    };
    start?: number;
    end?: number;
  }>;
  inlineChem: Array<{ raw: string; value: string; start?: number; end?: number }>;
  inlineCode: Array<{ raw: string; value: string; start?: number; end?: number }>;
  links: Array<{ raw: string; label: string; href: string; safe: boolean; start?: number; end?: number }>;
}

const getMarkdownIndentLevel = (indent: string): number => {
  let width = 0;

  for (const char of indent) {
    width += char === "\t" ? 2 : 1;
  }

  return Math.floor(width / 2);
};

const isWhitespace = (char: string): boolean =>
  char === " " || char === "\t" || char === "\r" || char === "\n";

const readMarkdownTaskItem = (content: string): MarkdownTaskItem | undefined => {
  if (
    content.length < 5
    || content[0] !== "["
    || content[2] !== "]"
    || !isWhitespace(content[3])
  ) {
    return undefined;
  }
  const marker = content[1];
  if (marker !== " " && marker !== "x" && marker !== "X") {
    return undefined;
  }
  return {
    checked: marker.toLowerCase() === "x",
    text: content.slice(4).trimStart()
  };
};

const isMarkdownHr = (trimmed: string): boolean => {
  const marker = trimmed[0];
  if (marker !== "-" && marker !== "*" && marker !== "_") return false;
  let count = 0;
  for (const char of trimmed) {
    if (char === marker) {
      count += 1;
      continue;
    }
    if (!isWhitespace(char)) return false;
  }
  return count >= 3;
};

const readHeading = (trimmed: string): { level: number; text: string } | undefined => {
  let level = 0;
  while (trimmed[level] === "#" && level < 6) level += 1;
  if (level === 0 || !isWhitespace(trimmed[level] ?? "")) return undefined;
  const text = trimmed.slice(level).trimStart();
  return text ? { level, text } : undefined;
};

const readCodeFenceLanguage = (trimmed: string): string | undefined | null => {
  if (!trimmed.startsWith("```")) return null;
  const language = trimmed.slice(3).trim();
  if (!language) return undefined;
  const valid = Array.from(language).every((char) =>
    (char >= "A" && char <= "Z")
    || (char >= "a" && char <= "z")
    || (char >= "0" && char <= "9")
    || char === "_"
    || char === "-"
  );
  return valid ? language : null;
};

const readUnorderedListEntry = (line: string): { indent: string; content: string } | undefined => {
  let index = 0;
  while (line[index] === " " || line[index] === "\t") index += 1;
  if (line[index] !== "-" && line[index] !== "*") return undefined;
  if (!isWhitespace(line[index + 1] ?? "")) return undefined;
  return { indent: line.slice(0, index), content: line.slice(index + 2) };
};

const readOrderedListEntry = (line: string): { indent: string; order: number; content: string } | undefined => {
  let index = 0;
  while (line[index] === " " || line[index] === "\t") index += 1;
  const start = index;
  while (line[index] >= "0" && line[index] <= "9") index += 1;
  if (index === start || line[index] !== "." || !isWhitespace(line[index + 1] ?? "")) {
    return undefined;
  }
  return {
    indent: line.slice(0, start),
    order: Number(line.slice(start, index)),
    content: line.slice(index + 2)
  };
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
  return readMarkdownTaskItem(content);
};

const splitMarkdownTableCells = (line: string): string[] => {
  const trimmed = line.trim();
  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const body = withoutLeadingPipe.endsWith("|")
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe;
  return body.split("|").map((cell) => cell.trim());
};

const isMarkdownTableSeparatorLine = (line: string): boolean => {
  const cells = splitMarkdownTableCells(line);

  if (cells.length === 0) {
    return false;
  }

  return cells.every(isMarkdownTableSeparatorCell);
};

const isMarkdownTableSeparatorCell = (cell: string): boolean => {
  const trimmed = cell.trim();
  const body = trimmed.startsWith(":") ? trimmed.slice(1) : trimmed;
  const withoutRightAlign = body.endsWith(":") ? body.slice(0, -1) : body;
  return withoutRightAlign.length >= 3 && Array.from(withoutRightAlign).every((char) => char === "-");
};

const isMarkdownTableHeaderCandidate = (line: string): boolean => {
  if (!line.includes("|")) {
    return false;
  }

  const cells = splitMarkdownTableCells(line);
  return cells.length >= 2;
};

const renderMarkdownTable = (lines: string[], node: MarkdownRenderNode): string => {
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

const renderMarkdownListEntries = (entries: MarkdownListEntry[], node: MarkdownRenderNode): string => {
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

const flushParagraph = (state: MarkdownRenderState, node: MarkdownRenderNode) => {
  if (state.paragraphLines.length === 0) {
    return;
  }

  state.blocks.push(
    `<p class="chemd-markdown">${renderInlineText(state.paragraphLines.join(" "), node)}</p>`
  );
  state.paragraphLines = [];
};

const flushList = (state: MarkdownRenderState, node: MarkdownRenderNode) => {
  if (state.listEntries.length === 0) {
    return;
  }

  state.blocks.push(renderMarkdownListEntries(state.listEntries, node));
  state.listEntries = [];
};

const flushQuote = (state: MarkdownRenderState, node: MarkdownRenderNode) => {
  if (state.quoteLines.length === 0) {
    return;
  }

  const quoteNode: MarkdownRenderNode = {
    ...node,
    value: state.quoteLines.join("\n")
  };

  state.blocks.push(
    `<blockquote class="chemd-markdown-quote">${renderMarkdownNode(quoteNode)}</blockquote>`
  );
  state.quoteLines = [];
};

const flushTable = (state: MarkdownRenderState, node: MarkdownRenderNode) => {
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

const flushParagraphContext = (state: MarkdownRenderState, node: MarkdownRenderNode) => {
  flushParagraph(state, node);
  flushList(state, node);
  flushQuote(state, node);
  flushTable(state, node);
};

const flushListContext = (state: MarkdownRenderState, node: MarkdownRenderNode) => {
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

  if (trimmed.startsWith("```")) {
    flushCodeFence(state);
  } else {
    state.codeFenceLines.push(line);
  }

  return true;
};

const handleCodeFenceStart = (
  trimmed: string,
  node: MarkdownRenderNode,
  state: MarkdownRenderState
): boolean => {
  const language = readCodeFenceLanguage(trimmed);

  if (language === null) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraphContext(state, node);
  state.inCodeFence = true;
  state.codeFenceLanguage = language;
  return true;
};

const handleBlankLine = (trimmed: string, node: MarkdownRenderNode, state: MarkdownRenderState): boolean => {
  if (trimmed) {
    return false;
  }

  flushParagraphContext(state, node);
  return true;
};

const handleTableContinuation = (
  trimmed: string,
  node: MarkdownRenderNode,
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
  node: MarkdownRenderNode,
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
  node: MarkdownRenderNode,
  state: MarkdownRenderState
): boolean => {
  if (!isMarkdownHr(trimmed)) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraphContext(state, node);
  state.blocks.push('<hr class="chemd-markdown-hr" />');
  return true;
};

const handleHeading = (
  trimmed: string,
  node: MarkdownRenderNode,
  state: MarkdownRenderState,
  suppressLeadingHeadingText?: string
): boolean => {
  const heading = readHeading(trimmed);

  if (!heading) {
    return false;
  }

  flushParagraphContext(state, node);

  const level = heading.level;
  if (
    state.canSuppressLeadingHeading &&
    level === 1 &&
    suppressLeadingHeadingText &&
    normalizeWhitespace(heading.text) === normalizeWhitespace(suppressLeadingHeadingText)
  ) {
    state.canSuppressLeadingHeading = false;
    return true;
  }

  state.canSuppressLeadingHeading = false;
  state.blocks.push(
    `<h${level} class="chemd-markdown chemd-markdown--h${level}">${renderInlineText(heading.text, node)}</h${level}>`
  );
  return true;
};

const handleUnorderedList = (
  line: string,
  node: MarkdownRenderNode,
  state: MarkdownRenderState
): boolean => {
  const unordered = readUnorderedListEntry(line);

  if (!unordered) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushListContext(state, node);

  const content = unordered.content;
  state.listEntries.push({
    type: "ul",
    depth: getMarkdownIndentLevel(unordered.indent),
    content,
    task: parseMarkdownTaskItem(content)
  });
  return true;
};

const handleOrderedList = (
  line: string,
  node: MarkdownRenderNode,
  state: MarkdownRenderState
): boolean => {
  const ordered = readOrderedListEntry(line);

  if (!ordered) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushListContext(state, node);
  state.listEntries.push({
    type: "ol",
    depth: getMarkdownIndentLevel(ordered.indent),
    order: ordered.order,
    content: ordered.content
  });
  return true;
};

const handleQuote = (
  trimmed: string,
  node: MarkdownRenderNode,
  state: MarkdownRenderState
): boolean => {
  if (!trimmed.startsWith(">")) {
    return false;
  }

  state.canSuppressLeadingHeading = false;
  flushParagraph(state, node);
  flushList(state, node);
  flushTable(state, node);
  const quoteText = trimmed[1] === " " ? trimmed.slice(2) : trimmed.slice(1);
  state.quoteLines.push(quoteText);
  return true;
};

interface HandleMarkdownLineContext {
  line: string;
  trimmed: string;
  nextTrimmed: string;
  node: MarkdownRenderNode;
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
  node: MarkdownRenderNode,
  options: RenderMarkdownNodeOptions = {}
): string => {
  const { suppressLeadingHeadingText } = options;
  const lines = node.value.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
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
