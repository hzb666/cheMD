import type { AnalysisNode } from "./ast";
import type { NumericWithUnit, NormalizedTokenValue } from "./reaction-conditions";

export type TlcLaneRole =
  | "starting_material"
  | "product"
  | "intermediate"
  | "reaction_mixture"
  | "blank"
  | "impurity"
  | "unknown"
  | "trial"
  | "custom";

export type TlcSpotShape = "circle" | "up" | "down";

export interface NormalizedTlcSpot {
  spot_id?: string;
  raw: string;
  rf_raw?: string;
  rf?: number | null;
  shape: TlcSpotShape;
  size_rank?: number | null;
  intensity_rank?: number | null;
  label_raw?: string;
  role?: TlcLaneRole;
  ref?: string;
  is_reference?: boolean;
  source_spot_id?: string;
}

export interface NormalizedTlcMessRegion {
  raw: string;
  rf_raw?: string;
  rf?: number | null;
  size_rank?: number | null;
  intensity_rank?: number | null;
}

export interface NormalizedTlcLane {
  lane_id: string;
  lane_label_raw: string;
  lane_role: TlcLaneRole;
  lane_index?: number | null;
  lane_params?: Record<string, string>;
  has_base: boolean;
  is_none: boolean;
  spots: NormalizedTlcSpot[];
  mess_regions: NormalizedTlcMessRegion[];
}

export interface NormalizedTlcAnalysis {
  time?: NumericWithUnit | null;
  plate?: NormalizedTokenValue | null;
  visualization?: NormalizedTokenValue | null;
  lanes: NormalizedTlcLane[];
}

const DEFAULT_TLC_PLATE = "silica gel GF254";
const DEFAULT_TLC_VISUALIZATION = "UV 254 nm";
const LANE_KEY_PATTERN = /^p\d+$/;
const ITEM_START_PATTERN = /^(?:none|base|mess(?:\([^)]+\))?|-?\d+(?:\.\d+)?)$/i;
const MARKER_PATTERN = /^(?<shape>[\^v]?)(?<size>\d+)?(?:\((?<intensity>\d+)\))?$/;
const MESS_PATTERN = /^mess(?:\((?<rf>-?\d+(?:\.\d+)?)\))?$/i;
const RF_PATTERN = /^-?\d+(?:\.\d+)?$/;
const TLC_ROLE_ALIASES: Array<{ pattern: RegExp; role: TlcLaneRole }> = [
  { pattern: /^(sm|startingmaterial)(\d+)?$/, role: "starting_material" },
  { pattern: /^(prod|pd|product)(\d+)?$/, role: "product" },
  { pattern: /^(int|intermediate)(\d+)?$/, role: "intermediate" },
  { pattern: /^(rxn|reaction|reactionmixture)(\d+)?$/, role: "reaction_mixture" },
  { pattern: /^(blank)(\d+)?$/, role: "blank" },
  { pattern: /^(impurity)(\d+)?$/, role: "impurity" },
  { pattern: /^(unk|unknown)(\d+)?$/, role: "unknown" }
];

const normalizeToken = (value: string): string => value.trim().replace(/\s+/g, " ");
const normalizeRoleToken = (raw: string): string => raw.toLowerCase().replace(/[\s_-]+/g, "");

const parseNumericWithUnit = (
  value: string,
  unitMap: Record<string, string>
): NumericWithUnit | null => {
  const normalized = normalizeToken(value);
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
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

const normalizeShape = (shape?: string): TlcSpotShape => {
  if (shape === "^") {
    return "up";
  }

  if (shape === "v") {
    return "down";
  }

  return "circle";
};

const clampRank = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }

  return Math.min(5, Math.max(1, Number(value)));
};

const parseMarker = (
  marker: string | undefined
): { shape: TlcSpotShape; size_rank?: number | null; intensity_rank?: number | null } => {
  if (!marker) {
    return { shape: "circle" };
  }

  const match = marker.match(MARKER_PATTERN);
  if (!match?.groups) {
    return { shape: "circle" };
  }

  const sizeRank = clampRank(match.groups.size);
  const intensityRank = clampRank(match.groups.intensity);

  return {
    shape: normalizeShape(match.groups.shape),
    ...(sizeRank !== undefined ? { size_rank: sizeRank } : {}),
    ...(intensityRank !== undefined ? { intensity_rank: intensityRank } : {})
  };
};

const classifyLaneLabel = (raw: string): { lane_role: TlcLaneRole; lane_index?: number | null } => {
  const normalized = normalizeRoleToken(raw);

  if (/^\d+$/.test(normalized)) {
    return {
      lane_role: "trial",
      lane_index: Number(normalized)
    };
  }

  for (const alias of TLC_ROLE_ALIASES) {
    const match = normalized.match(alias.pattern);
    if (!match) {
      continue;
    }

    return {
      lane_role: alias.role,
      ...(match[2] ? { lane_index: Number(match[2]) } : {})
    };
  }

  return { lane_role: "custom" };
};

