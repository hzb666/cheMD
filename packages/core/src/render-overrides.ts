const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPositiveNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value > 0;

const isNonNegativeNumber = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= 0;

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const isImageFormat = (value: unknown): value is "svg" | "png" =>
  value === "svg" || value === "png";

const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);

const RENDER_OVERRIDE_KEY_PATTERN = /^(structure|reaction|export)\.[a-zA-Z][a-zA-Z0-9_]*$/;

export const RENDER_OVERRIDE_FIELD_ALLOWLIST = {
  structure: [
    "bondLength",
    "bondLineWidth",
    "multipleBondOffset",
    "hashSpacing",
    "fontSize",
    "atomLabelPadding",
    "monochrome",
    "backgroundColor"
  ],
  reaction: ["arrowLength", "componentGap", "plusGap", "showConditionsBelowArrow"],
  export: ["imageFormat", "margin", "dpi", "transparentBackground"]
} as const;

export type RenderOverrideSection = keyof typeof RENDER_OVERRIDE_FIELD_ALLOWLIST;

const buildRenderOverridePathSet = () => {
  const paths = new Set<string>();

  for (const [section, fields] of Object.entries(RENDER_OVERRIDE_FIELD_ALLOWLIST) as Array<[
    RenderOverrideSection,
    readonly string[]
  ]>) {
    for (const field of fields) {
      paths.add(`${section}.${field}`);
    }
  }

  return paths;
};

const RENDER_OVERRIDE_PATH_SET = buildRenderOverridePathSet();

export const isRenderOverridePathFormat = (path: string): boolean =>
  RENDER_OVERRIDE_KEY_PATTERN.test(path);

export const isKnownRenderOverridePath = (path: string): boolean => {
  if (!isRenderOverridePathFormat(path)) {
    return false;
  }

  return RENDER_OVERRIDE_PATH_SET.has(path);
};

const RENDER_OVERRIDE_VALUE_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  "structure.bondLength": isPositiveNumber,
  "structure.bondLineWidth": isPositiveNumber,
  "structure.multipleBondOffset": isNonNegativeNumber,
  "structure.hashSpacing": isNonNegativeNumber,
  "structure.fontSize": isPositiveNumber,
  "structure.atomLabelPadding": isNonNegativeNumber,
  "structure.monochrome": isBoolean,
  "structure.backgroundColor": isHexColor,
  "reaction.arrowLength": isPositiveNumber,
  "reaction.componentGap": isNonNegativeNumber,
  "reaction.plusGap": isNonNegativeNumber,
  "reaction.showConditionsBelowArrow": isBoolean,
  "export.imageFormat": isImageFormat,
  "export.margin": isNonNegativeNumber,
  "export.dpi": isPositiveNumber,
  "export.transparentBackground": isBoolean
};

const RENDER_OVERRIDE_VALUE_HINTS: Record<string, string> = {
  "structure.bondLength": "number > 0",
  "structure.bondLineWidth": "number > 0",
  "structure.multipleBondOffset": "number >= 0",
  "structure.hashSpacing": "number >= 0",
  "structure.fontSize": "number > 0",
  "structure.atomLabelPadding": "number >= 0",
  "structure.monochrome": "boolean",
  "structure.backgroundColor": "hex color string",
  "reaction.arrowLength": "number > 0",
  "reaction.componentGap": "number >= 0",
  "reaction.plusGap": "number >= 0",
  "reaction.showConditionsBelowArrow": "boolean",
  "export.imageFormat": '"svg" | "png"',
  "export.margin": "number >= 0",
  "export.dpi": "number > 0",
  "export.transparentBackground": "boolean"
};

export const isValidRenderOverrideValue = (path: string, value: unknown): boolean => {
  if (!isKnownRenderOverridePath(path)) {
    return false;
  }

  const validator = RENDER_OVERRIDE_VALUE_VALIDATORS[path];
  return validator ? validator(value) : false;
};

export const getRenderOverrideValueHint = (path: string): string | undefined =>
  RENDER_OVERRIDE_VALUE_HINTS[path];
