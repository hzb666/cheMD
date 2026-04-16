import {
  getRenderOverrideValueHint,
  isKnownRenderOverridePath,
  isRenderOverridePathFormat,
  isValidRenderOverrideValue,
  type Diagnostic,
  type RenderSelection
} from "@chemd/core";
import { createFrontmatterDiagnostic } from "./frontmatter-diagnostics";
import {
  isPlainObject,
  isScalarValue,
  isValidIsoDateValue
} from "./frontmatter-shared";

export type FrontmatterOverrideLineMap = Record<string, { lineIndex: number; lineText: string }>;

interface AssignFrontmatterValueContext {
  key: string;
  value: unknown;
  meta: Record<string, unknown>;
  currentSelection: RenderSelection | undefined;
  diagnostics: Diagnostic[];
  lineIndex: number;
  seenKeys: Set<string>;
  valueLineMap?: FrontmatterOverrideLineMap;
}

interface PushDiagnosticContext {
  diagnostics: Diagnostic[];
  code: string;
  message: string;
  lineIndex: number;
  key: string;
  lineText?: string;
  severity?: Diagnostic["severity"];
}

const pushDiagnostic = ({
  diagnostics,
  code,
  message,
  lineIndex,
  key,
  lineText,
  severity = "error"
}: PushDiagnosticContext) => {
  diagnostics.push(
    createFrontmatterDiagnostic({
      code,
      severity,
      message,
      lineIndex,
      lineText: lineText ?? `${key}:`,
      token: key
    })
  );
};

const mergeRenderSelection = (
  current: RenderSelection | undefined,
  patch: Partial<RenderSelection>
): RenderSelection => ({
  profileId: patch.profileId ?? current?.profileId,
  overrides: patch.overrides ?? current?.overrides
});

const markSeenKey = ({
  key,
  diagnostics,
  lineIndex,
  seenKeys
}: Pick<AssignFrontmatterValueContext, "key" | "diagnostics" | "lineIndex" | "seenKeys">) => {
  if (seenKeys.has(key)) {
    diagnostics.push(
      createFrontmatterDiagnostic({
        code: "W_DUPLICATE_FRONTMATTER_KEY",
        severity: "warning",
        message: `Duplicate frontmatter key: ${key} (last value wins)`,
        lineIndex,
        lineText: `${key}:`,
        token: key
      })
    );
  }

  seenKeys.add(key);
};

const assignRenderProfileValue = ({
  key,
  value,
  currentSelection,
  diagnostics,
  lineIndex
}: Pick<AssignFrontmatterValueContext, "key" | "value" | "currentSelection" | "diagnostics" | "lineIndex">) => {
  if (typeof value !== "string" || !value.trim()) {
    pushDiagnostic({
      diagnostics,
      code: "E_INVALID_FRONTMATTER_VALUE",
      message: "Invalid frontmatter value for render_profile: expected a non-empty string",
      lineIndex,
      key
    });
    return currentSelection;
  }

  return mergeRenderSelection(currentSelection, { profileId: value.trim() });
};

const normalizeRenderOverrides = ({
  value,
  diagnostics,
  lineIndex,
  valueLineMap
}: Pick<AssignFrontmatterValueContext, "value" | "diagnostics" | "lineIndex" | "valueLineMap">) => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const normalizedOverrides: Record<string, unknown> = {};
  for (const [overrideKey, overrideValue] of Object.entries(value)) {
    const lineInfo = valueLineMap?.[overrideKey];
    const diagnosticLineIndex = lineInfo?.lineIndex ?? lineIndex;
    const diagnosticLineText = lineInfo?.lineText ?? `  ${overrideKey}:`;

    if (!isRenderOverridePathFormat(overrideKey)) {
      pushDiagnostic({
        diagnostics,
        code: "E_INVALID_FRONTMATTER_VALUE",
        message: `Invalid render_overrides key: ${overrideKey}`,
        lineIndex: diagnosticLineIndex,
        key: overrideKey,
        lineText: diagnosticLineText
      });
      continue;
    }

    if (!isKnownRenderOverridePath(overrideKey)) {
      pushDiagnostic({
        diagnostics,
        code: "E_INVALID_FRONTMATTER_VALUE",
        message: `Unsupported render_overrides field: ${overrideKey}`,
        lineIndex: diagnosticLineIndex,
        key: overrideKey,
        lineText: diagnosticLineText
      });
      continue;
    }

    if (!isScalarValue(overrideValue)) {
      pushDiagnostic({
        diagnostics,
        code: "E_INVALID_FRONTMATTER_VALUE",
        message: `Invalid render_overrides value at ${overrideKey}: only scalar values are supported`,
        lineIndex: diagnosticLineIndex,
        key: overrideKey,
        lineText: diagnosticLineText
      });
      continue;
    }

    if (!isValidRenderOverrideValue(overrideKey, overrideValue)) {
      const valueHint = getRenderOverrideValueHint(overrideKey) ?? "a valid value";
      pushDiagnostic({
        diagnostics,
        code: "E_INVALID_FRONTMATTER_VALUE",
        message: `Invalid render_overrides value at ${overrideKey}: expected ${valueHint}`,
        lineIndex: diagnosticLineIndex,
        key: overrideKey,
        lineText: diagnosticLineText
      });
      normalizedOverrides[overrideKey] = overrideValue;
      continue;
    }

    normalizedOverrides[overrideKey] = overrideValue;
  }

  return normalizedOverrides;
};