const splitLaneSegment = (
  segment: string
): { laneLabel: string; firstItem?: string } => {
  const tokens = normalizeToken(segment).split(" ");
  const maxPrefixLength = Math.min(3, tokens.length);

  for (let prefixLength = maxPrefixLength; prefixLength >= 1; prefixLength -= 1) {
    const laneLabel = tokens.slice(0, prefixLength).join(" ");
    const classification = classifyLaneLabel(laneLabel);
    if (classification.lane_role === "custom") {
      continue;
    }

    return {
      laneLabel,
      firstItem: tokens.slice(prefixLength).join(" ")
    };
  }

  const itemIndex = tokens.findIndex((token) => ITEM_START_PATTERN.test(token));

  if (itemIndex < 0) {
    return { laneLabel: normalizeToken(segment) };
  }

  return {
    laneLabel: tokens.slice(0, itemIndex).join(" "),
    firstItem: tokens.slice(itemIndex).join(" ")
  };
};

const parseSpotItem = (raw: string): NormalizedTlcSpot | undefined => {
  const [rfToken, marker] = normalizeToken(raw).split(/\s+/, 2);
  if (!RF_PATTERN.test(rfToken)) {
    return undefined;
  }

  return {
    raw,
    rf_raw: rfToken,
    rf: Number(rfToken),
    ...parseMarker(marker)
  };
};

const parseLabelTarget = (raw: string | undefined): Pick<NormalizedTlcSpot, "label_raw" | "role" | "ref"> => {
  const label = raw?.trim();
  if (!label) {
    return {};
  }
  if (label.startsWith("@")) {
    return { label_raw: label, ref: label.slice(1) };
  }

  const normalized = normalizeRoleToken(label);
  const role = TLC_ROLE_ALIASES.find((alias) => alias.pattern.test(normalized))?.role;
  return role ? { label_raw: label, role } : { label_raw: label };
};

const parseStructuredSpot = (
  raw: string,
  lane: { lane_id: string; lane_role: TlcLaneRole },
  index: number
): NormalizedTlcSpot => {
  const tokens = normalizeToken(raw).split(/\s+/).filter(Boolean);
  const [head, second, ...rest] = tokens;
  const hasRf = Boolean(head && RF_PATTERN.test(head));
  const markerCandidate = hasRf && second && MARKER_PATTERN.test(second) ? second : undefined;
  const labelTokens = hasRf
    ? tokens.slice(markerCandidate ? 2 : 1)
    : tokens;
  const inheritedLabel = labelTokens.length === 0 && lane.lane_role !== "reaction_mixture" && lane.lane_role !== "custom"
    ? { role: lane.lane_role }
    : parseLabelTarget(labelTokens.join(" "));

  return {
    spot_id: `${lane.lane_id}.spot${index + 1}`,
    raw,
    ...(hasRf ? { rf_raw: head, rf: Number(head) } : { is_reference: true }),
    ...parseMarker(markerCandidate),
    ...inheritedLabel
  };
};

const parseStructuredMess = (raw: string): NormalizedTlcMessRegion => {
  const tokens = normalizeToken(raw).split(/\s+/).filter(Boolean);
  const [head, marker] = tokens;
  return {
    raw,
    ...(head && RF_PATTERN.test(head) ? { rf_raw: head, rf: Number(head) } : {}),
    ...parseMarker(marker)
  };
};

const parseMessItem = (raw: string): NormalizedTlcMessRegion | undefined => {
  const [head, marker] = normalizeToken(raw).split(/\s+/, 2);
  const match = head.match(MESS_PATTERN);
  if (!match?.groups) {
    return undefined;
  }

  return {
    raw,
    ...(match.groups.rf
      ? {
          rf_raw: match.groups.rf,
          rf: Number(match.groups.rf)
        }
      : {}),
    ...parseMarker(marker)
  };
};

const normalizeLane = (laneId: string, raw: string): NormalizedTlcLane => {
  const segments = raw
    .split("|")
    .map((segment) => normalizeToken(segment))
    .filter(Boolean);
  const [head, ...tail] = segments;
  const { laneLabel, firstItem } = splitLaneSegment(head ?? "");
  const items = [firstItem, ...tail].filter((item): item is string => typeof item === "string" && item.length > 0);
  const parsedLabel = classifyLaneLabel(laneLabel);
  let hasBase = false;
  let isNone = false;
  const spots: NormalizedTlcSpot[] = [];
  const messRegions: NormalizedTlcMessRegion[] = [];

  for (const item of items) {
    const normalizedItem = normalizeToken(item);

    if (normalizedItem.toLowerCase() === "base") {
      hasBase = true;
      continue;
    }

    if (normalizedItem.toLowerCase() === "none") {
      isNone = true;
      continue;
    }

    if (normalizedItem.toLowerCase().startsWith("mess")) {
      const mess = parseMessItem(normalizedItem);
      if (mess) {
        messRegions.push(mess);
      }
      continue;
    }

    const spot = parseSpotItem(normalizedItem);
    if (spot) {
      spots.push({ spot_id: `${laneId}.spot${spots.length + 1}`, ...spot });
    }
  }

  return {
    lane_id: laneId,
    lane_label_raw: laneLabel,
    ...parsedLabel,
    has_base: hasBase,
    is_none: isNone,
    ...(isNone ? { spots: [], mess_regions: [] } : { spots, mess_regions: messRegions })
  };
};

