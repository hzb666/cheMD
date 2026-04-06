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

export const classifyReactionConditions = (
  node: Pick<
    ReactionNode,
    "conditions" | "reagents" | "catalyst" | "solvent" | "temperature" | "time" | "pressure" | "atmosphere"
  >
): NormalizedReactionConditions => {
  const conditions = Array.isArray(node.conditions)
    ? node.conditions.map(normalizeToken).filter(Boolean)
    : [];
  const remaining = [...conditions];

  const consumeFirst = (
    predicate: (value: string) => boolean
  ): string | undefined => {
    const index = remaining.findIndex(predicate);
    if (index < 0) {
      return undefined;
    }

    const [match] = remaining.splice(index, 1);
    return match;
  };

  const consumeExact = (value?: string): string | undefined => {
    if (!value) {
      return undefined;
    }

    const normalized = normalizeToken(value);
    return consumeFirst((candidate) => candidate.toLowerCase() === normalized.toLowerCase()) ?? normalized;
  };

  const solventRaw = node.solvent
    ? consumeExact(node.solvent)
    : consumeFirst((value) => Boolean(SOLVENT_ALIASES[value.toLowerCase()]));
  const catalystRaw = node.catalyst
    ? consumeExact(node.catalyst)
    : consumeFirst((value) => value.toLowerCase().includes("catalyst"));
  const atmosphereRaw = node.atmosphere
    ? consumeExact(node.atmosphere)
    : consumeFirst((value) => Boolean(ATMOSPHERE_ALIASES[value.toLowerCase()]));
  const temperatureRaw = node.temperature
    ? consumeExact(node.temperature)
    : consumeFirst((value) => parseNumericWithUnit(value, { c: "C", "°c": "C", k: "K", f: "F" }) !== null);
  const timeRaw = node.time
    ? consumeExact(node.time)
    : consumeFirst((value) => parseNumericWithUnit(value, { h: "h", hr: "h", hrs: "h", min: "min", mins: "min" }) !== null);
  const pressureRaw = node.pressure
    ? consumeExact(node.pressure)
    : consumeFirst((value) => parseNumericWithUnit(value, { bar: "bar", atm: "atm", psi: "psi" }) !== null);
  const reagentValues = [
    ...(node.reagents ? node.reagents.split("|").map(normalizeToken).filter(Boolean) : []),
    ...remaining
  ];

  return {
    ...(conditions.length > 0
      ? {
          conditions_text: {
            raw: conditions.join(" | "),
            normalized: conditions
          }
        }
      : {}),
    ...(solventRaw
      ? {
          solvent: {
            raw: solventRaw,
            normalized: SOLVENT_ALIASES[solventRaw.toLowerCase()] ?? solventRaw
          }
        }
      : {}),
    ...(catalystRaw
      ? {
          catalyst: {
            raw: catalystRaw,
            normalized: catalystRaw
          }
        }
      : {}),
    ...(reagentValues.length > 0
      ? {
          reagents: {
            raw: reagentValues.join(" | "),
            normalized: reagentValues
          }
        }
      : {}),
    ...(atmosphereRaw
      ? {
          atmosphere: {
            raw: atmosphereRaw,
            normalized: ATMOSPHERE_ALIASES[atmosphereRaw.toLowerCase()] ?? atmosphereRaw
          }
        }
      : {}),
    ...(temperatureRaw
      ? {
          temperature: parseNumericWithUnit(temperatureRaw, { c: "C", "°c": "C", k: "K", f: "F" })
        }
      : {}),
    ...(timeRaw
      ? {
          time: parseNumericWithUnit(timeRaw, { h: "h", hr: "h", hrs: "h", min: "min", mins: "min" })
        }
      : {}),
    ...(pressureRaw
      ? {
          pressure: parseNumericWithUnit(pressureRaw, { bar: "bar", atm: "atm", psi: "psi" })
        }
      : {})
  };
};
