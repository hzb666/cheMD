import {
  createDocument,
  createInlineChemToken,
  createInlineCodeToken,
  createMarkdownNode,
  createMarkdownLinkToken,
  createReferenceToken,
  isKnownRenderOverridePath,
  isRenderOverridePathFormat,
  isValidRenderOverrideValue,
  getRenderOverrideValueHint,
  type AnalysisNode,
  type ChemdMeta,
  type ChemdNode,
  type Diagnostic,
  type InlineChemToken,
  type InlineCodeToken,
  type MarkdownLinkToken,
  type MoleculeNode,
  type ReactionNode,
  type ReferenceKind,
  type ReferenceToken,
  type RenderSelection,
  type ResultNode,
  type SampleNode,
  type StructuredNode,
  type TemplateNode,
  type ColNode,
  type UseNode
} from "@chemd/core";
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

const DEFAULT_META: ChemdMeta = {
  id: "draft-document",
  title: "Untitled chemd document",
  date: "1970-01-01"
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FRONTMATTER_KEY_VALUE_PATTERN = /^([a-z][a-z0-9_]*):(?:\s*(.*))?$/;
const FRONTMATTER_BLOCK_SCALAR_PATTERN = /^[>|][+-]?$/;
const REQUIRED_FRONTMATTER_KEYS = ["id", "title", "date"] as const;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDateValue = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((item) => Number(item));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};
const BLOCK_TYPE_PATTERN = "[a-z][a-z0-9_]*";
const BLOCK_START_PATTERN = new RegExp(`^:::(${BLOCK_TYPE_PATTERN})(?:-(\\d+))?(?:\\s+(.*))?$`);
const COL_INLINE_BRACE_BLOCK_PATTERN = new RegExp(
  `^col:\\s*\\{:::(${BLOCK_TYPE_PATTERN})(?:-\\d+)?(?:\\s+.*)?$`
);
const KEY_VALUE_PATTERN = /^([a-z][a-z0-9_]*):\s*(.*)$/;
const ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const REFERENCE_PATTERN = /@([a-zA-Z][a-zA-Z0-9_-]*)(?:\.([a-zA-Z][a-zA-Z0-9_-]*))?/g;
const INLINE_CHEM_VALUE_PATTERN = /:chem\[([^\]\r\n]+)\]/g;
const INLINE_CODE_VALUE_PATTERN = /`([^`\r\n]+)`/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]\r\n]+)\]\(((?:[^()\r\n]|\([^()\r\n]*\))+?)\)/g;
const ALIAS_NAMES = new Set(["reaction", "result", "product", "sample"]);
const LIST_FIELDS = new Set(["reactants", "products", "params"]);
const BLOCK_FIELDS: Record<string, Set<string>> = {
  molecule: new Set(["smiles", "name", "role", "caption", "formula", "amount", "equivalents"]),
  reaction: new Set(["reactants", "products", "name", "reagents", "catalyst", "solvent", "temperature", "time", "pressure", "atmosphere", "yield", "conversion", "selectivity", "caption"]),
  result: new Set(["status", "yield", "conversion", "selectivity", "isolated_mass", "product_state", "purity", "notes"]),
  analysis: new Set(["type", "instrument", "solvent", "frequency", "method", "data", "notes"]),
  sample: new Set(["name", "sample_id", "batch", "purity", "supplier", "notes"]),
  template: new Set(["bind", "params", "description"]),
  use: new Set([]),
  col: new Set([])
};

const createFrontmatterDiagnostic = (
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  lineIndex: number,
  lineText?: string,
  token?: string
): Diagnostic => {
  const resolvedLineText = lineText ?? "";
  const fallbackColumn = Math.max(resolvedLineText.search(/\S/) + 1, 1);
  const startColumn = token && resolvedLineText.includes(token)
    ? resolvedLineText.indexOf(token) + 1
    : fallbackColumn;
  const endColumn = startColumn + ((token?.length ?? Math.max(resolvedLineText.trim().length, 1)) - 1);

  return {
    code,
    severity,
    message,
    position: {
      start: { line: lineIndex + 2, column: startColumn },
      end: { line: lineIndex + 2, column: endColumn }
    }
  };
};
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isScalarValue = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const getIndentWidth = (line: string): number => {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  let width = 0;

  for (const char of leading) {
    width += char === "\t" ? 2 : 1;
  }

  return width;
};

const mergeRenderSelection = (
  current: RenderSelection | undefined,
  patch: Partial<RenderSelection>
): RenderSelection => ({
  profileId: patch.profileId ?? current?.profileId,
  overrides: patch.overrides ?? current?.overrides
});

const assignFrontmatterValue = (
  key: string,
  value: unknown,
  meta: Record<string, unknown>,
  currentSelection: RenderSelection | undefined,
  diagnostics: Diagnostic[],
  lineIndex: number,
  seenKeys: Set<string>,
  valueLineMap?: Record<string, { lineIndex: number; lineText: string }>
): RenderSelection | undefined => {
  if (seenKeys.has(key)) {
    diagnostics.push(
      createFrontmatterDiagnostic(
        "W_DUPLICATE_FRONTMATTER_KEY",
        "warning",
        `Duplicate frontmatter key: ${key} (last value wins)`,
        lineIndex,
        `${key}:`,
        key
      )
    );
  }
  seenKeys.add(key);

  if (key === "render_profile") {
    if (typeof value !== "string" || !value.trim()) {
      diagnostics.push(
        createFrontmatterDiagnostic(
          "E_INVALID_FRONTMATTER_VALUE",
          "error",
          "Invalid frontmatter value for render_profile: expected a non-empty string",
          lineIndex,
          `${key}:`,
          key
        )
      );
      return currentSelection;
    }

    return mergeRenderSelection(currentSelection, { profileId: value.trim() });
  }

  if (key === "render_overrides") {
    if (!isPlainObject(value)) {
      diagnostics.push(
        createFrontmatterDiagnostic(
          "E_INVALID_FRONTMATTER_VALUE",
          "error",
          "Invalid frontmatter value for render_overrides: expected a one-level object",
          lineIndex,
          `${key}:`,
          key
        )
      );
      return currentSelection;
    }

    const normalizedOverrides: Record<string, unknown> = {};
    for (const [overrideKey, overrideValue] of Object.entries(value)) {
      const lineInfo = valueLineMap?.[overrideKey];
      const diagnosticLineIndex = lineInfo?.lineIndex ?? lineIndex;
      const diagnosticLineText = lineInfo?.lineText ?? `  ${overrideKey}:`;

      if (!isRenderOverridePathFormat(overrideKey)) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Invalid render_overrides key: ${overrideKey}`,
            diagnosticLineIndex,
            diagnosticLineText,
            overrideKey
          )
        );
        continue;
      }

      if (!isKnownRenderOverridePath(overrideKey)) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Unsupported render_overrides field: ${overrideKey}`,
            diagnosticLineIndex,
            diagnosticLineText,
            overrideKey
          )
        );
        continue;
      }

      if (!isScalarValue(overrideValue)) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Invalid render_overrides value at ${overrideKey}: only scalar values are supported`,
            diagnosticLineIndex,
            diagnosticLineText,
            overrideKey
          )
        );
        continue;
      }

      if (!isValidRenderOverrideValue(overrideKey, overrideValue)) {
        const valueHint = getRenderOverrideValueHint(overrideKey) ?? "a valid value";
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Invalid render_overrides value at ${overrideKey}: expected ${valueHint}`,
            diagnosticLineIndex,
            diagnosticLineText,
            overrideKey
          )
        );
        normalizedOverrides[overrideKey] = overrideValue;
        continue;
      }

      normalizedOverrides[overrideKey] = overrideValue;
    }

    if (Object.keys(normalizedOverrides).length === 0) {
      return currentSelection;
    }

    return mergeRenderSelection(currentSelection, { overrides: normalizedOverrides });
  }

  if (["id", "title", "date"].includes(key) || key.startsWith("primary_")) {
    if (typeof value !== "string" || !value.trim()) {
      diagnostics.push(
        createFrontmatterDiagnostic(
          "E_INVALID_FRONTMATTER_VALUE",
          "error",
          `Invalid frontmatter value for ${key}: expected a non-empty string`,
          lineIndex,
          `${key}:`,
          key
        )
      );
      return currentSelection;
    }

    meta[key] = value.trim();
    if (key === "date") {
      const dateValue = value.trim();

      if (!ISO_DATE_PATTERN.test(dateValue)) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "W_NON_ISO_FRONTMATTER_DATE",
            "warning",
            "Non-ISO date format for date: expected YYYY-MM-DD",
            lineIndex,
            `${key}: ${dateValue}`,
            key
          )
        );
      } else if (!isValidIsoDateValue(dateValue)) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "W_INVALID_FRONTMATTER_DATE_VALUE",
            "warning",
            "Invalid date value for date: expected a real calendar date",
            lineIndex,
            `${key}: ${dateValue}`,
            key
          )
        );
      }
    }

    return currentSelection;
  }

  if (key === "tags") {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
      diagnostics.push(
        createFrontmatterDiagnostic(
          "E_INVALID_FRONTMATTER_VALUE",
          "error",
          "Invalid frontmatter value for tags: expected a string array",
          lineIndex,
          `${key}:`,
          key
        )
      );
      return currentSelection;
    }

    meta[key] = value.map((item) => item.trim());
    return currentSelection;
  }

  if (!isScalarValue(value)) {
    diagnostics.push(
      createFrontmatterDiagnostic(
        "E_INVALID_FRONTMATTER_VALUE",
        "error",
        `Invalid frontmatter value for ${key}: expected a scalar value`,
        lineIndex,
        `${key}:`,
        key
      )
    );
    return currentSelection;
  }

  meta[key] = value;
  return currentSelection;
};

const getLineInfoFromOffset = (
  offset: number | undefined,
  lineCounter: LineCounter,
  lines: string[]
): { lineIndex: number; lineText: string } => {
  if (typeof offset !== "number" || Number.isNaN(offset)) {
    return {
      lineIndex: 0,
      lineText: lines[0] ?? ""
    };
  }

  const position = lineCounter.linePos(Math.max(offset, 0));
  const lineIndex = Math.max(position.line - 1, 0);

  return {
    lineIndex,
    lineText: lines[lineIndex] ?? ""
  };
};

const getNestedNodeOffset = (node: unknown): number | undefined => {
  if (isMap(node)) {
    const mapNode = node as {
      items: Array<{ key?: { range?: [number, number?, number?] } }>;
      range?: [number, number?, number?];
    };

    return mapNode.items[0]?.key?.range?.[0] ?? mapNode.range?.[0];
  }

  if (isSeq(node)) {
    const sequenceNode = node as {
      items: Array<{ range?: [number, number?, number?] }>;
      range?: [number, number?, number?];
    };

    return sequenceNode.items[0]?.range?.[0] ?? sequenceNode.range?.[0];
  }

  return undefined;
};

const getNodeLineSpan = (
  node: unknown,
  lineCounter: LineCounter
): { startLine: number; endLine: number } | undefined => {
  const rangedNode = node as { range?: [number, number?, number?] } | undefined;

  if (!rangedNode?.range || typeof rangedNode.range[0] !== "number") {
    return undefined;
  }

  const startOffset = rangedNode.range[0];
  const endOffset =
    typeof rangedNode.range[1] === "number"
      ? Math.max(rangedNode.range[1] - 1, startOffset)
      : startOffset;

  return {
    startLine: lineCounter.linePos(startOffset).line,
    endLine: lineCounter.linePos(endOffset).line
  };
};

const getYamlMapKey = (keyNode: unknown): string | undefined => {
  if (isScalar(keyNode) && typeof keyNode.value === "string") {
    return keyNode.value;
  }

  if (isScalar(keyNode) && keyNode.value !== undefined && keyNode.value !== null) {
    return String(keyNode.value);
  }

  return undefined;
};

const toPlainYamlValue = (node: unknown): unknown => {
  if (node === undefined || node === null) {
    return "";
  }

  if (isScalar(node)) {
    return node.value;
  }

  if (isSeq(node)) {
    return node.items.map((item) => toPlainYamlValue(item));
  }

  if (isMap(node)) {
    const value: Record<string, unknown> = {};

    for (const item of node.items) {
      const key = getYamlMapKey(item.key);

      if (!key) {
        continue;
      }

      value[key] = toPlainYamlValue(item.value);
    }

    return value;
  }

  return "";
};

const parseFrontmatter = (
  source: string
): { body: string; meta: ChemdMeta; renderSelection?: RenderSelection; diagnostics: Diagnostic[] } => {
  const match = source.match(FRONTMATTER_PATTERN);

  if (!match) {
    return { body: source, meta: DEFAULT_META, diagnostics: [] };
  }

  const frontmatterSource = match[1];
  const lines = frontmatterSource.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const meta: Record<string, unknown> = { ...DEFAULT_META };
  let renderSelection: RenderSelection | undefined;
  const seenKeys = new Set<string>();
  const sanitizedLines = [...lines];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (getIndentWidth(line) > 0) {
      continue;
    }

    const keyValueMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);

    if (!keyValueMatch) {
      diagnostics.push(
        createFrontmatterDiagnostic(
          "W_INVALID_FRONTMATTER_LINE",
          "warning",
          `Invalid frontmatter line: ${trimmed}`,
          index,
          line,
          trimmed
        )
      );
      sanitizedLines[index] = "";
      continue;
    }

    const [, key, rawValue = ""] = keyValueMatch;
    const value = rawValue.trim();

    if (!FRONTMATTER_BLOCK_SCALAR_PATTERN.test(value)) {
      continue;
    }

    diagnostics.push(
      createFrontmatterDiagnostic(
        "E_INVALID_FRONTMATTER_VALUE",
        "error",
        `Unsupported multiline frontmatter scalar for ${key}: block scalars (| or >) are not supported`,
        index,
        line,
        key
      )
    );

    sanitizedLines[index] = "";
    let lookahead = index + 1;
    while (lookahead < lines.length) {
      const nextLine = lines[lookahead];

      if (!nextLine.trim() || getIndentWidth(nextLine) > 0) {
        sanitizedLines[lookahead] = "";
        lookahead += 1;
        continue;
      }

      break;
    }

    index = lookahead - 1;
  }

  const sanitizedFrontmatterSource = sanitizedLines.join("\n");
  const lineCounter = new LineCounter();
  const yamlDoc = parseDocument(sanitizedFrontmatterSource, {
    lineCounter,
    uniqueKeys: false,
    strict: false
  });

  for (const error of yamlDoc.errors) {
    const { lineIndex, lineText } = getLineInfoFromOffset(error.pos?.[0], lineCounter, lines);
    const trimmed = lineText.trim();
    if (!trimmed) {
      continue;
    }
    diagnostics.push(
      createFrontmatterDiagnostic(
        "W_INVALID_FRONTMATTER_LINE",
        "warning",
        trimmed ? `Invalid frontmatter line: ${trimmed}` : `Invalid frontmatter line: ${error.message}`,
        lineIndex,
        lineText,
        trimmed || undefined
      )
    );
  }

  const root = yamlDoc.contents;

  if (root && !isMap(root)) {
    diagnostics.push(
      createFrontmatterDiagnostic(
        "E_INVALID_FRONTMATTER_VALUE",
        "error",
        "Invalid frontmatter value: expected a top-level mapping object",
        0,
        lines[0] ?? "",
        lines[0]?.trim() || undefined
      )
    );
  }

  if (root && isMap(root)) {
    for (const item of root.items) {
      const key = getYamlMapKey(item.key);

      if (!key) {
        const { lineIndex, lineText } = getLineInfoFromOffset(item.key?.range?.[0], lineCounter, lines);
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            "Invalid frontmatter key: expected a scalar key",
            lineIndex,
            lineText,
            lineText.trim() || undefined
          )
        );
        continue;
      }

      const { lineIndex, lineText } = getLineInfoFromOffset(item.key?.range?.[0], lineCounter, lines);
      let value = toPlainYamlValue(item.value);
      let valueLineMap: Record<string, { lineIndex: number; lineText: string }> | undefined;

      if (key === "render_overrides" && item.value && isMap(item.value)) {
        const sanitizedOverrides: Record<string, unknown> = {};
        valueLineMap = {};
        for (const overrideItem of item.value.items) {
          const overrideKey = getYamlMapKey(overrideItem.key);
          if (!overrideKey) {
            continue;
          }

          const overrideLineInfo = getLineInfoFromOffset(
            overrideItem.key?.range?.[0],
            lineCounter,
            lines
          );

          if (overrideItem.value && (isMap(overrideItem.value) || isSeq(overrideItem.value))) {
            diagnostics.push(
              createFrontmatterDiagnostic(
                "E_INVALID_FRONTMATTER_VALUE",
                "error",
                `Nested frontmatter object is not supported: ${key}.${overrideKey}`,
                overrideLineInfo.lineIndex,
                overrideLineInfo.lineText,
                overrideKey
              )
            );

            const nestedNode = overrideItem.value;
            const nestedOffset = isMap(nestedNode) && nestedNode.items[0]
              ? nestedNode.items[0].key?.range?.[0]
              : isSeq(nestedNode) && nestedNode.items[0]
                ? nestedNode.items[0].range?.[0]
                : nestedNode.range?.[0];
            const nestedLineInfo = getLineInfoFromOffset(nestedOffset, lineCounter, lines);

            diagnostics.push(
              createFrontmatterDiagnostic(
                "E_INVALID_FRONTMATTER_VALUE",
                "error",
                `Nested frontmatter structure is not supported under ${key}`,
                nestedLineInfo.lineIndex,
                nestedLineInfo.lineText,
                key
              )
            );
            continue;
          }

          valueLineMap[overrideKey] = overrideLineInfo;
          sanitizedOverrides[overrideKey] = toPlainYamlValue(overrideItem.value);
        }

        value = sanitizedOverrides;
      }

      if (key !== "tags" && key !== "render_overrides" && item.value && isScalar(item.value)) {
        const lineSpan = getNodeLineSpan(item.value, lineCounter);

        if (lineSpan && lineSpan.endLine > lineSpan.startLine) {
          diagnostics.push(
            createFrontmatterDiagnostic(
              "E_INVALID_FRONTMATTER_VALUE",
              "error",
              `Unsupported multiline frontmatter scalar for ${key}: implicit multiline scalars are not supported`,
              lineIndex,
              lineText,
              key
            )
          );
          continue;
        }
      }

      if (key !== "tags" && key !== "render_overrides" && item.value && isMap(item.value)) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Nested frontmatter object is not supported for ${key}`,
            lineIndex,
            lineText,
            key
          )
        );

        const nestedLineInfo = getLineInfoFromOffset(
          getNestedNodeOffset(item.value),
          lineCounter,
          lines
        );
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Nested frontmatter structure is not supported under ${key}`,
            nestedLineInfo.lineIndex,
            nestedLineInfo.lineText,
            key
          )
        );
        continue;
      }

      if (key !== "tags" && key !== "render_overrides" && item.value && isSeq(item.value) && !item.value.flow) {
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Nested frontmatter list is not supported for ${key}`,
            lineIndex,
            lineText,
            key
          )
        );

        const nestedLineInfo = getLineInfoFromOffset(
          getNestedNodeOffset(item.value),
          lineCounter,
          lines
        );
        diagnostics.push(
          createFrontmatterDiagnostic(
            "E_INVALID_FRONTMATTER_VALUE",
            "error",
            `Nested frontmatter structure is not supported under ${key}`,
            nestedLineInfo.lineIndex,
            nestedLineInfo.lineText,
            key
          )
        );
        continue;
      }

      if (key !== "tags" && item.value && isSeq(item.value) && item.value.flow) {
        const rawStart = item.value.range?.[0];
        const rawEnd = item.value.range?.[1];

        if (typeof rawStart === "number" && typeof rawEnd === "number") {
          value = sanitizedFrontmatterSource.slice(rawStart, rawEnd).trim();
        }
      }

      renderSelection = assignFrontmatterValue(
        key,
        value,
        meta,
        renderSelection,
        diagnostics,
        lineIndex,
        seenKeys,
        valueLineMap
      );
    }
  }

  const anchorLineIndex = lines.findIndex((entry) => entry.trim().length > 0);
  for (const requiredKey of REQUIRED_FRONTMATTER_KEYS) {
    if (seenKeys.has(requiredKey)) {
      continue;
    }

    diagnostics.push(
      createFrontmatterDiagnostic(
        "E_MISSING_REQUIRED_FRONTMATTER_KEY",
        "error",
        `Missing required frontmatter key: ${requiredKey}`,
        anchorLineIndex >= 0 ? anchorLineIndex : 0,
        lines[anchorLineIndex >= 0 ? anchorLineIndex : 0] ?? "",
        requiredKey
      )
    );
  }

  return {
    body: source.slice(match[0].length),
    meta: meta as ChemdMeta,
    renderSelection,
    diagnostics
  };
};

