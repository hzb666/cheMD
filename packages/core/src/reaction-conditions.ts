import type { ReactionNode } from "./ast";

export interface NumericWithUnit {
  raw: string;
  value: number;
  unit: string;
  original_unit?: string;
}

export interface NormalizedTokenValue {
  raw: string;
  normalized: string;
}

export interface NormalizedMultiTokenValue {
  raw: string;
  normalized: string[];
}

export interface NormalizedReactionConditions {
  conditions_text?: NormalizedMultiTokenValue | null;
  solvent?: NormalizedTokenValue | null;
  catalyst?: NormalizedTokenValue | null;
  reagents?: NormalizedMultiTokenValue | null;
  atmosphere?: NormalizedTokenValue | null;
  temperature?: NumericWithUnit | null;
  time?: NumericWithUnit | null;
  pressure?: NumericWithUnit | null;
}

const SOLVENT_ALIASES: Record<string, string> = {
  etoh: "ethanol",
  ethanol: "ethanol",
  meoh: "methanol",
  methanol: "methanol",
  h2o: "water",
  water: "water",
  dcm: "dichloromethane",
  dichloromethane: "dichloromethane",
  thf: "tetrahydrofuran",
  tetrahydrofuran: "tetrahydrofuran",
  mecn: "acetonitrile",
  acetonitrile: "acetonitrile",
  dmf: "dmf",
  dmso: "dmso",
  toluene: "toluene",
  etoac: "ethyl acetate",
  "ethyl acetate": "ethyl acetate"
};

const ATMOSPHERE_ALIASES: Record<string, string> = {
  n2: "nitrogen",
  nitrogen: "nitrogen",
  ar: "argon",
  argon: "argon",
  air: "air",
  o2: "oxygen",
  oxygen: "oxygen"
};

const TEMPERATURE_UNITS: Record<string, string> = {
  c: "C",
  "°c": "C",
  k: "K",
  f: "F"
};

const TIME_UNITS: Record<string, string> = {
  h: "h",
  hr: "h",
  hrs: "h",
  min: "min",
  mins: "min"
};

const PRESSURE_UNITS: Record<string, string> = {
  bar: "bar",
  atm: "atm",
  psi: "psi"
};

const normalizeToken = (value: string): string => value.trim().replace(/\s+/g, " ");

const parseNumericWithUnit = (
  value: string,
  unitMap: Record<string, string>
): NumericWithUnit | null => {
  const normalized = normalizeToken(value);
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z°%]+)$/);
  if (!match) {
    return null;
  }

  const [, rawValue, rawUnit] = match;
  const canonicalUnit = unitMap[rawUnit.toLowerCase()];
  if (!canonicalUnit) {
    return null;
  }

  return {
    raw: normalized,
    value: Number(rawValue),
    unit: canonicalUnit,
    ...(canonicalUnit !== rawUnit ? { original_unit: rawUnit } : {})
  };
};

type ConditionNode = Pick<
  ReactionNode,
  "conditions" | "reagents" | "catalyst" | "solvent" | "temperature" | "time" | "pressure" | "atmosphere"
>;

type ConsumeFirst = (predicate: (value: string) => boolean) => string | undefined;

const normalizeConditionList = (conditions: ReactionNode["conditions"]): string[] => {
  if (!Array.isArray(conditions)) {
    return [];
  }

  return conditions.map(normalizeToken).filter(Boolean);
};

const createRemainingConsumer = (remaining: string[]): ConsumeFirst => (
  predicate: (value: string) => boolean
): string | undefined => {
  const index = remaining.findIndex(predicate);
  if (index < 0) {
    return undefined;
  }

  const [match] = remaining.splice(index, 1);
  return match;
};

const consumeExactValue = (
  value: string | undefined,
  consumeFirst: ConsumeFirst
): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = normalizeToken(value);
  return consumeFirst((candidate) => candidate.toLowerCase() === normalized.toLowerCase()) ?? normalized;
};

