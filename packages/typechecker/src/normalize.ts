import { createV03Diagnostic } from "@chemd/diagnostics";
import type { V03Diagnostic } from "@chemd/diagnostics";

import type {
  AnalysisTypeLabel,
  AnalysisTypeValue,
  AtmosphereLabel,
  AtmosphereValue,
  QuantityClass,
  QuantityParseContext,
  QuantityType,
  StatusLabel
} from "./types";

interface ParsedUnit {
  unit: string;
  factor: number;
  canonicalUnit: string;
}

const UNIT_TABLE: Record<QuantityClass, Record<string, ParsedUnit>> = {
  amount: {
    mmol: { unit: "mmol", factor: 1, canonicalUnit: "mmol" },
    mol: { unit: "mol", factor: 1000, canonicalUnit: "mmol" }
  },
  mass: {
    mg: { unit: "mg", factor: 1, canonicalUnit: "mg" },
    g: { unit: "g", factor: 1000, canonicalUnit: "mg" },
    kg: { unit: "kg", factor: 1000000, canonicalUnit: "mg" }
  },
  volume: {
    ml: { unit: "mL", factor: 1, canonicalUnit: "mL" },
    l: { unit: "L", factor: 1000, canonicalUnit: "mL" }
  },
  temperature: {
    c: { unit: "C", factor: 1, canonicalUnit: "C" },
    "°c": { unit: "°C", factor: 1, canonicalUnit: "C" },
    "℃": { unit: "℃", factor: 1, canonicalUnit: "C" },
    k: { unit: "K", factor: 1, canonicalUnit: "K" },
    f: { unit: "F", factor: 1, canonicalUnit: "F" }
  },
  time: {
    h: { unit: "h", factor: 1, canonicalUnit: "h" },
    hr: { unit: "hr", factor: 1, canonicalUnit: "h" },
    hrs: { unit: "hrs", factor: 1, canonicalUnit: "h" },
    min: { unit: "min", factor: 1 / 60, canonicalUnit: "h" },
    mins: { unit: "mins", factor: 1 / 60, canonicalUnit: "h" },
    "分钟": { unit: "分钟", factor: 1 / 60, canonicalUnit: "h" },
    "小时": { unit: "小时", factor: 1, canonicalUnit: "h" }
  },
  pressure: {
    bar: { unit: "bar", factor: 1, canonicalUnit: "bar" },
    atm: { unit: "atm", factor: 1.01325, canonicalUnit: "bar" },
    psi: { unit: "psi", factor: 0.0689476, canonicalUnit: "bar" }
  },
  concentration: {
    m: { unit: "M", factor: 1, canonicalUnit: "M" },
    mm: { unit: "mM", factor: 0.001, canonicalUnit: "M" }
  },
  equivalent: {
    equiv: { unit: "equiv", factor: 1, canonicalUnit: "equiv" },
    eq: { unit: "eq", factor: 1, canonicalUnit: "equiv" }
  },
  percent: {
    "%": { unit: "%", factor: 1, canonicalUnit: "percent" },
    percent: { unit: "percent", factor: 1, canonicalUnit: "percent" }
  }
};

const STATUS_ALIASES: Record<string, StatusLabel> = {
  success: "success",
  complete: "success",
  completed: "success",
  done: "success",
  partial: "partial",
  partial_conversion: "partial",
  failed: "failed",
  fail: "failed",
  unknown: "unknown"
};

const ANALYSIS_TYPE_ALIASES: Record<string, AnalysisTypeLabel> = {
  tlc: "tlc",
  nmr: "nmr",
  hplc: "hplc",
  lcms: "lcms",
  "lc-ms": "lcms",
  gcms: "gcms",
  "gc-ms": "gcms"
};

const ATMOSPHERE_ALIASES: Record<string, AtmosphereLabel> = {
  n2: "nitrogen",
  nitrogen: "nitrogen",
  argon: "argon",
  ar: "argon",
  air: "air",
  oxygen: "oxygen",
  o2: "oxygen",
  inert: "inert"
};

const normalizeUnitKey = (unit: string): string =>
  unit.trim().replace(/\s+/g, "").toLowerCase();

const normalizeTokenKey = (raw: string): string =>
  raw.trim().replace(/\s+/g, "-").toLowerCase();

