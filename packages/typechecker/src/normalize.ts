import { createV03Diagnostic } from "@chemd/diagnostics";
import type { V03Diagnostic } from "@chemd/diagnostics";
import {
  getQuantityUnit,
  normalizeQuantityUnitKey,
  type QuantityComparator,
  type QuantityUnitSchema
} from "@chemd/core";

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
  uplc: "uplc",
  gc: "gc",
  lcms: "lcms",
  "lc-ms": "lcms",
  gcms: "gcms",
  "gc-ms": "gcms",
  ms: "ms",
  hrms: "hrms",
  ir: "ir",
  uv: "uv",
  "uv-vis": "uv"
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

const normalizeTokenKey = (raw: string): string =>
  raw.trim().replace(/\s+/g, "-").toLowerCase();

const NUMBER_PATTERN = "-?\\d+(?:\\.\\d+)?";
const UNIT_PATTERN = "(?:°\\s*C|℃|[a-zA-Z]+(?:\\s*/\\s*[a-zA-Z%]+|\\s*%)?|%)";
const COMPACT_UNIT_PATTERN = "(?:°\\s*C|℃|[a-zA-Z]+(?:[/][a-zA-Z%]+)?|%)";
const SCALAR_PATTERN = new RegExp(`^(${NUMBER_PATTERN})\\s+(${UNIT_PATTERN})$`);
const COMPACT_SCALAR_PATTERN = new RegExp(`^(${NUMBER_PATTERN})(${COMPACT_UNIT_PATTERN})$`);

const normalizeTemperatureShorthand = (raw: string): "room_temperature" | undefined =>
  raw.trim().replace(/\s+/g, "").replace(/\./g, "").toLowerCase() === "rt"
    ? "room_temperature"
    : undefined;

const isOvernight = (raw: string): boolean => raw.trim().toLowerCase() === "overnight";

const parseComparator = (raw: string): { comparator?: QuantityComparator; value: string } => {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(<=|>=|<|>|=|~|≈|approx\.?|ca\.?)\s*(.+)$/i);
  if (!match) {
    return { value: trimmed };
  }

  const token = match[1].toLowerCase();
  return {
    comparator: token === "~" || token === "≈" || token.startsWith("approx") || token.startsWith("ca")
      ? "approx"
      : token as QuantityComparator,
    value: match[2].trim()
  };
};

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
  context: QuantityParseContext,
  message = `Unable to parse ${context.field} as ${quantityClass}: ${raw}`
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E403",
    severity: "error",
    message,
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

const createUnitCasingDiagnostic = (
  rawUnit: string,
  canonicalUnit: string,
  context: QuantityParseContext
): V03Diagnostic =>
  createV03Diagnostic({
    code: "W_QUANTITY_UNIT_CASING",
    severity: "warning",
    message: `Use canonical unit casing "${canonicalUnit}" instead of "${rawUnit}"`,
    sourceLayer: "typechecker",
    sourceNodeType: context.sourceNodeType,
    sourceNodeId: context.sourceNodeId,
    sourceField: context.field,
    facts: { field: context.field, raw_unit: rawUnit, canonical_unit: canonicalUnit }
  });