const consumePreferred = (
  explicit: string | undefined,
  consumeFirst: ConsumeFirst,
  predicate: (value: string) => boolean
): string | undefined => {
  if (explicit) {
    return consumeExactValue(explicit, consumeFirst);
  }

  return consumeFirst(predicate);
};

const isKnownSolvent = (value: string): boolean => Boolean(SOLVENT_ALIASES[value.toLowerCase()]);

const isKnownAtmosphere = (value: string): boolean => Boolean(ATMOSPHERE_ALIASES[value.toLowerCase()]);

const isCatalystText = (value: string): boolean => value.toLowerCase().includes("catalyst");

const matchesQuantity = (units: Record<string, string>) => (value: string): boolean =>
  parseNumericWithUnit(value, units) !== null;

const reagentValuesFrom = (reagents: string | undefined, remaining: string[]): string[] => [
  ...(reagents ? reagents.split("|").map(normalizeToken).filter(Boolean) : []),
  ...remaining
];

const assignConditionsText = (
  result: NormalizedReactionConditions,
  conditions: string[]
): void => {
  if (conditions.length === 0) {
    return;
  }

  result.conditions_text = {
    raw: conditions.join(" | "),
    normalized: conditions
  };
};

const assignAliasToken = (
  result: NormalizedReactionConditions,
  key: "solvent" | "atmosphere",
  raw: string | undefined,
  aliases: Record<string, string>
): void => {
  if (!raw) {
    return;
  }

  result[key] = {
    raw,
    normalized: aliases[raw.toLowerCase()] ?? raw
  };
};

const assignPlainToken = (
  result: NormalizedReactionConditions,
  key: "catalyst",
  raw: string | undefined
): void => {
  if (!raw) {
    return;
  }

  result[key] = {
    raw,
    normalized: raw
  };
};

const assignReagents = (
  result: NormalizedReactionConditions,
  reagents: string[]
): void => {
  if (reagents.length === 0) {
    return;
  }

  result.reagents = {
    raw: reagents.join(" | "),
    normalized: reagents
  };
};

const assignNumericValue = (
  result: NormalizedReactionConditions,
  key: "temperature" | "time" | "pressure",
  raw: string | undefined,
  units: Record<string, string>
): void => {
  if (!raw) {
    return;
  }

  const value = parseNumericWithUnit(raw, units);
  if (value) {
    result[key] = value;
  }
};

export const classifyReactionConditions = (
  node: ConditionNode
): NormalizedReactionConditions => {
  const conditions = normalizeConditionList(node.conditions);
  const remaining = [...conditions];
  const consumeFirst = createRemainingConsumer(remaining);
  const result: NormalizedReactionConditions = {};

  assignConditionsText(result, conditions);
  assignAliasToken(result, "solvent", consumePreferred(node.solvent, consumeFirst, isKnownSolvent), SOLVENT_ALIASES);
  assignPlainToken(result, "catalyst", consumePreferred(node.catalyst, consumeFirst, isCatalystText));
  assignAliasToken(
    result,
    "atmosphere",
    consumePreferred(node.atmosphere, consumeFirst, isKnownAtmosphere),
    ATMOSPHERE_ALIASES
  );
  assignNumericValue(
    result,
    "temperature",
    consumePreferred(node.temperature, consumeFirst, matchesQuantity(TEMPERATURE_UNITS)),
    TEMPERATURE_UNITS
  );
  assignNumericValue(result, "time", consumePreferred(node.time, consumeFirst, matchesQuantity(TIME_UNITS)), TIME_UNITS);
  assignNumericValue(
    result,
    "pressure",
    consumePreferred(node.pressure, consumeFirst, matchesQuantity(PRESSURE_UNITS)),
    PRESSURE_UNITS
  );
  assignReagents(result, reagentValuesFrom(node.reagents, remaining));

  return result;
};
