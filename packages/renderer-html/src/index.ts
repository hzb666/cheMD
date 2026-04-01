import type {
  AnalysisNode,
  ChemdDocument,
  ChemdNode,
  ColNode,
  MarkdownNode,
  MoleculeNode,
  ReactionNode,
  ResultNode,
  SampleNode,
  TemplateNode
} from "@chemd/core";
import {
  mapRenderOptionsToAdapterPayload,
  type RenderAdapterPayload,
  type RenderOptions
} from "@chemd/render-profile";
import { renderMoleculeSvg, renderReactionSvg } from "@chemd/renderer-svg";

const MARKDOWN_HR_PATTERN = /^([-*_])(?:\s*\1){2,}\s*$/;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const applyMarkdownInlineStyles = (escapedValue: string): string =>
  escapedValue
    .replace(/~~([^\r\n~]+?)~~/g, "<del>$1</del>")
    .replace(/\*\*([^\r\n*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^\r\n*]+?)\*/g, "<em>$1</em>");

const applyMarkdownInlineStylesInHtmlText = (html: string): string =>
  html
    .split(/(<[^>]+>)/g)
    .map((segment) => (segment.startsWith("<") ? segment : applyMarkdownInlineStyles(segment)))
    .join("");

const stringifyValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.join(" | ");
  }

  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

const applyInlineTokens = (escapedValue: string, node: MarkdownNode): string => {
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

const applyUnpositionedInlineTokens = (escapedValue: string, node: MarkdownNode): string => {
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

const sanitizeHref = (href: string): string | undefined => {
  const trimmed = href.trim();

  if (!trimmed || hasControlCharacters(trimmed)) {
    return undefined;
  }

  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

  if (!schemeMatch) {
    return trimmed;
  }

  const scheme = schemeMatch[1].toLowerCase();

  if (["http", "https", "mailto"].includes(scheme)) {
    return trimmed;
  }

  return undefined;
};

const renderTextSegmentByRegex = (value: string, node: MarkdownNode): string => {
  const linkPattern = /\[([^\]\r\n]+)\]\(((?:[^()\r\n]|\([^()\r\n]*\))+?)\)/g;
  let rendered = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(value)) !== null) {
    const fullMatch = match[0];
    const label = match[1];
    const rawHref = match[2];

    rendered += applyMarkdownInlineStylesInHtmlText(
      applyInlineTokens(escapeHtml(value.slice(cursor, match.index)), node)
    );

    const safeHref = sanitizeHref(rawHref);

    if (!safeHref) {
      rendered += applyMarkdownInlineStylesInHtmlText(
        applyInlineTokens(escapeHtml(fullMatch), node)
      );
    } else {
      const labelHtml = applyMarkdownInlineStylesInHtmlText(
        applyInlineTokens(escapeHtml(label), node)
      );
      rendered += `<a class="chemd-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer noopener">${labelHtml}</a>`;
    }

    cursor = match.index + fullMatch.length;
  }

  rendered += applyMarkdownInlineStylesInHtmlText(
    applyInlineTokens(escapeHtml(value.slice(cursor)), node)
  );

  return rendered;
};