const getOffsetLineColumn = (value: string, offset: number): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (value.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    column: offset - lineStart + 1
  };
};

const getMatchSpan = (
  value: string,
  match: RegExpMatchArray
): {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
} => {
  if (typeof match.index !== "number") {
    return {};
  }

  const start = match.index;
  const end = start + match[0].length;
  const startLocation = getOffsetLineColumn(value, start);
  const endLocation = getOffsetLineColumn(value, end);

  return {
    start,
    end,
    startLine: startLocation.line,
    startColumn: startLocation.column,
    endLine: endLocation.line,
    endColumn: endLocation.column
  };
};
const splitListValue = (field: string, value: string, diagnostics: Diagnostic[]): string[] => {
  const parts = value.split("|");
  const items: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (!trimmed) {
      diagnostics.push({
        code: "E_INVALID_LIST_ITEM",
        severity: "error",
        message: `Invalid empty list item in ${field}`
      });
      continue;
    }

    items.push(trimmed);
  }

  return items;
};

const tokenizeReferences = (value: string): ReferenceToken[] => {
  const references: ReferenceToken[] = [];

  for (const match of value.matchAll(REFERENCE_PATTERN)) {
    const source = match[1];
    const field = match[2];
    let kind: ReferenceKind;

    if (source === "meta" && field) {
      kind = "meta";
    } else if (source === "param" && field) {
      kind = "param_field";
    } else if (field && ALIAS_NAMES.has(source)) {
      kind = "alias_field";
    } else if (field) {
      kind = "object_field";
    } else {
      kind = "object";
    }

    references.push(
      createReferenceToken({
        kind,
        raw: match[0],
        source,
        field,
        ...getMatchSpan(value, match)
      })
    );
  }

  return references;
};