const normalizeBoundedString = <KnownValue extends string>(
  raw: string | undefined,
  aliases: Record<string, KnownValue>
): { kind: "known" | "extension"; raw: string; value: KnownValue | string } | undefined => {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  const value = aliases[normalizeTokenKey(trimmed)];
  return {
    kind: value ? "known" : "extension",
    raw: trimmed,
    value: value ?? trimmed
  };
};

const createQuantityDiagnostic = (
  raw: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E403",
    severity: "error",
    message: `Unable to parse ${context.field} as ${quantityClass}: ${raw}`,
    sourceLayer: "typechecker",
    sourceNodeType: context.sourceNodeType,
    sourceNodeId: context.sourceNodeId,
    sourceField: context.field,
    facts: {
      field: context.field,
      raw_value: raw,
      expected_quantity_class: quantityClass
    }
  });

const createPercentDiagnostic = (
  raw: string,
  context: QuantityParseContext
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E402",
    severity: "error",
    message: `Percent value is outside the expected 0-100 range: ${raw}`,
    sourceLayer: "typechecker",
    sourceNodeType: context.sourceNodeType,
    sourceNodeId: context.sourceNodeId,
    sourceField: context.field,
    facts: { field: context.field, raw_value: raw }
  });

export const parseQuantity = (
  raw: string | undefined,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): { quantity?: QuantityType; diagnostic?: V03Diagnostic } => {
  if (!raw) {
    return {};
  }

  const normalizedRaw = raw.trim();
  const match = normalizedRaw.match(/^(-?\d+(?:\.\d+)?)\s*(°\s*C|℃|[a-zA-Z%]+)$/);
  if (!match) {
    return {
      quantity: createRawQuantity(normalizedRaw, quantityClass, context),
      diagnostic: createQuantityDiagnostic(normalizedRaw, quantityClass, context)
    };
  }

  return parseMatchedQuantity(normalizedRaw, Number(match[1]), match[2], quantityClass, context);
};

const parseMatchedQuantity = (
  raw: string,
  value: number,
  rawUnit: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): { quantity: QuantityType; diagnostic?: V03Diagnostic } => {
  const unit = UNIT_TABLE[quantityClass][normalizeUnitKey(rawUnit)];
  if (!unit) {
    return {
      quantity: createRawQuantity(raw, quantityClass, context),
      diagnostic: createQuantityDiagnostic(raw, quantityClass, context)
    };
  }

  const quantity = createNormalizedQuantity(raw, value, unit, quantityClass, context);
  const diagnostic = quantityClass === "percent" && (value < 0 || value > 100)
    ? createPercentDiagnostic(raw, context)
    : undefined;

  return diagnostic ? { quantity, diagnostic } : { quantity };
};

const createRawQuantity = (
  raw: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): QuantityType => ({
  kind: "quantity",
  quantityClass,
  raw,
  sourceNodeId: context.sourceNodeId,
  sourceField: context.field
});

const createNormalizedQuantity = (
  raw: string,
  value: number,
  unit: ParsedUnit,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): QuantityType => ({
  ...createRawQuantity(raw, quantityClass, context),
  value,
  unit: unit.unit,
  canonicalValue: value * unit.factor,
  canonicalUnit: unit.canonicalUnit
});

export const normalizeStatus = (
  raw: string | undefined,
  context: Omit<QuantityParseContext, "field">
): { status?: StatusLabel; diagnostic?: V03Diagnostic } => {
  if (!raw) {
    return {};
  }

  const status = STATUS_ALIASES[raw.trim().toLowerCase()];
  if (status) {
    return { status };
  }

  return {
    status: "unknown",
    diagnostic: createV03Diagnostic({
      code: "E306",
      severity: "error",
      message: `Invalid result status value: ${raw}`,
      sourceLayer: "typechecker",
      sourceNodeType: context.sourceNodeType,
      sourceNodeId: context.sourceNodeId,
      sourceField: "status",
      facts: { field: "status", raw_value: raw }
    })
  };
};

export const normalizeAnalysisType = (raw: string | undefined): AnalysisTypeValue | undefined =>
  normalizeBoundedString(raw, ANALYSIS_TYPE_ALIASES);

export const normalizeAtmosphere = (raw: string | undefined): AtmosphereValue | undefined =>
  normalizeBoundedString(raw, ATMOSPHERE_ALIASES);