const renderInlineTextByRegex = (value: string, node: MarkdownNode): string => {
  const codePattern = /`([^`\r\n]+)`/g;
  let rendered = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = codePattern.exec(value)) !== null) {
    rendered += renderTextSegmentByRegex(value.slice(cursor, match.index), node);
    rendered += `<code class="chemd-inline-code">${escapeHtml(match[1])}</code>`;
    cursor = match.index + match[0].length;
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

const locateTokenRanges = (value: string, node: MarkdownNode): TokenRange[] => {
  const ranges: TokenRange[] = [];

  for (let index = 0; index < node.inlineCode.length; index += 1) {
    const token = node.inlineCode[index];

    if (!hasValidSpan(value, token.raw, token.start, token.end)) {
      continue;
    }

    ranges.push({
      kind: "code",
      tokenIndex: index,
      start: token.start as number,
      end: token.end as number
    });
  }

  for (let index = 0; index < node.links.length; index += 1) {
    const token = node.links[index];

    if (!hasValidSpan(value, token.raw, token.start, token.end)) {
      continue;
    }

    ranges.push({
      kind: "link",
      tokenIndex: index,
      start: token.start as number,
      end: token.end as number
    });
  }

  for (let index = 0; index < node.inlineChem.length; index += 1) {
    const token = node.inlineChem[index];

    if (!hasValidSpan(value, token.raw, token.start, token.end)) {
      continue;
    }

    ranges.push({
      kind: "chem",
      tokenIndex: index,
      start: token.start as number,
      end: token.end as number
    });
  }

  for (let index = 0; index < node.references.length; index += 1) {
    const token = node.references[index];

    if (!hasValidSpan(value, token.raw, token.start, token.end)) {
      continue;
    }

    ranges.push({
      kind: "reference",
      tokenIndex: index,
      start: token.start as number,
      end: token.end as number
    });
  }

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

    if (!previous) {
      filtered.push(range);
      continue;
    }

    if (range.start >= previous.end) {
      filtered.push(range);
      continue;
    }

    const previousPriority = priority[previous.kind];
    const currentPriority = priority[range.kind];

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

const renderInlineTextWithRanges = (value: string, node: MarkdownNode): string => {
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

    if (range.kind === "code") {
      const token = node.inlineCode[range.tokenIndex];
      rendered += `<code class="chemd-inline-code">${escapeHtml(token?.value ?? "")}</code>`;
      cursor = range.end;
      continue;
    }

    if (range.kind === "link") {
      const token = node.links[range.tokenIndex];
      const safeHref = token?.safe ? sanitizeHref(token.href) : undefined;

      if (!token || !safeHref) {
        rendered += applyMarkdownInlineStylesInHtmlText(
          applyUnpositionedInlineTokens(
            escapeHtml(token?.raw ?? value.slice(range.start, range.end)),
            node
          )
        );
        cursor = range.end;
        continue;
      }

      const labelHtml = applyMarkdownInlineStylesInHtmlText(
        applyUnpositionedInlineTokens(escapeHtml(token.label), node)
      );
      rendered += `<a class="chemd-link" href="${escapeHtml(safeHref)}" target="_blank" rel="noreferrer noopener">${labelHtml}</a>`;
      cursor = range.end;
      continue;
    }

    if (range.kind === "chem") {
      const token = node.inlineChem[range.tokenIndex];
      rendered += `<span class="chem-inline" data-chem="${escapeHtml(token?.value ?? "")}">${escapeHtml(token?.value ?? "")}</span>`;
      cursor = range.end;
      continue;
    }

    const reference = node.references[range.tokenIndex];

    if (reference?.resolution?.status === "resolved") {
      rendered += escapeHtml(stringifyValue(reference.resolution.value));
    } else {
      rendered += escapeHtml(reference?.raw ?? value.slice(range.start, range.end));
    }

    cursor = range.end;
  }

  rendered += applyMarkdownInlineStylesInHtmlText(
    applyUnpositionedInlineTokens(escapeHtml(value.slice(cursor)), node)
  );

  return rendered;
};

const renderInlineText = (value: string, node: MarkdownNode): string => {
  const hasPositionedToken =
    node.references.some((token) => typeof token.start === "number" && typeof token.end === "number") ||
    node.inlineChem.some((token) => typeof token.start === "number" && typeof token.end === "number") ||
    node.inlineCode.some((token) => typeof token.start === "number" && typeof token.end === "number") ||
    node.links.some((token) => typeof token.start === "number" && typeof token.end === "number");

  if (hasPositionedToken) {
    return renderInlineTextWithRanges(value, node);
  }

  return renderInlineTextByRegex(value, node);
};
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

const renderMarkdownNode = (node: MarkdownNode): string => {
  const lines = node.value.split(/\r?\n/);
  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listEntries: MarkdownListEntry[] = [];
  let quoteLines: string[] = [];
  let tableLines: string[] = [];
  let codeFenceLines: string[] = [];
  let codeFenceLanguage: string | undefined;
  let inCodeFence = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    blocks.push(
      `<p class="chemd-markdown">${renderInlineText(paragraphLines.join(" "), node)}</p>`
    );
    paragraphLines = [];
  };

  const flushList = () => {
    if (listEntries.length === 0) {
      return;
    }

    blocks.push(renderMarkdownListEntries(listEntries, node));
    listEntries = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) {
      return;
    }

    const quoteNode: MarkdownNode = {
      ...node,
      value: quoteLines.join("\n")
    };

    blocks.push(
      `<blockquote class="chemd-markdown-quote">${renderMarkdownNode(quoteNode)}</blockquote>`
    );
    quoteLines = [];
  };
  const flushTable = () => {
    if (tableLines.length === 0) {
      return;
    }

    blocks.push(renderMarkdownTable(tableLines, node));
    tableLines = [];
  };
  const flushCodeFence = () => {
    if (!inCodeFence) {
      return;
    }

    const languageAttribute = codeFenceLanguage
      ? ` data-language="${escapeHtml(codeFenceLanguage)}"`
      : "";

    blocks.push(
      `<pre class="chemd-markdown-code"><code${languageAttribute}>${escapeHtml(
        codeFenceLines.join("\n")
      )}</code></pre>`
    );

    codeFenceLines = [];
    codeFenceLanguage = undefined;
    inCodeFence = false;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    const nextTrimmed = lineIndex + 1 < lines.length ? lines[lineIndex + 1].trim() : "";

    if (inCodeFence) {
      if (/^```/.test(trimmed)) {
        flushCodeFence();
      } else {
        codeFenceLines.push(line);
      }
      continue;
    }

    const codeFenceStartMatch = trimmed.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
    if (codeFenceStartMatch) {
      flushParagraph();
      flushList();

      flushQuote();
      flushTable();
      inCodeFence = true;
      codeFenceLanguage = codeFenceStartMatch[1];
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();

      flushQuote();
      flushTable();
      continue;
    }

    if (tableLines.length > 0) {
      if (trimmed.includes("|")) {
        tableLines.push(trimmed);
        continue;
      }

      flushTable();
    }

    if (isMarkdownTableHeaderCandidate(trimmed) && isMarkdownTableSeparatorLine(nextTrimmed)) {
      flushParagraph();
      flushList();
      flushQuote();
      tableLines.push(trimmed);
      continue;
    }

    if (MARKDOWN_HR_PATTERN.test(trimmed)) {
      flushParagraph();
      flushList();

      flushQuote();
      flushTable();
      blocks.push('<hr class="chemd-markdown-hr" />');
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();

      flushQuote();
      flushTable();

      const level = headingMatch[1].length;
      blocks.push(
        `<h${level} class="chemd-markdown chemd-markdown--h${level}">${renderInlineText(headingMatch[2], node)}</h${level}>`
      );
      continue;
    }

    const unorderedMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushQuote();
      flushTable();

      const content = unorderedMatch[2];
      const task = parseMarkdownTaskItem(content);

      listEntries.push({
        type: "ul",
        depth: getMarkdownIndentLevel(unorderedMatch[1]),
        content,
        task
      });
      continue;
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      flushTable();

      listEntries.push({
        type: "ol",
        depth: getMarkdownIndentLevel(orderedMatch[1]),
        order: Number(orderedMatch[2]),
        content: orderedMatch[3]
      });
      continue;
    }
    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      flushTable();

      quoteLines.push(quoteMatch[1]);
      continue;
    }

    flushList();

    flushQuote();
    flushTable();
    paragraphLines.push(trimmed);
  }

  if (inCodeFence) {
    flushCodeFence();
  }

  flushParagraph();
  flushList();

  flushQuote();
  flushTable();

  return blocks.join("");
};

