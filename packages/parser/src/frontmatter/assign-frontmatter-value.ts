import {
  isKnownRenderOverridePath,
  isRenderOverridePathFormat,
  isValidRenderOverrideValue,
  getRenderOverrideValueHint,
  type Diagnostic,
  type RenderSelection
} from "@chemd/core";
import { ISO_DATE_PATTERN } from "../shared/patterns";
import { isValidIsoDateValue } from "../shared/values";
import {
  createFrontmatterDiagnostic,
  isPlainObject,
  isScalarValue,
  mergeRenderSelection
} from "./frontmatter-diagnostics";

export const assignFrontmatterValue = (
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