const normalizeStructuredLane = (lane: NonNullable<AnalysisNode["tlcLanes"]>[number]): NormalizedTlcLane => {
  const parsedLabel = classifyLaneLabel(lane.label);
  let hasBase = false;
  let isNone = false;
  const spots: NormalizedTlcSpot[] = [];
  const messRegions: NormalizedTlcMessRegion[] = [];

  for (const entry of lane.entries) {
    if (entry.kind === "none") {
      isNone = true;
      continue;
    }
    if (entry.kind === "base") {
      hasBase = true;
      if (entry.raw.trim()) {
        spots.push({
          ...parseStructuredSpot(entry.raw, { lane_id: lane.id, lane_role: parsedLabel.lane_role }, spots.length),
          raw: entry.raw
        });
      }
      continue;
    }
    if (entry.kind === "mess") {
      messRegions.push(parseStructuredMess(entry.raw));
      continue;
    }
    spots.push(parseStructuredSpot(entry.raw, { lane_id: lane.id, lane_role: parsedLabel.lane_role }, spots.length));
  }

  return {
    lane_id: lane.id,
    lane_label_raw: lane.label,
    ...parsedLabel,
    ...(lane.params ? { lane_params: lane.params } : {}),
    has_base: hasBase,
    is_none: isNone,
    ...(isNone ? { spots: [], mess_regions: [] } : { spots, mess_regions: messRegions })
  };
};

const spotTargetKey = (spot: NormalizedTlcSpot): string | undefined =>
  spot.ref ? `ref:${spot.ref}` : spot.role ? `role:${spot.role}` : undefined;

const resolveSpotReferences = (lanes: NormalizedTlcLane[]): NormalizedTlcLane[] => {
  const standards = new Map<string, NormalizedTlcSpot[]>();
  for (const lane of lanes) {
    for (const spot of lane.spots) {
      if (spot.rf === undefined || spot.rf === null || spot.is_reference) {
        continue;
      }
      const key = spotTargetKey(spot) ?? (lane.lane_role !== "reaction_mixture" && lane.lane_role !== "custom" ? `role:${lane.lane_role}` : undefined);
      if (!key) {
        continue;
      }
      standards.set(key, [...standards.get(key) ?? [], spot]);
    }
  }

  return lanes.map((lane) => ({
    ...lane,
    spots: lane.spots.map((spot) => {
      if (!spot.is_reference) {
        return spot;
      }
      const key = spotTargetKey(spot);
      const [standard] = key ? standards.get(key) ?? [] : [];
      return key && standard && (standards.get(key)?.length ?? 0) === 1
        ? {
            ...standard,
            spot_id: spot.spot_id,
            raw: spot.raw,
            is_reference: true,
            source_spot_id: standard.spot_id
          }
        : spot;
    })
  }));
};

const collectLaneEntries = (node: AnalysisNode): Array<[string, string]> =>
  Object.entries(node)
    .filter(([key, value]) => LANE_KEY_PATTERN.test(key) && typeof value === "string" && value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })) as Array<[string, string]>;

export const classifyTlcAnalysis = (node: AnalysisNode): NormalizedTlcAnalysis | undefined => {
  if (node.type_name?.toLowerCase() !== "tlc") {
    return undefined;
  }

  const lanes = node.tlcLanes?.length
    ? node.tlcLanes.map(normalizeStructuredLane)
    : collectLaneEntries(node).map(([laneId, raw]) => normalizeLane(laneId, raw));
  const normalizedPlate = normalizeToken(node.plate ?? DEFAULT_TLC_PLATE);
  const normalizedVisualization = normalizeToken(node.visualization ?? DEFAULT_TLC_VISUALIZATION);

  return {
    ...(node.time
      ? {
          time: parseNumericWithUnit(node.time, {
            h: "h",
            hr: "h",
            hrs: "h",
            min: "min",
            mins: "min"
          })
        }
      : {}),
    plate: {
      raw: node.plate ?? DEFAULT_TLC_PLATE,
      normalized: normalizedPlate
    },
    visualization: {
      raw: node.visualization ?? DEFAULT_TLC_VISUALIZATION,
      normalized: normalizedVisualization
    },
    lanes: resolveSpotReferences(lanes)
  };
};