const renderFieldList = (fields: Array<[string, unknown]>): string => {
  const items = fields
    .filter(([, value]) => value !== undefined && value !== null && stringifyValue(value) !== "")
    .map(
      ([label, value]) =>
        `<div class="chemd-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(stringifyValue(value))}</dd></div>`
    )
    .join("");

  return `<dl class="chemd-fields">${items}</dl>`;
};

const renderGraphic = (svg: string): string => `<div class="chemd-graphic">${svg}</div>`;

const renderReaction = (
  node: ReactionNode,
  options: RenderOptions,
  adapterPayload: RenderAdapterPayload
): string =>
  `<section class="chemd-block chemd-block--reaction" data-node-id="${escapeHtml(node.id ?? "")}">
    <h2>Reaction</h2>
    ${renderGraphic(renderReactionSvg(node, options, adapterPayload))}
    ${renderFieldList([
      ["ID", node.id],
      ["Name", node.name],
      ["Reactants", node.reactants],
      ["Products", node.products],
      ["Reagents", node.reagents],
      ["Catalyst", node.catalyst],
      ["Solvent", node.solvent],
      ["Temperature", node.temperature],
      ["Time", node.time],
      ["Pressure", node.pressure],
      ["Atmosphere", node.atmosphere],
      ["Yield", node.yield],
      ["Conversion", node.conversion],
      ["Selectivity", node.selectivity],
      ["Caption", node.caption]
    ])}
  </section>`;

const renderResult = (node: ResultNode): string =>
  `<section class="chemd-block chemd-block--result" data-node-id="${escapeHtml(node.id ?? "")}">
    <h2>Result</h2>
    ${renderFieldList([
      ["ID", node.id],
      ["Status", node.status],
      ["Yield", node.yield],
      ["Conversion", node.conversion],
      ["Selectivity", node.selectivity],
      ["Isolated Mass", node.isolated_mass],
      ["Product State", node.product_state],
      ["Purity", node.purity],
      ["Notes", node.notes]
    ])}
  </section>`;

