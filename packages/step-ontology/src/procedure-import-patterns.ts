import type { StepEffect, StepFamily } from "./types";

export interface ProcedureImportRule {
  id: string;
  family: StepFamily;
  triggerPatterns: readonly RegExp[];
  producedParams: readonly string[];
  confidence: number;
  effects?: readonly StepEffect[];
}

export const ADD_MATERIAL_MARKERS = ["滴加", "加入", "added dropwise", "added", "add"] as const;
export const ADD_STOP_MARKERS = ["后", "到", "至"] as const;
export const CHARGE_MATERIAL_MARKERS = ["将"] as const;
export const CHARGE_BEFORE_MARKERS = ["charged", "charge"] as const;
export const CHARGE_STOP_MARKERS = ["加入", "置于", "溶于", "charged", "charge"] as const;
export const SOLVENT_MARKERS = ["溶于", "into", "in"] as const;

export const INITIAL_CHARGE_PATTERNS = [/将.+(?:加入|置于|溶于)/, /\bcharged\b/i, /\bto a solution of\b/i] as const;
export const PURGE_PATTERNS = [/氮气置换/, /nitrogen\s+purge/i, /\bpurged\b/i, /\bdegassed\s+with\b/i] as const;
export const COOL_PATTERNS = [/冷却|冰浴/, /\bcooled?\b/i, /\bcooling\b/i] as const;
export const HEAT_PATTERNS = [/加热|升温/, /\bheated?\b/i, /\bwarmed?\b/i, /\breflux(?:ed)?\b/i] as const;
export const QUENCH_PATTERNS = [/淬灭/, /\bquench(?:ed)?\b/i] as const;
export const ADDITION_PATTERNS = [/滴加|加入/, /\badd(?:ed)?\b/i, /\baddition\s+of\b/i] as const;
export const SLOW_ADDITION_PATTERNS = [/滴加|缓慢/, /dropwise|slowly/i] as const;
export const NITROGEN_CONTEXT_PATTERNS = [/氮气下/, /under\s+nitrogen/i] as const;
export const HAZARDOUS_REAGENT_PATTERNS = [/n-?BuLi/i] as const;
export const HOLD_PATTERNS = [/反应|保温|搅拌/, /\bstir(?:red)?\b/i, /\bhold\b/i] as const;
export const SAMPLE_PATTERNS = [/取样/, /\bsampl(?:e|ed|ing)\b/i] as const;
export const ANALYSIS_PATTERNS = [/TLC|HPLC|NMR|分析/i] as const;
export const EXTRACT_PATTERNS = [/萃取/, /\bextract(?:ed)?\b/i] as const;
export const WASH_PATTERNS = [/洗涤/, /\bwash(?:ed)?\b/i] as const;
export const DRY_PATTERNS = [/干燥/, /\bdried?\b/i] as const;
export const CONCENTRATE_PATTERNS = [/旋干|浓缩/, /\bconcentrat(?:e|ed)\b/i, /\bin\s+vacuo\b/i] as const;
export const SEPARATE_LAYERS_PATTERNS = [
  /分液|取有机层/,
  /separat(?:e|ed)\s+layers/i,
  /layers?\s+were\s+separat(?:ed|e)/i
] as const;
export const FILTER_PATTERNS = [/过滤/, /\bfilter(?:ed)?\b/i] as const;
export const PURIFY_PATTERNS = [
  /纯化|柱层析/,
  /\bpurified?\b/i,
  /\bchromatograph(?:y|ed)\b/i,
  /\bprep(?:arative)?\s+TLC\b/i,
  /\bsilica\s+plug\b/i,
  /\btriturat(?:ed|ion)\b/i,
  /\brecrystalliz(?:ed|ation)\b/i
] as const;

export const PROCEDURE_IMPORT_RULES = [
  {
    id: "charge.initial",
    family: "charge",
    triggerPatterns: INITIAL_CHARGE_PATTERNS,
    producedParams: ["materials", "solvent"],
    confidence: 0.82
  },
  {
    id: "purge.inert",
    family: "purge",
    triggerPatterns: PURGE_PATTERNS,
    producedParams: ["atmosphere", "duration"],
    confidence: 0.9,
    effects: ["uses_inert_atmosphere"]
  },
  {
    id: "cool.temperature",
    family: "cool",
    triggerPatterns: COOL_PATTERNS,
    producedParams: ["target_temperature"],
    confidence: 0.9,
    effects: ["changes_temperature"]
  },
  {
    id: "heat.temperature",
    family: "heat",
    triggerPatterns: HEAT_PATTERNS,
    producedParams: ["target_temperature"],
    confidence: 0.88,
    effects: ["changes_temperature"]
  },
  {
    id: "quench.addition",
    family: "quench",
    triggerPatterns: QUENCH_PATTERNS,
    producedParams: ["agent"],
    confidence: 0.86
  },
  {
    id: "add.material",
    family: "add",
    triggerPatterns: ADDITION_PATTERNS,
    producedParams: ["materials", "mode", "atmosphere"],
    confidence: 0.84,
    effects: ["consumes_hazardous_reagent"]
  },
  {
    id: "hold.duration",
    family: "hold",
    triggerPatterns: HOLD_PATTERNS,
    producedParams: ["duration"],
    confidence: 0.86
  },
  {
    id: "sample.analysis",
    family: "sample",
    triggerPatterns: SAMPLE_PATTERNS,
    producedParams: [],
    confidence: 0.88,
    effects: ["requires_sampling"]
  },
  {
    id: "analyze.type",
    family: "analyze",
    triggerPatterns: ANALYSIS_PATTERNS,
    producedParams: ["type"],
    confidence: 0.88
  },
  {
    id: "extract.solvent",
    family: "extract",
    triggerPatterns: EXTRACT_PATTERNS,
    producedParams: ["solvent", "repeats"],
    confidence: 0.84,
    effects: ["creates_biphasic_system"]
  },
  {
    id: "wash.solvent",
    family: "wash",
    triggerPatterns: WASH_PATTERNS,
    producedParams: ["solvent", "repeats"],
    confidence: 0.82
  },
  {
    id: "dry.agent",
    family: "dry",
    triggerPatterns: DRY_PATTERNS,
    producedParams: ["agent"],
    confidence: 0.82
  },
  {
    id: "concentrate.rotavap",
    family: "concentrate",
    triggerPatterns: CONCENTRATE_PATTERNS,
    producedParams: ["method"],
    confidence: 0.84
  },
  {
    id: "separate_layers.manual",
    family: "separate_layers",
    triggerPatterns: SEPARATE_LAYERS_PATTERNS,
    producedParams: [],
    confidence: 0.82,
    effects: ["creates_biphasic_system"]
  },
  {
    id: "filter.manual",
    family: "filter",
    triggerPatterns: FILTER_PATTERNS,
    producedParams: ["medium"],
    confidence: 0.82
  },
  {
    id: "purify.chromatography",
    family: "purify",
    triggerPatterns: PURIFY_PATTERNS,
    producedParams: ["technique", "medium"],
    confidence: 0.84
  }
] satisfies readonly ProcedureImportRule[];
