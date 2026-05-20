import type { V03Diagnostic } from "@chemd/diagnostics";
import type { ProcedureControlKind, ProvenanceInfo, SourceSpan } from "@chemd/core";

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

export type ObservationEventType =
  | "color_change"
  | "precipitation"
  | "gas_evolution"
  | "phase_change";

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
  sourceType?: "explicit_step" | "lowered_step" | "lowered_observation" | "explicit_observation";
  sentenceIndex?: number;
  rawText: string;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export type StepReferenceTargetKind =
  | "molecule"
  | "material"
  | "batch"
  | "reaction"
  | "result"
  | "analysis"
  | "sample"
  | "artifact"
  | "condition_varies"
  | "condition_variation_attempt"
  | "template"
  | "unknown";

export interface StepInputReference {
  kind: "reference";
  refId: string;
  targetKind: StepReferenceTargetKind;
  resolved: boolean;
}

export interface StepInputNode {
  raw: string;
  reference?: StepInputReference;
}

export interface StepOutputNode {
  raw: string;
  reference?: StepInputReference;
}

export interface CanonicalStepNode {
  stepId: string;
  family: StepFamily;
  stage?: string;
  purpose?: string;
  params: Record<string, unknown>;
  inputs?: StepInputNode[];
  outputs?: StepOutputNode[];
  dependsOn?: string[];
  evidence?: string[];
  artifacts?: Array<{ artifactId: string; kind: string }>;
  effects?: StepEffect[];
  controlPath?: string[];
  source: StepSourceInfo;
  provenance?: ProvenanceInfo;
  loweringConfidence: number;
}

export interface ProcedureControlSourceInfo {
  sourceNodeType: "procedure";
  sourceNodeId?: string;
  rawText: string;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface CanonicalProcedureControlNode {
  controlId: string;
  kind: ProcedureControlKind;
  params: Record<string, unknown>;
  controlPath: string[];
  dynamic: boolean;
  children?: CanonicalProcedureControlNode[];
  source: ProcedureControlSourceInfo;
  provenance?: ProvenanceInfo;
}

export interface ObservationEventNode {
  eventId?: string;
  observationId: string;
  source: StepSourceInfo;
  eventType?: ObservationEventType;
  stage?: string;
  timepoint?: string;
  severity?: string;
  rawText: string;
  params?: Record<string, unknown>;
  normalizedValue?: unknown;
  linkedStepId?: string;
  linkedStepFamily?: StepFamily;
  evidence?: string[];
  provenance?: ProvenanceInfo;
  confidence: number;
}

export interface ProcedureLoweringInput {
  procedureId?: string;
  body?: string;
}

export interface ProcedureLoweringResult {
  procedureId?: string;
  structureHint: "ordered_list" | "paragraph" | "mixed" | "explicit_steps";
  sourceType?: "explicit_steps" | "lowered_prose";
  steps: CanonicalStepNode[];
  controls?: CanonicalProcedureControlNode[];
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
  controls?: CanonicalProcedureControlNode[];
  procedures: ProcedureLoweringResult[];
  observations: ObservationLoweringResult[];
  diagnostics: V03Diagnostic[];
}