const tokenizeInlineChem = (value: string): InlineChemToken[] => {
  const tokens: InlineChemToken[] = [];

  for (const match of value.matchAll(INLINE_CHEM_VALUE_PATTERN)) {
    tokens.push(
      createInlineChemToken({
        raw: match[0],
        value: match[1],
        ...getMatchSpan(value, match)
      })
    );
  }

  return tokens;
};

const hasControlCharacters = (value: string): boolean =>
  Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });

const isSafeMarkdownHref = (href: string): boolean => {
  const trimmed = href.trim();

  if (!trimmed || hasControlCharacters(trimmed)) {
    return false;
  }

  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return true;
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

  if (!schemeMatch) {
    return true;
  }

  const scheme = schemeMatch[1].toLowerCase();

  return ["http", "https", "mailto"].includes(scheme);
};

const tokenizeInlineCode = (value: string): InlineCodeToken[] => {
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

const tokenizeMarkdownLinks = (value: string, diagnostics: Diagnostic[]): MarkdownLinkToken[] => {
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
const parseKeyValueLines = (
  blockType: string,
  lines: string[],
  diagnostics: Diagnostic[]
): Record<string, string | string[]> => {
  const fields: Record<string, string | string[]> = {};
  const allowedFields = BLOCK_FIELDS[blockType] ?? new Set<string>();

  for (const line of lines) {
    const match = line.match(KEY_VALUE_PATTERN);

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (blockType !== "use" && !allowedFields.has(key)) {
      diagnostics.push({
        code: "W_UNKNOWN_FIELD",
        severity: "warning",
        message: `Unknown field "${key}" on ${blockType}`
      });
    }

    fields[key] = LIST_FIELDS.has(key) ? splitListValue(key, rawValue, diagnostics) : rawValue.trim();
  }

  return fields;
};

const parseTemplateBind = (value?: string | string[]): Record<string, string> => {
  if (!value || Array.isArray(value)) {
    return {};
  }

  return value.split("|").reduce<Record<string, string>>((accumulator, pair) => {
    const [alias, source] = pair.split("=").map((item) => item.trim());

    if (alias && source) {
      accumulator[alias] = source;
    }

    return accumulator;
  }, {});
};

const createMarkdownFromText = (value: string, diagnostics: Diagnostic[]) =>
  createMarkdownNode(
    value,
    tokenizeReferences(value),
    tokenizeInlineChem(value),
    tokenizeInlineCode(value),
    tokenizeMarkdownLinks(value, diagnostics)
  );

const parseColColumns = (blockType: string, headerArg: string | undefined, diagnostics: Diagnostic[]): number => {
  const trimmed = headerArg?.trim() ?? "";
  const fallback = 1;

  if (blockType !== "col") {
    return fallback;
  }

  const matched = trimmed.match(/^(\d+)$/);
  const columns = matched ? Number.parseInt(matched[1], 10) : NaN;
  if (!Number.isFinite(columns) || columns < 1) {
    diagnostics.push({
      code: "W_INVALID_COL_COLUMNS",
      severity: "warning",
      message: `Invalid column count on col block: ${trimmed || "(empty)"}, fallback to 1`
    });
    return fallback;
  }

  return columns;
};

const parseStructuredBlock = (
  blockType: string,
  headerArg: string | undefined,
  lines: string[],
  diagnostics: Diagnostic[],
  bodyChildren?: ChemdNode[]
): StructuredNode | undefined => {
  const normalizedBlockType = blockType === "mol" ? "molecule" : blockType;
  if (!["molecule", "reaction", "result", "analysis", "sample", "use", "col"].includes(normalizedBlockType)) {
    diagnostics.push({
      code: "W_UNKNOWN_BLOCK",
      severity: "warning",
      message: `Unknown block type: ${blockType}`
    });
    return undefined;
  }

  if (normalizedBlockType === "use") {
    const template = headerArg?.trim() ?? "";
    const fields = parseKeyValueLines(blockType, lines, diagnostics);
    const values = Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(" | ") : value])
    );

    return {
      type: "use",
      template,
      values
    } satisfies UseNode;
  }

  if (normalizedBlockType === "col") {
    return {
      type: "col",
      columns: parseColColumns(normalizedBlockType, headerArg, diagnostics),
      children: bodyChildren ?? []
    } satisfies ColNode;
  }

  const id = headerArg?.trim().startsWith("#") ? headerArg.trim().slice(1) : undefined;

  if (id && !ID_PATTERN.test(id)) {
    diagnostics.push({
      code: "E_INVALID_ID",
      severity: "error",
      message: `Invalid block id: ${id}`,
      nodeId: id
    });
  }

  const fields = parseKeyValueLines(normalizedBlockType, lines, diagnostics);

  switch (normalizedBlockType) {
    case "molecule":
      return { type: "molecule", id, ...fields } as MoleculeNode;
    case "reaction":
      return { type: "reaction", id, ...fields } as ReactionNode;
    case "result":
      return { type: "result", id, ...fields } as ResultNode;
    case "analysis": {
      const { type: analysisType, ...rest } = fields;
      return { type: "analysis", id, type_name: typeof analysisType === "string" ? analysisType : undefined, ...rest } as AnalysisNode;
    }
    case "sample":
      return { type: "sample", id, ...fields } as SampleNode;
    default:
      return undefined;
  }
};