export const parseQuantity = (
  raw: string | undefined,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): { quantity?: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } => {
  if (!raw) {
    return {};
  }

  const normalizedRaw = raw.trim();
  const shorthand = parseShorthandQuantity(normalizedRaw, quantityClass, context);
  if (shorthand) {
    return shorthand;
  }

  if (quantityClass === "temperature" && isTemperatureProgram(normalizedRaw)) {
    return parseTemperatureProgram(normalizedRaw, context);
  }

  const comparatorResult = parseComparator(normalizedRaw);
  const range = parseRangeQuantity(comparatorResult.value, quantityClass, context, comparatorResult.comparator);
  if (range) {
    return range;
  }

  const uncertainty = parseUncertaintyQuantity(
    comparatorResult.value,
    quantityClass,
    context,
    comparatorResult.comparator
  );
  if (uncertainty) {
    return uncertainty;
  }

  const unitlessEquivalent = parseUnitlessEquivalentQuantity(
    comparatorResult.value,
    quantityClass,
    context,
    comparatorResult.comparator
  );
  if (unitlessEquivalent) {
    return unitlessEquivalent;
  }

  const compactMatch = comparatorResult.value.match(COMPACT_SCALAR_PATTERN);
  const match = comparatorResult.value.match(SCALAR_PATTERN);
  if (!match && !compactMatch && quantityClass === "ph") {
    return parsePhQuantity(comparatorResult.value, context, comparatorResult.comparator);
  }

  if (!match && !compactMatch) {
    const quantity = createRawQuantity(normalizedRaw, quantityClass, context);
    return {
      quantity,
      diagnostic: createQuantityDiagnostic(normalizedRaw, quantityClass, context)
    };
  }

  const parsed = parseMatchedQuantity(
    normalizedRaw,
    Number((match ?? compactMatch)?.[1]),
    (match ?? compactMatch)?.[2] ?? "",
    quantityClass,
    context,
    comparatorResult.comparator
  );
  if (compactMatch) {
    const missingSpace = createQuantityDiagnostic(
      normalizedRaw,
      quantityClass,
      context,
      `Missing space between value and unit in ${context.field}: ${normalizedRaw}`
    );
    return mergeQuantityDiagnostics(parsed.quantity, [missingSpace, ...readDiagnostics(parsed)]);
  }

  return parsed;
};

const parseMatchedQuantity = (
  raw: string,
  value: number,
  rawUnit: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext,
  comparator?: QuantityComparator
): { quantity: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } => {
  const unit = getQuantityUnit(quantityClass, rawUnit);
  if (!unit) {
    return {
      quantity: createRawQuantity(raw, quantityClass, context),
      diagnostic: createQuantityDiagnostic(raw, quantityClass, context)
    };
  }

  const quantity = createNormalizedQuantity(raw, value, unit, quantityClass, context, comparator);
  const diagnostics = [
    ...createUnitDiagnostics(rawUnit, unit, context),
    ...(quantityClass === "percent" && (value < 0 || value > 100)
      ? [createPercentDiagnostic(raw, context)]
      : [])
  ];

  return mergeQuantityDiagnostics(quantity, diagnostics);
};

const readDiagnostics = (
  result: { diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] }
): V03Diagnostic[] => result.diagnostics ?? (result.diagnostic ? [result.diagnostic] : []);

const mergeQuantityDiagnostics = (
  quantity: QuantityType,
  diagnostics: V03Diagnostic[]
): { quantity: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } => {
  if (diagnostics.length === 0) {
    return { quantity };
  }

  return {
    quantity,
    diagnostic: diagnostics[0],
    diagnostics
  };
};

const createUnitDiagnostics = (
  rawUnit: string,
  unit: QuantityUnitSchema,
  context: QuantityParseContext
): V03Diagnostic[] => {
  const normalizedRaw = normalizeQuantityUnitKey(rawUnit);
  const normalizedCanonical = normalizeQuantityUnitKey(unit.unit);
  return normalizedRaw === normalizedCanonical && rawUnit.trim() !== unit.unit
    ? [createUnitCasingDiagnostic(rawUnit.trim(), unit.unit, context)]
    : [];
};

const parseShorthandQuantity = (
  raw: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext
): { quantity: QuantityType } | undefined => {
  const roomTemperature = quantityClass === "temperature" ? normalizeTemperatureShorthand(raw) : undefined;
  if (roomTemperature) {
    return {
      quantity: {
        ...createRawQuantity(raw, quantityClass, context),
        valueKind: "shorthand",
        shorthand: roomTemperature,
        canonicalUnit: "C",
        normalizedText: "room temperature",
        provenance: createQuantityProvenance(context, "quantity.room_temperature")
      }
    };
  }

  if (quantityClass === "time" && isOvernight(raw)) {
    return {
      quantity: {
        ...createRawQuantity(raw, quantityClass, context),
        valueKind: "shorthand",
        shorthand: "overnight",
        normalizedText: "overnight",
        provenance: createQuantityProvenance(context, "quantity.overnight")
      }
    };
  }

  return undefined;
};