const renderMolecule = (
  node: MoleculeNode,
  options: RenderOptions,
  adapterPayload: RenderAdapterPayload
): string =>
  `<section class="chemd-block chemd-block--molecule" data-node-id="${escapeHtml(node.id ?? "")}">
    <h2>Molecule</h2>
    ${renderGraphic(renderMoleculeSvg(node, options, adapterPayload))}
    ${renderFieldList([
      ["ID", node.id],
      ["Name", node.name],
      ["SMILES", node.smiles],
      ["Role", node.role],
      ["Caption", node.caption],
      ["Formula", node.formula],
      ["Amount", node.amount],
      ["Equivalents", node.equivalents]
    ])}
  </section>`;

const renderAnalysis = (node: AnalysisNode): string =>
  `<section class="chemd-block chemd-block--analysis" data-node-id="${escapeHtml(node.id ?? "")}">
    <h2>Analysis</h2>
    ${renderFieldList([
      ["ID", node.id],
      ["Type", node.type_name],
      ["Instrument", node.instrument],
      ["Solvent", node.solvent],
      ["Frequency", node.frequency],
      ["Method", node.method],
      ["Data", node.data],
      ["Notes", node.notes]
    ])}
  </section>`;

const renderSample = (node: SampleNode): string =>
  `<section class="chemd-block chemd-block--sample" data-node-id="${escapeHtml(node.id ?? "")}">
    <h2>Sample</h2>
    ${renderFieldList([
      ["ID", node.id],
      ["Name", node.name],
      ["Sample ID", node.sample_id],
      ["Batch", node.batch],
      ["Purity", node.purity],
      ["Supplier", node.supplier],
      ["Notes", node.notes]
    ])}
  </section>`;

const renderTemplate = (node: TemplateNode): string =>
  `<section class="chemd-block chemd-block--template" data-template-name="${escapeHtml(node.name)}">
    <h2>Template</h2>
    ${renderFieldList([
      ["Name", node.name],
      ["Description", node.description],
      ["Params", node.params],
      ["Bind", Object.entries(node.bind).map(([alias, source]) => `${alias}=${source}`)]
    ])}
  </section>`;

const renderCol = (
  node: ColNode,
  options: RenderOptions,
  adapterPayload: RenderAdapterPayload
): string => {
  const columns = Math.max(1, node.columns);
  const items = node.children
    .map(
      (child) =>
        `<div class="chemd-col-item">${renderNode(child, options, adapterPayload)}</div>`
    )
    .join("");

  return `<section class="chemd-block chemd-block--col" data-columns="${columns}">
    <div class="chemd-col-grid" style="--chemd-col-columns:${columns}">${items}</div>
  </section>`;
};

const renderNode = (
  node: ChemdNode,
  options: RenderOptions,
  adapterPayload: RenderAdapterPayload
): string => {
  switch (node.type) {
    case "markdown":
      return renderMarkdownNode(node);
    case "reaction":
      return renderReaction(node, options, adapterPayload);
    case "result":
      return renderResult(node);
    case "molecule":
      return renderMolecule(node, options, adapterPayload);
    case "analysis":
      return renderAnalysis(node);
    case "sample":
      return renderSample(node);
    case "template":
      return renderTemplate(node);
    case "col":
      return renderCol(node, options, adapterPayload);
    default:
      return "";
  }
};

export const renderHtml = (
  document: ChemdDocument,
  options: RenderOptions,
  adapterPayload?: RenderAdapterPayload
): string => {
  const resolvedAdapterPayload = adapterPayload ?? mapRenderOptionsToAdapterPayload(options);
  const body = document.children.map((child) => renderNode(child, options, resolvedAdapterPayload)).join("\n");

  const diagnostics = document.diagnostics.length
    ? `<ul class="diagnostics">${document.diagnostics
        .map(
          (diagnostic) =>
            `<li data-severity="${diagnostic.severity}">${escapeHtml(diagnostic.code)}: ${escapeHtml(diagnostic.message)}</li>`
        )
        .join("")}</ul>`
    : "";

  return [
    `<article class="chemd-document" data-profile="${escapeHtml(options.profileId)}">`,
    `<header><h1>${escapeHtml(String(document.meta.title))}</h1><p>${escapeHtml(String(document.meta.date))}</p></header>`,
    `<section class="chemd-body">${body}</section>`,
    diagnostics,
    `</article>`
  ].join("");
};



