interface ParseChildrenResult {
  children: ChemdNode[];
  nextIndex: number;
}

const resolveHeaderArg = (
  blockType: string,
  columnsArg: string | undefined,
  rawHeaderArg: string | undefined
): string | undefined => {
  if (blockType === "col" && columnsArg) {
    return columnsArg;
  }

  return rawHeaderArg;
};

const collectBraceBlockLines = (
  lines: string[],
  startIndex: number
): { lines: string[]; nextIndex: number; terminated: boolean } => {
  const collected: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === ":::}") {
      return { lines: collected, nextIndex: index + 1, terminated: true };
    }
    collected.push(line);
    index += 1;
  }

  return { lines: collected, nextIndex: index, terminated: false };
};

const parseColChildren = (lines: string[], diagnostics: Diagnostic[]): ChemdNode[] => {
  const children: ChemdNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line.startsWith("col:")) {
      index += 1;
      continue;
    }

    const value = line.slice(4).trim();
    if (value.startsWith("{:::")) {
      const braceHeader = value.slice(1).trim();
      const braceBlockLines = [braceHeader];
      const collected = collectBraceBlockLines(lines, index + 1);
      braceBlockLines.push(...collected.lines);
      if (!collected.terminated) {
        diagnostics.push({
          code: "W_UNTERMINATED_BRACE_BLOCK",
          severity: "warning",
          message: "Unterminated brace block inside col block"
        });
      }

      const parsed = parseChildren(braceBlockLines, diagnostics);
      children.push(...parsed.children);
      index = collected.nextIndex;
      continue;
    }

    if (value) {
      children.push(createMarkdownFromText(value, diagnostics));
    }
    index += 1;
  }

  return children;
};

