import {
  RENDER_OVERRIDE_FIELD_ALLOWLIST,
  getRenderOverrideValueHint,
  isKnownRenderOverridePath,
  isValidRenderOverrideValue
} from "@chemd/core";
import type { Diagnostic, RenderSelection } from "@chemd/core";

export interface RenderOptions {
  profileId: string;
  structure: {
    bondLength: number;
    bondLineWidth: number;
    multipleBondOffset: number;
    hashSpacing: number;
    fontSize: number;
    atomLabelPadding: number;
    monochrome: boolean;
    backgroundColor: string;
  };
  reaction: {
    arrowLength: number;
    componentGap: number;
    plusGap: number;
    showConditionsBelowArrow: boolean;
  };
  export: {
    imageFormat: "svg" | "png";
    margin: number;
    dpi: number;
    transparentBackground: boolean;
  };
}

export interface RdkitAdapterOptions {
  fixedBondLength: number;
  bondLineWidth: number;
  multipleBondOffset: number;
  hashSpacing: number;
  fixedFontSize: number;
  atomLabelPadding: number;
  monochrome: boolean;
  backgroundColor: string;
  reactionArrowLength: number;
  reactionComponentGap: number;
  reactionPlusGap: number;
  showConditionsBelowArrow: boolean;
  imageFormat: "svg" | "png";
  margin: number;
  dpi: number;
  transparentBackground: boolean;
}

export interface RenderAdapterPayload {
  rdkit: RdkitAdapterOptions;
}

export type RenderProfileDefinition = Omit<RenderOptions, "profileId"> & {
  extends?: string;
  description?: string;
};

export type RenderProfileRegistry = Record<string, RenderProfileDefinition>;

export interface RenderProfileResolution {
  options: RenderOptions;
  diagnostics: Diagnostic[];
}

type RenderSectionName = keyof Omit<RenderOptions, "profileId">;

const DEFAULT_PROFILE_ID = "eln-default";
const TOP_LEVEL_KEYS = new Set(["extends", "description", "structure", "reaction", "export"]);

export type RenderNumericPath =
  | "structure.bondLength"
  | "structure.bondLineWidth"
  | "structure.multipleBondOffset"
  | "structure.hashSpacing"
  | "structure.fontSize"
  | "structure.atomLabelPadding"
  | "reaction.arrowLength"
  | "reaction.componentGap"
  | "reaction.plusGap"
  | "export.margin"
  | "export.dpi";

export interface RenderNumericRule {
  min: number;
  max: number;
  unit: "px" | "ratio" | "dpi";
}

export const RENDER_PROFILE_NUMERIC_SCHEMA: Record<RenderNumericPath, RenderNumericRule> = {
  "structure.bondLength": { min: 4, max: 80, unit: "px" },
  "structure.bondLineWidth": { min: 0.6, max: 6, unit: "px" },
  "structure.multipleBondOffset": { min: 0, max: 0.5, unit: "ratio" },
  "structure.hashSpacing": { min: 0.5, max: 6, unit: "px" },
  "structure.fontSize": { min: 6, max: 24, unit: "px" },
  "structure.atomLabelPadding": { min: 0, max: 4, unit: "px" },
  "reaction.arrowLength": { min: 24, max: 180, unit: "px" },
  "reaction.componentGap": { min: 0, max: 64, unit: "px" },
  "reaction.plusGap": { min: 0, max: 64, unit: "px" },
  "export.margin": { min: 0, max: 64, unit: "px" },
  "export.dpi": { min: 72, max: 2400, unit: "dpi" }
};

const RENDER_PROFILE_NUMERIC_ENTRIES = Object.entries(RENDER_PROFILE_NUMERIC_SCHEMA) as Array<[
  RenderNumericPath,
  RenderNumericRule
]>;