const parseRangeQuantity = (
  raw: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext,
  comparator?: QuantityComparator
): { quantity: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } | undefined => {
  const match = raw.match(new RegExp(`^(${NUMBER_PATTERN})\\s*(?:-|–|to)\\s*(${NUMBER_PATTERN})\\s+(${UNIT_PATTERN})$`, "i"));
  if (!match) {
    return undefined;
  }

  const min = Number(match[1]);
  const max = Number(match[2]);
  const unit = getQuantityUnit(quantityClass, match[3]);
  if (!unit) {
    return {
      quantity: createRawQuantity(raw, quantityClass, context),
      diagnostic: createQuantityDiagnostic(raw, quantityClass, context)
    };
  }

  const quantity: QuantityType = {
    ...createNormalizedQuantity(raw, min, unit, quantityClass, context, comparator),
    valueKind: "range",
    minValue: min,
    maxValue: max,
    canonicalValue: undefined
  };
  return mergeQuantityDiagnostics(quantity, createUnitDiagnostics(match[3], unit, context));
};

const parseUncertaintyQuantity = (
  raw: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext,
  comparator?: QuantityComparator
): { quantity: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } | undefined => {
  const match = raw.match(new RegExp(`^(${NUMBER_PATTERN})\\s*(?:±|\\+/-)\\s*(${NUMBER_PATTERN})\\s+(${UNIT_PATTERN})$`, "i"));
  if (!match) {
    return undefined;
  }

  const unit = getQuantityUnit(quantityClass, match[3]);
  if (!unit) {
    return {
      quantity: createRawQuantity(raw, quantityClass, context),
      diagnostic: createQuantityDiagnostic(raw, quantityClass, context)
    };
  }

  const quantity: QuantityType = {
    ...createNormalizedQuantity(raw, Number(match[1]), unit, quantityClass, context, comparator),
    valueKind: "uncertainty",
    uncertainty: Number(match[2])
  };
  return mergeQuantityDiagnostics(quantity, createUnitDiagnostics(match[3], unit, context));
};

const parseUnitlessEquivalentQuantity = (
  raw: string,
  quantityClass: QuantityClass,
  context: QuantityParseContext,
  comparator?: QuantityComparator
): { quantity: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } | undefined => {
  if (quantityClass !== "equivalent") {
    return undefined;
  }

  const match = raw.match(new RegExp(`^(${NUMBER_PATTERN})$`));
  if (!match) {
    return undefined;
  }

  const unit = getQuantityUnit("equivalent", "equiv") as QuantityUnitSchema;
  return {
    quantity: createNormalizedQuantity(raw, Number(match[1]), unit, "equivalent", context, comparator)
  };
};

const parsePhQuantity = (
  raw: string,
  context: QuantityParseContext,
  comparator?: QuantityComparator
): { quantity: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } => {
  const match = raw.match(new RegExp(`^(pH|ph)\\s+(${NUMBER_PATTERN})$`));
  if (!match) {
    return {
      quantity: createRawQuantity(raw, "ph", context),
      diagnostic: createQuantityDiagnostic(raw, "ph", context)
    };
  }

  const unit = getQuantityUnit("ph", match[1]) as QuantityUnitSchema;
  const quantity = createNormalizedQuantity(raw, Number(match[2]), unit, "ph", context, comparator);
  return mergeQuantityDiagnostics(quantity, createUnitDiagnostics(match[1], unit, context));
};