const assignRenderOverridesValue = (
  context: Pick<
    AssignFrontmatterValueContext,
    "currentSelection" | "diagnostics" | "lineIndex" | "value" | "valueLineMap"
  >
) => {
  const normalizedOverrides = normalizeRenderOverrides(context);

  if (!normalizedOverrides) {
    context.diagnostics.push(
      createFrontmatterDiagnostic({
        code: "E_INVALID_FRONTMATTER_VALUE",
        severity: "error",
        message: "Invalid frontmatter value for render_overrides: expected a one-level object",
        lineIndex: context.lineIndex,
        lineText: "render_overrides:",
        token: "render_overrides"
      })
    );
    return context.currentSelection;
  }

  if (Object.keys(normalizedOverrides).length === 0) {
    return context.currentSelection;
  }

  return mergeRenderSelection(context.currentSelection, { overrides: normalizedOverrides });
};

const assignRequiredStringValue = ({
  key,
  value,
  meta,
  diagnostics,
  lineIndex,
  currentSelection
}: Pick<
  AssignFrontmatterValueContext,
  "key" | "value" | "meta" | "diagnostics" | "lineIndex" | "currentSelection"
>) => {
  if (typeof value !== "string" || !value.trim()) {
    pushDiagnostic({
      diagnostics,
      code: "E_INVALID_FRONTMATTER_VALUE",
      message: `Invalid frontmatter value for ${key}: expected a non-empty string`,
      lineIndex,
      key
    });
    return currentSelection;
  }

  meta[key] = value.trim();
  if (key === "date") {
    const dateValue = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      diagnostics.push(
        createFrontmatterDiagnostic({
          code: "W_NON_ISO_FRONTMATTER_DATE",
          severity: "warning",
          message: "Non-ISO date format for date: expected YYYY-MM-DD",
          lineIndex,
          lineText: `${key}: ${dateValue}`,
          token: key
        })
      );
    } else if (!isValidIsoDateValue(dateValue)) {
      diagnostics.push(
        createFrontmatterDiagnostic({
          code: "W_INVALID_FRONTMATTER_DATE_VALUE",
          severity: "warning",
          message: "Invalid date value for date: expected a real calendar date",
          lineIndex,
          lineText: `${key}: ${dateValue}`,
          token: key
        })
      );
    }
  }

  return currentSelection;
};

const assignTagsValue = ({
  value,
  meta,
  diagnostics,
  lineIndex,
  currentSelection
}: Pick<
  AssignFrontmatterValueContext,
  "value" | "meta" | "diagnostics" | "lineIndex" | "currentSelection"
>) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    diagnostics.push(
      createFrontmatterDiagnostic({
        code: "E_INVALID_FRONTMATTER_VALUE",
        severity: "error",
        message: "Invalid frontmatter value for tags: expected a string array",
        lineIndex,
        lineText: "tags:",
        token: "tags"
      })
    );
    return currentSelection;
  }

  meta.tags = value.map((item) => item.trim());
  return currentSelection;
};

const assignScalarValue = ({
  key,
  value,
  meta,
  diagnostics,
  lineIndex,
  currentSelection
}: Pick<
  AssignFrontmatterValueContext,
  "key" | "value" | "meta" | "diagnostics" | "lineIndex" | "currentSelection"
>) => {
  if (!isScalarValue(value)) {
    pushDiagnostic({
      diagnostics,
      code: "E_INVALID_FRONTMATTER_VALUE",
      message: `Invalid frontmatter value for ${key}: expected a scalar value`,
      lineIndex,
      key
    });
    return currentSelection;
  }

  meta[key] = value;
  return currentSelection;
};

export const assignFrontmatterValue = (context: AssignFrontmatterValueContext): RenderSelection | undefined => {
  markSeenKey(context);

  if (context.key === "render_profile") {
    return assignRenderProfileValue(context);
  }

  if (context.key === "render_overrides") {
    return assignRenderOverridesValue(context);
  }

  if (["id", "title", "date"].includes(context.key) || context.key.startsWith("primary_")) {
    return assignRequiredStringValue(context);
  }

  if (context.key === "tags") {
    return assignTagsValue(context);
  }

  return assignScalarValue(context);
};