export const BUILTIN_RENDER_PROFILES: RenderProfileRegistry = {
  base: {
    structure: {
      bondLength: 26,
      bondLineWidth: 1.6,
      multipleBondOffset: 0.15,
      hashSpacing: 2,
      fontSize: 11,
      atomLabelPadding: 0,
      monochrome: false,
      backgroundColor: "#ffffff"
    },
    reaction: {
      arrowLength: 48,
      componentGap: 24,
      plusGap: 20,
      showConditionsBelowArrow: true
    },
    export: {
      imageFormat: "svg",
      margin: 8,
      dpi: 300,
      transparentBackground: false
    }
  },
  "eln-default": {
    extends: "base",
    structure: {
      bondLength: 28,
      bondLineWidth: 1.8,
      multipleBondOffset: 0.15,
      hashSpacing: 2,
      fontSize: 11,
      atomLabelPadding: 0,
      monochrome: false,
      backgroundColor: "#ffffff"
    },
    reaction: {
      arrowLength: 48,
      componentGap: 24,
      plusGap: 20,
      showConditionsBelowArrow: true
    },
    export: {
      imageFormat: "svg",
      margin: 8,
      dpi: 300,
      transparentBackground: false
    }
  },
  "publication-acs": {
    extends: "eln-default",
    structure: {
      bondLength: 32,
      bondLineWidth: 1.4,
      multipleBondOffset: 0.18,
      hashSpacing: 2.2,
      fontSize: 10,
      atomLabelPadding: 0,
      monochrome: true,
      backgroundColor: "#ffffff"
    },
    reaction: {
      arrowLength: 48,
      componentGap: 24,
      plusGap: 20,
      showConditionsBelowArrow: true
    },
    export: {
      imageFormat: "svg",
      margin: 12,
      dpi: 600,
      transparentBackground: false
    }
  },
  "slides-large": {
    extends: "eln-default",
    description: "Large-display presentation style",
    structure: {
      bondLength: 34,
      bondLineWidth: 2.4,
      multipleBondOffset: 0.18,
      hashSpacing: 2.4,
      fontSize: 14,
      atomLabelPadding: 0,
      monochrome: false,
      backgroundColor: "#ffffff"
    },
    reaction: {
      arrowLength: 64,
      componentGap: 28,
      plusGap: 24,
      showConditionsBelowArrow: true
    },
    export: {
      imageFormat: "svg",
      margin: 10,
      dpi: 300,
      transparentBackground: false
    }
  }
};

const createFallbackBaseOptions = (profileId: string): RenderOptions => ({
  profileId,
  structure: { ...BUILTIN_RENDER_PROFILES.base.structure },
  reaction: { ...BUILTIN_RENDER_PROFILES.base.reaction },
  export: { ...BUILTIN_RENDER_PROFILES.base.export }
});

const createValidationDiagnostic = (
  code: string,
  severity: Diagnostic["severity"],
  message: string
): Diagnostic => ({
  code,
  severity,
  message,
  sourceLayer: "render-profile"
});

const validateSection = <TSection extends RenderOptions[RenderSectionName]>(
  sectionName: RenderSectionName,
  rawSection: unknown,
  baseSection: TSection,
  diagnostics: Diagnostic[]
): TSection => {
  const nextSection = { ...baseSection };

  if (rawSection === undefined) {
    return nextSection;
  }

  if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) {
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        `Invalid render profile value at ${sectionName}: expected an object`
      )
    );
    return nextSection;
  }

  const sectionRecord = rawSection as Record<string, unknown>;
  const allowedKeys = new Set(RENDER_OVERRIDE_FIELD_ALLOWLIST[sectionName] as readonly string[]);

  for (const key of Object.keys(sectionRecord)) {
    if (!allowedKeys.has(key)) {
      diagnostics.push(
        createValidationDiagnostic(
          "W_UNKNOWN_RENDER_PROFILE_FIELD",
          "error",
          `Unknown render profile field: ${sectionName}.${key}`
        )
      );
    }
  }

  for (const key of allowedKeys) {
    if (!(key in sectionRecord)) {
      continue;
    }

    const value = sectionRecord[key];
    const path = `${sectionName}.${key}`;

    if (!isValidRenderOverrideValue(path, value)) {
      const valueHint = getRenderOverrideValueHint(path);
      diagnostics.push(
        createValidationDiagnostic(
          "E_INVALID_RENDER_PROFILE_VALUE",
          "error",
          `Invalid render profile value at ${path}${valueHint ? `: expected ${valueHint}` : ""}`
        )
      );
      continue;
    }

    (nextSection as Record<string, unknown>)[key] = value;
  }
  return nextSection;
};