const isTemperatureProgram = (raw: string): boolean =>
  /(?:->|\bto\b|\bfrom\b|\bover\b)/i.test(raw)
  && /(?:rt|r\.t\.|-?\d+(?:\.\d+)?\s*(?:°\s*C|℃|[CFK]))/i.test(raw);

const parseTemperatureProgram = (
  raw: string,
  context: QuantityParseContext
): { quantity?: QuantityType; diagnostic?: V03Diagnostic; diagnostics?: V03Diagnostic[] } => {
  const temperatureSource = raw.replace(
    new RegExp(`\\bover\\s+${NUMBER_PATTERN}\\s+${UNIT_PATTERN}`, "ig"),
    ""
  );
  const temperatureMatches = [
    ...temperatureSource.matchAll(/(rt|r\.t\.|-?\d+(?:\.\d+)?)(?:\s*(°\s*C|℃|[CFK]))?/gi)
  ];
  const numericUnits = temperatureMatches.map((match) => match[2]).filter((unit): unit is string => Boolean(unit));
  const inferredUnit = numericUnits[numericUnits.length - 1] ?? "C";
  const values = temperatureMatches.map((match) =>
    parseTemperatureProgramValue(match[1], match[2] ?? inferredUnit, context)
  );

  if (values.length < 2 || values.some((value) => !value)) {
    const quantity = createRawQuantity(raw, "temperature", context);
    return {
      quantity,
      diagnostic: createQuantityDiagnostic(raw, "temperature", context, `Unable to parse temperature program: ${raw}`)
    };
  }

  const holdMatch = raw.match(new RegExp(`\\bover\\s+(${NUMBER_PATTERN})\\s+(${UNIT_PATTERN})`, "i"));
  const hold = holdMatch
    ? parseMatchedQuantity(holdMatch[0].replace(/^over\s+/i, ""), Number(holdMatch[1]), holdMatch[2], "time", {
        ...context,
        field: `${context.field}.program.hold`
      }).quantity
    : undefined;

  return {
    quantity: {
      ...createRawQuantity(raw, "temperature", context),
      valueKind: "program",
      program: [{
        raw,
        from: values[0] as QuantityType,
        to: values[values.length - 1] as QuantityType,
        ...(hold ? { hold } : {})
      }],
      normalizedText: "temperature program",
      provenance: createQuantityProvenance(context, "quantity.temperature_program")
    }
  };
};

const parseTemperatureProgramValue = (
  rawValue: string,
  rawUnit: string,
  context: QuantityParseContext
): QuantityType | undefined => {
  if (normalizeTemperatureShorthand(rawValue)) {
    return parseShorthandQuantity(rawValue, "temperature", context)?.quantity;
  }

  const unit = getQuantityUnit("temperature", rawUnit);
  return unit
    ? createNormalizedQuantity(`${rawValue} ${rawUnit}`, Number(rawValue), unit, "temperature", context)
    : undefined;
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
  sourceField: context.field,
  sourceSpan: context.sourceSpan
});

const createQuantityProvenance = (
  context: QuantityParseContext,
  ruleId: string
): NonNullable<QuantityType["provenance"]> => ({
  origin: "normalized",
  sourceNodeType: context.sourceNodeType,
  sourceNodeId: context.sourceNodeId,
  sourceField: context.field,
  sourceSpan: context.sourceSpan,
  ruleId,
  confidence: 1
});

const createNormalizedQuantity = (
  raw: string,
  value: number,
  unit: QuantityUnitSchema,
  quantityClass: QuantityClass,
  context: QuantityParseContext,
  comparator?: QuantityComparator
): QuantityType => ({
  ...createRawQuantity(raw, quantityClass, context),
  valueKind: "scalar",
  ...(comparator ? { comparator } : {}),
  value,
  unit: unit.unit,
  canonicalValue: value * unit.factor,
  canonicalUnit: unit.canonicalUnit,
  provenance: createQuantityProvenance(context, "quantity.unit_normalization")
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
