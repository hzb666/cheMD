import type { V03Diagnostic } from "@chemd/diagnostics";

export type StepFamily =
  | "charge"
  | "add"
  | "transfer"
  | "mix"
  | "cool"
  | "heat"
  | "hold"
  | "purge"
  | "quench"
  | "extract"
  | "wash"
  | "separate_layers"
  | "filter"
  | "dry"
  | "concentrate"
  | "purify"
  | "sample"
  | "analyze"
  | "observe"
  | "store";

export type StepEffect =
  | "uses_inert_atmosphere"
  | "changes_temperature"
  | "creates_biphasic_system"
  | "consumes_hazardous_reagent"
  | "produces_gas"
  | "requires_sampling"
  | "requires_purification";

export interface StepSourceInfo {
  sourceNodeType: "procedure" | "analysis" | "observation";
  sourceNodeId?: string;
  sentenceIndex?: number;
  rawText: string;
}

export interface CanonicalStepNode {
  stepId: string;
  family: StepFamily;
  params: Record<string, unknown>;
  inputs?: Array<{ raw: string }>;
  outputs?: string[];
  effects?: StepEffect[];
  source: StepSourceInfo;
  loweringConfidence: number;
}

export interface ObservationEventNode {
  observationId: string;
  source: StepSourceInfo;
  eventType?: string;
  stage?: string;
  rawText: string;
  normalizedValue?: unknown;
  linkedStepFamily?: StepFamily;
  confidence: number;
}

export interface ProcedureLoweringInput {
  procedureId?: string;
  body?: string;
}

export interface ProcedureLoweringResult {
  procedureId?: string;
  structureHint: "ordered_list" | "paragraph" | "mixed";
  steps: CanonicalStepNode[];
  diagnostics: V03Diagnostic[];
  loweringConfidence: number;
}

export interface ObservationLoweringInput {
  observationId?: string;
  body?: string;
}

export interface ObservationLoweringResult {
  observationId?: string;
  events: ObservationEventNode[];
  diagnostics: V03Diagnostic[];
}

export interface AnalysisLoweringInput {
  analysisId?: string;
  analysisType?: string;
  result?: string;
}

export interface AnalysisLoweringResult {
  analysisId?: string;
  steps: CanonicalStepNode[];
  diagnostics: V03Diagnostic[];
}

export interface StepGraph {
  steps: CanonicalStepNode[];
  procedures: ProcedureLoweringResult[];
  observations: ObservationLoweringResult[];
  diagnostics: V03Diagnostic[];
}