const collectStructuredBlockLines = (
  blockType: string,
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex: number
): { blockLines: string[]; nextIndex: number } => {
  const blockLines: string[] = [];
  let index = startIndex;
  let braceDepth = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (blockType === "col") {
      if (trimmed.match(COL_INLINE_BRACE_BLOCK_PATTERN)) {
        braceDepth += 1;
      } else if (trimmed === ":::}" && braceDepth > 0) {
        braceDepth -= 1;
      }
    }

    if (trimmed === ":::" && (blockType !== "col" || braceDepth === 0)) {
      index += 1;
      return { blockLines, nextIndex: index };
    }

    blockLines.push(line);
    index += 1;
  }

  if (blockType === "col" && braceDepth > 0) {
    diagnostics.push({
      code: "W_UNTERMINATED_BRACE_BLOCK",
      severity: "warning",
      message: "Unterminated brace block inside col block"
    });
  }

  return { blockLines, nextIndex: index };
};

const parseChildren = (
  lines: string[],
  diagnostics: Diagnostic[],
  startIndex = 0,
  stopAtBlockEnd = false
): ParseChildrenResult => {
  const children: ChemdNode[] = [];
  const markdownBuffer: string[] = [];
  let index = startIndex;

  const flushMarkdown = () => {
    const value = markdownBuffer.join("\n").trim();

    if (value) {
      children.push(createMarkdownFromText(value, diagnostics));
    }

    markdownBuffer.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === ":::") {
      if (stopAtBlockEnd) {
        flushMarkdown();
        return { children, nextIndex: index + 1 };
      }

      markdownBuffer.push(line);
      index += 1;
      continue;
    }

    const blockMatch = line.match(BLOCK_START_PATTERN);

    if (!blockMatch) {
      markdownBuffer.push(line);
      index += 1;
      continue;
    }

    flushMarkdown();

    const [, blockType, blockColumnsArg, blockHeaderArg] = blockMatch;
    const headerArg = resolveHeaderArg(blockType, blockColumnsArg, blockHeaderArg);
    index += 1;

    if (blockType === "template") {
      const templateName = headerArg?.trim() ?? "";
      const leadingFieldLines: string[] = [];

      while (index < lines.length && KEY_VALUE_PATTERN.test(lines[index])) {
        leadingFieldLines.push(lines[index]);
        index += 1;
      }

      const fields = parseKeyValueLines(blockType, leadingFieldLines, diagnostics);
      const bodyResult = parseChildren(lines, diagnostics, index, true);
      index = bodyResult.nextIndex;

      children.push({
        type: "template",
        name: templateName,
        bind: parseTemplateBind(fields.bind),
        params: Array.isArray(fields.params) ? fields.params : [],
        description: typeof fields.description === "string" ? fields.description : undefined,
        body: bodyResult.children.filter((child): child is TemplateNode["body"][number] => child.type !== "template")
      });
      continue;
    }

    const { blockLines, nextIndex } = collectStructuredBlockLines(blockType, lines, diagnostics, index);
    index = nextIndex;

    const bodyChildren = blockType === "col" ? parseColChildren(blockLines, diagnostics) : undefined;
    const node = parseStructuredBlock(blockType, headerArg, blockLines, diagnostics, bodyChildren);

    if (node) {
      children.push(node);
    }
  }

  flushMarkdown();

  return { children, nextIndex: index };
};

const parseBody = (body: string): { children: ChemdNode[]; diagnostics: Diagnostic[] } => {
  const diagnostics: Diagnostic[] = [];
  const lines = body.split(/\r?\n/);
  const result = parseChildren(lines, diagnostics);

  return { children: result.children, diagnostics };
};

export const parseChemd = (source: string) => {
  const parsed = parseFrontmatter(source);
  const body = parseBody(parsed.body);

  return createDocument(parsed.meta, {
    children: body.children,
    diagnostics: [...parsed.diagnostics, ...body.diagnostics],
    source,
    renderSelection: parsed.renderSelection
  });
};


















