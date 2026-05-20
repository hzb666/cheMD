import type {
  Diagnostic,
  RenderSelection
} from "@chemd/core";
import {
  LineCounter,
  isMap,
  isScalar,
  isSeq,
  type ParsedNode
} from "yaml";
import {
  assignFrontmatterValue,
  type FrontmatterOverrideLineMap
} from "./frontmatter-assigners";
import {
  createFrontmatterDiagnostic,
  getLineInfoFromOffset,
  getNestedNodeOffset,
  getNodeLineSpan
} from "./frontmatter-diagnostics";
import { REQUIRED_FRONTMATTER_KEYS } from "./frontmatter-shared";
import { getYamlMapKey, toPlainYamlValue } from "./frontmatter-yaml";

interface ApplyFrontmatterMapContext {
  lines: string[];
  sanitizedFrontmatterSource: string;
  lineCounter: LineCounter;
  diagnostics: Diagnostic[];
  meta: Record<string, unknown>;
  renderSelection: RenderSelection | undefined;
  seenKeys: Set<string>;
}

export const reportYamlDocumentErrors = (
  errors: Array<{ pos?: [number, number?]; message: string }>,
  lineCounter: LineCounter,
  lines: string[],
  diagnostics: Diagnostic[]
) => {
  for (const error of errors) {
    const { lineIndex, lineText } = getLineInfoFromOffset(error.pos?.[0], lineCounter, lines);
    const trimmed = lineText.trim();

    if (!trimmed) {
      continue;
    }

    diagnostics.push(
      createFrontmatterDiagnostic({
        code: "W_INVALID_FRONTMATTER_LINE",
        severity: "error",
        message: trimmed ? `Invalid frontmatter line: ${trimmed}` : `Invalid frontmatter line: ${error.message}`,
        lineIndex,
        lineText,
        token: trimmed || undefined
      })
    );
  }
};

const readRenderOverridesValue = (
  key: string,
  valueNode: ParsedNode | null | undefined,
  lineCounter: LineCounter,
  lines: string[],
  diagnostics: Diagnostic[]
): { value: unknown; valueLineMap?: FrontmatterOverrideLineMap } => {
  if (!valueNode || !isMap(valueNode)) {
    return {
      value: toPlainYamlValue(valueNode)
    };
  }

  const sanitizedOverrides: Record<string, unknown> = {};
  const valueLineMap: FrontmatterOverrideLineMap = {};

  for (const overrideItem of valueNode.items) {
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
        createFrontmatterDiagnostic({
          code: "E_INVALID_FRONTMATTER_VALUE",
          severity: "error",
          message: `Nested frontmatter object is not supported: ${key}.${overrideKey}`,
          lineIndex: overrideLineInfo.lineIndex,
          lineText: overrideLineInfo.lineText,
          token: overrideKey
        })
      );

      const nestedLineInfo = getLineInfoFromOffset(
        getNestedNodeOffset(overrideItem.value),
        lineCounter,
        lines
      );
      diagnostics.push(
        createFrontmatterDiagnostic({
          code: "E_INVALID_FRONTMATTER_VALUE",
          severity: "error",
          message: `Nested frontmatter structure is not supported under ${key}`,
          lineIndex: nestedLineInfo.lineIndex,
          lineText: nestedLineInfo.lineText,
          token: key
        })
      );
      continue;
    }

    valueLineMap[overrideKey] = overrideLineInfo;
    sanitizedOverrides[overrideKey] = toPlainYamlValue(overrideItem.value);
  }

  return {
    value: sanitizedOverrides,
    valueLineMap
  };
};

const hasUnsupportedScalarValue = (
  context: {
    key: string;
    valueNode: ParsedNode | null | undefined;
    lineCounter: LineCounter;
    diagnostics: Diagnostic[];
    lineIndex: number;
    lineText: string;
  }
): boolean => {
  if (
    context.key === "tags"
    || context.key === "render_overrides"
    || !context.valueNode
    || !isScalar(context.valueNode)
  ) {
    return false;
  }

  const lineSpan = getNodeLineSpan(context.valueNode, context.lineCounter);

  if (!lineSpan || lineSpan.endLine <= lineSpan.startLine) {
    return false;
  }

  context.diagnostics.push(
    createFrontmatterDiagnostic({
      code: "E_INVALID_FRONTMATTER_VALUE",
      severity: "error",
      message: `Unsupported multiline frontmatter scalar for ${context.key}: implicit multiline scalars are not supported`,
      lineIndex: context.lineIndex,
      lineText: context.lineText,
      token: context.key
    })
  );
  return true;
};