const applyOverride = (
  options: RenderOptions,
  path: string,
  value: unknown,
  diagnostics: Diagnostic[]
) => {
  if (!isKnownRenderOverridePath(path)) {
    diagnostics.push(
      createValidationDiagnostic(
        "W_UNKNOWN_RENDER_PROFILE_FIELD",
        "error",
        `Unknown render profile field: ${path}`
      )
    );
    return;
  }

  if (!isValidRenderOverrideValue(path, value)) {
    const valueHint = getRenderOverrideValueHint(path);
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        `Invalid render profile value at ${path}${valueHint ? `: expected ${valueHint}` : ""}`
      )
    );
    return;
  }

  const [sectionName, fieldName] = path.split(".") as [RenderSectionName, string];
  (options[sectionName] as Record<string, unknown>)[fieldName] = value;
};
const applyRenderOverrides = (
  options: RenderOptions,
  overrides: Record<string, unknown> | undefined,
  diagnostics: Diagnostic[]
): RenderOptions => {
  if (!overrides) {
    return options;
  }

  const nextOptions: RenderOptions = {
    ...options,
    structure: { ...options.structure },
    reaction: { ...options.reaction },
    export: { ...options.export }
  };

  for (const [path, value] of Object.entries(overrides)) {
    applyOverride(nextOptions, path, value, diagnostics);
  }

  return nextOptions;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const getNumericUnitSuffix = (unit: RenderNumericRule["unit"]): string =>
  unit === "ratio" ? " (ratio)" : ` ${unit}`;

const readNumericOptionValue = (options: RenderOptions, path: RenderNumericPath): number => {
  const [sectionName, fieldName] = path.split(".") as [RenderSectionName, string];
  return (options[sectionName] as unknown as Record<string, number>)[fieldName];
};

const writeNumericOptionValue = (
  options: RenderOptions,
  path: RenderNumericPath,
  value: number
): void => {
  const [sectionName, fieldName] = path.split(".") as [RenderSectionName, string];
  (options[sectionName] as unknown as Record<string, number>)[fieldName] = value;
};

const enforceNumericRange = (
  path: RenderNumericPath,
  value: number,
  rule: RenderNumericRule,
  setValue: (nextValue: number) => void,
  diagnostics: Diagnostic[]
) => {
  if (value >= rule.min && value <= rule.max) {
    return;
  }

  const clamped = clampNumber(value, rule.min, rule.max);
  setValue(clamped);
  diagnostics.push(
    createValidationDiagnostic(
      "E_INVALID_RENDER_PROFILE_VALUE",
      "error",
      `Invalid render profile value at ${path}: expected ${rule.min}..${rule.max}${getNumericUnitSuffix(rule.unit)}`
    )
  );
};

const applyRenderConstraints = (options: RenderOptions, diagnostics: Diagnostic[]): RenderOptions => {
  const nextOptions: RenderOptions = {
    ...options,
    structure: { ...options.structure },
    reaction: { ...options.reaction },
    export: { ...options.export }
  };

  for (const [path, rule] of RENDER_PROFILE_NUMERIC_ENTRIES) {
    const currentValue = readNumericOptionValue(nextOptions, path);
    enforceNumericRange(
      path,
      currentValue,
      rule,
      (value) => {
        writeNumericOptionValue(nextOptions, path, value);
      },
      diagnostics
    );
  }

  if (nextOptions.structure.bondLineWidth >= nextOptions.structure.bondLength) {
    nextOptions.structure.bondLineWidth = clampNumber(nextOptions.structure.bondLength * 0.25, 0.6, 6);
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        "Invalid render profile value at structure.bondLineWidth: must be smaller than structure.bondLength"
      )
    );
  }

  if (nextOptions.reaction.plusGap > nextOptions.reaction.componentGap) {
    nextOptions.reaction.plusGap = nextOptions.reaction.componentGap;
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        "Invalid render profile value at reaction.plusGap: must be <= reaction.componentGap"
      )
    );
  }

  const maxLabelPadding = nextOptions.structure.fontSize * 0.5;
  if (nextOptions.structure.atomLabelPadding > maxLabelPadding) {
    nextOptions.structure.atomLabelPadding = maxLabelPadding;
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        "Invalid render profile value at structure.atomLabelPadding: must be <= structure.fontSize * 0.5"
      )
    );
  }

  if (nextOptions.export.imageFormat === "png" && nextOptions.export.dpi < 150) {
    nextOptions.export.dpi = 150;
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        "Invalid render profile value at export.dpi: PNG export requires dpi >= 150"
      )
    );
  }

  return nextOptions;
};

