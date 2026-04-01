import {
  getRenderOverrideValueHint,
  isKnownRenderOverridePath,
  isRenderOverridePathFormat,
  isValidRenderOverrideValue,
  type ChemdMeta,
  type Diagnostic,
  type RenderSelection
} from "@chemd/core";
import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

const DEFAULT_META: ChemdMeta = {
  id: "draft-document",
  title: "Untitled chemd document",
  date: "1970-01-01"
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
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

const parseFrontmatterKeyValueLine = (line: string): { key: string; rawValue: string } | undefined => {
  if (!line || line.length < 2) {
    return undefined;
  }

  const first = line.charCodeAt(0);
  const isLowerAlpha = first >= 97 && first <= 122;
  if (!isLowerAlpha) {
    return undefined;
  }

  let index = 1;
  while (index < line.length) {
    const code = line.charCodeAt(index);
    const isLower = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isUnderscore = code === 95;

    if (!(isLower || isDigit || isUnderscore)) {
      break;
    }
    index += 1;
  }

  if (index >= line.length || line.charCodeAt(index) !== 58) {
    return undefined;
  }

  const key = line.slice(0, index);
  let valueStart = index + 1;
  while (valueStart < line.length) {
    const code = line.charCodeAt(valueStart);
    if (code !== 32 && code !== 9) {
      break;
    }
    valueStart += 1;
  }

  return {
    key,
    rawValue: line.slice(valueStart)
  };
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

export const parseFrontmatter = (
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

    const keyValue = parseFrontmatterKeyValueLine(line);
    if (!keyValue) {
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

    const { key, rawValue } = keyValue;
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
