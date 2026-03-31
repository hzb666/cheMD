import { type Diagnostic, type RenderSelection } from "@chemd/core";

export const createFrontmatterDiagnostic = (
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

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isScalarValue = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

export const getIndentWidth = (line: string): number => {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  let width = 0;

  for (const char of leading) {
    width += char === "\t" ? 2 : 1;
  }

  return width;
};

export const mergeRenderSelection = (
  current: RenderSelection | undefined,
  patch: Partial<RenderSelection>
): RenderSelection => ({
  profileId: patch.profileId ?? current?.profileId,
  overrides: patch.overrides ?? current?.overrides
});