const cloneRenderOptions = (options: RenderOptions): RenderOptions => ({
  profileId: options.profileId,
  structure: { ...options.structure },
  reaction: { ...options.reaction },
  export: { ...options.export }
});

export const sanitizeRenderOptions = (options: RenderOptions): RenderOptions =>
  applyRenderConstraints(cloneRenderOptions(options), []);

const resolveProfileOrUndefined = (
  profileId: string,
  registry: RenderProfileRegistry,
  diagnostics: Diagnostic[],
  visited = new Set<string>()
): RenderOptions | undefined => {
  if (visited.has(profileId)) {
    diagnostics.push({
      code: "E_RENDER_PROFILE_CYCLE",
      severity: "error",
      message: `Render profile inheritance cycle detected at "${profileId}"`
    });
    return undefined;
  }

  const profile = registry[profileId] as Record<string, unknown> | undefined;

  if (!profile) {
    diagnostics.push({
      code: "W_UNKNOWN_RENDER_PROFILE",
      severity: "error",
      message: `Unknown render profile: ${profileId}`,
      sourceLayer: "render-profile"
    });
    return undefined;
  }

  visited.add(profileId);

  const extendsProfileId = typeof profile.extends === "string" ? profile.extends : undefined;
  if (profile.extends !== undefined && typeof profile.extends !== "string") {
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        `Invalid render profile value at ${profileId}.extends`
      )
    );
  }

  if (profile.description !== undefined && typeof profile.description !== "string") {
    diagnostics.push(
      createValidationDiagnostic(
        "E_INVALID_RENDER_PROFILE_VALUE",
        "error",
        `Invalid render profile value at ${profileId}.description`
      )
    );
  }

  const parent = extendsProfileId
    ? resolveProfileOrUndefined(extendsProfileId, registry, diagnostics, visited)
    : undefined;

  visited.delete(profileId);

  if (extendsProfileId && !parent) {
    return undefined;
  }

  for (const key of Object.keys(profile)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      diagnostics.push(
        createValidationDiagnostic(
          "W_UNKNOWN_RENDER_PROFILE_FIELD",
          "error",
          `Unknown render profile field: ${key}`
        )
      );
    }
  }

  const baseOptions = parent ?? createFallbackBaseOptions(profileId);

  return {
    profileId,
    structure: validateSection("structure", profile.structure, baseOptions.structure, diagnostics),
    reaction: validateSection("reaction", profile.reaction, baseOptions.reaction, diagnostics),
    export: validateSection("export", profile.export, baseOptions.export, diagnostics)
  };
};

const resolveBuiltinDefaultProfile = (): RenderOptions => {
  const diagnostics: Diagnostic[] = [];
  const options = resolveProfileOrUndefined(DEFAULT_PROFILE_ID, BUILTIN_RENDER_PROFILES, diagnostics);

  if (!options) {
    throw new Error("Failed to resolve built-in default render profile");
  }

  return options;
};

export const resolveRenderProfileWithDiagnostics = (
  selection?: RenderSelection,
  registry: RenderProfileRegistry = BUILTIN_RENDER_PROFILES
): RenderProfileResolution => {
  const diagnostics: Diagnostic[] = [];
  const requestedProfileId = selection?.profileId ?? DEFAULT_PROFILE_ID;
  const resolvedOptions = resolveProfileOrUndefined(requestedProfileId, registry, diagnostics);
  const optionsWithOverrides = applyRenderOverrides(
    resolvedOptions ?? resolveBuiltinDefaultProfile(),
    selection?.overrides,
    diagnostics
  );
  const options = applyRenderConstraints(optionsWithOverrides, diagnostics);

  return {
    options,
    diagnostics
  };
};

