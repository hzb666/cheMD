export type QuantityClass =
  | "amount"
  | "mass"
  | "volume"
  | "temperature"
  | "time"
  | "pressure"
  | "concentration"
  | "equivalent"
  | "percent"
  | "rate"
  | "rpm"
  | "ph";

export type QuantityComparator = "=" | "<" | "<=" | ">" | ">=" | "approx";
export type QuantityValueKind = "scalar" | "range" | "uncertainty" | "program" | "shorthand";
export type QuantityShorthand = "room_temperature" | "reflux" | "ice_bath" | "overnight";

export interface QuantityUnitSchema {
  unit: string;
  factor: number;
  canonicalUnit: string;
  aliases?: string[];
}

export const QUANTITY_UNIT_SCHEMA: Record<QuantityClass, Record<string, QuantityUnitSchema>> = {
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
    ml: { unit: "mL", factor: 1, canonicalUnit: "mL", aliases: ["ML"] },
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
    mm: { unit: "mM", factor: 0.001, canonicalUnit: "M" },
    ppm: { unit: "ppm", factor: 1, canonicalUnit: "ppm" }
  },
  equivalent: {
    equiv: { unit: "equiv", factor: 1, canonicalUnit: "equiv" },
    eq: { unit: "eq", factor: 1, canonicalUnit: "equiv" }
  },
  percent: {
    "%": { unit: "%", factor: 1, canonicalUnit: "percent" },
    percent: { unit: "percent", factor: 1, canonicalUnit: "percent" },
    "mol%": { unit: "mol %", factor: 1, canonicalUnit: "mol_percent", aliases: ["mol %"] }
  },
  rate: {
    "ml/min": { unit: "mL/min", factor: 1, canonicalUnit: "mL/min" },
    "l/min": { unit: "L/min", factor: 1000, canonicalUnit: "mL/min" }
  },
  rpm: {
    rpm: { unit: "rpm", factor: 1, canonicalUnit: "rpm", aliases: ["RPM"] }
  },
  ph: {
    ph: { unit: "pH", factor: 1, canonicalUnit: "pH" }
  }
};

export const normalizeQuantityUnitKey = (unit: string): string =>
  unit.trim().replace(/\s+/g, "").toLowerCase();

export const getQuantityUnit = (
  quantityClass: QuantityClass,
  unit: string
): QuantityUnitSchema | undefined =>
  QUANTITY_UNIT_SCHEMA[quantityClass][normalizeQuantityUnitKey(unit)];

export const getQuantityClassUnits = (quantityClass: QuantityClass): QuantityUnitSchema[] =>
  Object.values(QUANTITY_UNIT_SCHEMA[quantityClass]);

export const isQuantityClass = (value: string | undefined): value is QuantityClass =>
  Boolean(value && value in QUANTITY_UNIT_SCHEMA);