const hasUnsupportedNestedValue = (
  context: {
    key: string;
    valueNode: ParsedNode | null | undefined;
    lineCounter: LineCounter;
    lines: string[];
    diagnostics: Diagnostic[];
    lineIndex: number;
    lineText: string;
  }
): boolean => {
  if (context.key === "tags" || context.key === "render_overrides" || !context.valueNode) {
    return false;
  }

  if (!isMap(context.valueNode) && !(isSeq(context.valueNode) && !context.valueNode.flow)) {
    return false;
  }

  const message = isMap(context.valueNode)
    ? `Nested frontmatter object is not supported for ${context.key}`
    : `Nested frontmatter list is not supported for ${context.key}`;
  context.diagnostics.push(
    createFrontmatterDiagnostic({
      code: "E_INVALID_FRONTMATTER_VALUE",
      severity: "error",
      message,
      lineIndex: context.lineIndex,
      lineText: context.lineText,
      token: context.key
    })
  );

  const nestedLineInfo = getLineInfoFromOffset(
    getNestedNodeOffset(context.valueNode),
    context.lineCounter,
    context.lines
  );
  context.diagnostics.push(
    createFrontmatterDiagnostic({
      code: "E_INVALID_FRONTMATTER_VALUE",
      severity: "error",
      message: `Nested frontmatter structure is not supported under ${context.key}`,
      lineIndex: nestedLineInfo.lineIndex,
      lineText: nestedLineInfo.lineText,
      token: context.key
    })
  );
  return true;
};

const readFlowSequenceValue = (
  key: string,
  valueNode: ParsedNode | null | undefined,
  sanitizedFrontmatterSource: string,
  currentValue: unknown
): unknown => {
  if (key === "tags" || !valueNode || !isSeq(valueNode) || !valueNode.flow) {
    return currentValue;
  }

  const rawStart = valueNode.range?.[0];
  const rawEnd = valueNode.range?.[1];

  if (typeof rawStart === "number" && typeof rawEnd === "number") {
    return sanitizedFrontmatterSource.slice(rawStart, rawEnd).trim();
  }

  return currentValue;
};

export const applyFrontmatterMap = (
  root: ParsedNode | null | undefined,
  context: ApplyFrontmatterMapContext
): RenderSelection | undefined => {
  if (!root || !isMap(root)) {
    return context.renderSelection;
  }

  let nextRenderSelection = context.renderSelection;

  for (const item of root.items) {
    const key = getYamlMapKey(item.key);

    if (!key) {
      const { lineIndex, lineText } = getLineInfoFromOffset(item.key?.range?.[0], context.lineCounter, context.lines);
      context.diagnostics.push(
        createFrontmatterDiagnostic({
          code: "E_INVALID_FRONTMATTER_VALUE",
          severity: "error",
          message: "Invalid frontmatter key: expected a scalar key",
          lineIndex,
          lineText,
          token: lineText.trim() || undefined
        })
      );
      continue;
    }

    const { lineIndex, lineText } = getLineInfoFromOffset(item.key?.range?.[0], context.lineCounter, context.lines);
    const { value, valueLineMap } = readRenderOverridesValue(
      key,
      item.value,
      context.lineCounter,
      context.lines,
      context.diagnostics
    );

    if (hasUnsupportedScalarValue({
      key,
      valueNode: item.value,
      lineCounter: context.lineCounter,
      diagnostics: context.diagnostics,
      lineIndex,
      lineText
    })) {
      continue;
    }

    if (hasUnsupportedNestedValue({
      key,
      valueNode: item.value,
      lineCounter: context.lineCounter,
      lines: context.lines,
      diagnostics: context.diagnostics,
      lineIndex,
      lineText
    })) {
      continue;
    }

    nextRenderSelection = assignFrontmatterValue({
      key,
      value: readFlowSequenceValue(key, item.value, context.sanitizedFrontmatterSource, value),
      meta: context.meta,
      currentSelection: nextRenderSelection,
      diagnostics: context.diagnostics,
      lineIndex,
      seenKeys: context.seenKeys,
      valueLineMap
    });
  }

  return nextRenderSelection;
};

export const appendMissingRequiredKeyDiagnostics = (
  lines: string[],
  diagnostics: Diagnostic[],
  seenKeys: Set<string>
) => {
  const anchorLineIndex = lines.findIndex((entry) => entry.trim().length > 0);

  for (const requiredKey of REQUIRED_FRONTMATTER_KEYS) {
    if (seenKeys.has(requiredKey)) {
      continue;
    }

    diagnostics.push(
      createFrontmatterDiagnostic({
        code: "E_MISSING_REQUIRED_FRONTMATTER_KEY",
        severity: "error",
        message: `Missing required frontmatter key: ${requiredKey}`,
        lineIndex: anchorLineIndex >= 0 ? anchorLineIndex : 0,
        lineText: lines[anchorLineIndex >= 0 ? anchorLineIndex : 0] ?? "",
        token: requiredKey
      })
    );
  }
};