export const resolveRenderProfile = (
  selection?: RenderSelection,
  registry?: RenderProfileRegistry
): RenderOptions => resolveRenderProfileWithDiagnostics(selection, registry).options;

export const mapRenderOptionsToAdapterPayload = (options: RenderOptions): RenderAdapterPayload => {
  const sanitizedOptions = sanitizeRenderOptions(options);

  return {
    rdkit: {
      fixedBondLength: sanitizedOptions.structure.bondLength,
      bondLineWidth: sanitizedOptions.structure.bondLineWidth,
      multipleBondOffset: sanitizedOptions.structure.multipleBondOffset,
      hashSpacing: sanitizedOptions.structure.hashSpacing,
      fixedFontSize: sanitizedOptions.structure.fontSize,
      atomLabelPadding: sanitizedOptions.structure.atomLabelPadding,
      monochrome: sanitizedOptions.structure.monochrome,
      backgroundColor: sanitizedOptions.structure.backgroundColor,
      reactionArrowLength: sanitizedOptions.reaction.arrowLength,
      reactionComponentGap: sanitizedOptions.reaction.componentGap,
      reactionPlusGap: sanitizedOptions.reaction.plusGap,
      showConditionsBelowArrow: sanitizedOptions.reaction.showConditionsBelowArrow,
      imageFormat: sanitizedOptions.export.imageFormat,
      margin: sanitizedOptions.export.margin,
      dpi: sanitizedOptions.export.dpi,
      transparentBackground: sanitizedOptions.export.transparentBackground
    }
  };
};

const isAdapterPayloadRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const ADAPTER_TO_RENDER_PATH = {
  fixedBondLength: "structure.bondLength",
  bondLineWidth: "structure.bondLineWidth",
  multipleBondOffset: "structure.multipleBondOffset",
  hashSpacing: "structure.hashSpacing",
  fixedFontSize: "structure.fontSize",
  atomLabelPadding: "structure.atomLabelPadding",
  monochrome: "structure.monochrome",
  backgroundColor: "structure.backgroundColor",
  reactionArrowLength: "reaction.arrowLength",
  reactionComponentGap: "reaction.componentGap",
  reactionPlusGap: "reaction.plusGap",
  showConditionsBelowArrow: "reaction.showConditionsBelowArrow",
  imageFormat: "export.imageFormat",
  margin: "export.margin",
  dpi: "export.dpi",
  transparentBackground: "export.transparentBackground"
} satisfies Record<keyof RdkitAdapterOptions, `${RenderSectionName}.${string}`>;

const applyAdapterValue = (
  options: RenderOptions,
  key: keyof RdkitAdapterOptions,
  value: unknown
): void => {
  const path = ADAPTER_TO_RENDER_PATH[key];
  if (!isValidRenderOverrideValue(path, value)) {
    return;
  }

  // Adapter 使用 RDKit 字段名，写回前统一走 render override schema 校验。
  const [sectionName, fieldName] = path.split(".") as [RenderSectionName, string];
  (options[sectionName] as Record<string, unknown>)[fieldName] = value;
};

export const sanitizeRenderAdapterPayload = (
  payload: unknown,
  fallbackOptions: RenderOptions
): RenderAdapterPayload => {
  const nextOptions = sanitizeRenderOptions(fallbackOptions);

  if (!isAdapterPayloadRecord(payload) || !isAdapterPayloadRecord(payload.rdkit)) {
    return mapRenderOptionsToAdapterPayload(nextOptions);
  }

  for (const key of Object.keys(ADAPTER_TO_RENDER_PATH) as Array<keyof RdkitAdapterOptions>) {
    applyAdapterValue(nextOptions, key, payload.rdkit[key]);
  }

  return mapRenderOptionsToAdapterPayload(nextOptions);
};




