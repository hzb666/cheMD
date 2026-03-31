import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import { type ChemdMeta, type Diagnostic, type RenderSelection } from "@chemd/core";
import { FRONTMATTER_PATTERN, FRONTMATTER_KEY_VALUE_PATTERN, FRONTMATTER_BLOCK_SCALAR_PATTERN } from "../shared/patterns";
import { DEFAULT_META, REQUIRED_FRONTMATTER_KEYS } from "../shared/values";
import { createFrontmatterDiagnostic, getIndentWidth } from "./frontmatter-diagnostics";
import {
  getLineInfoFromOffset,
  getNestedNodeOffset,
  getNodeLineSpan,
  getYamlMapKey,
  toPlainYamlValue
} from "./yaml-utils";
import { assignFrontmatterValue } from "./assign-frontmatter-value";

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
