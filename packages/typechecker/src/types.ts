import type {
  AnalysisNode,
  ChemdDocument,
  ChemdNode,
  MoleculeNode,
  ObservationNode,
  ProvenanceInfo,
  ProcedureNode,
  ReactionNode,
  ResultNode,
  SampleNode
} from "@chemd/core";
import type {
  NormalizedReactionConditions,
  NormalizedTlcAnalysis
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, ObservationEventNode, StepGraph } from "@chemd/step-ontology";

export type QuantityClass =
  | "amount"
  | "mass"
  | "volume"
  | "temperature"
  | "time"
  | "pressure"
  | "concentration"
  | "equivalent"
  | "percent";

export interface QuantityType {
  kind: "quantity";
  quantityClass: QuantityClass;
  raw: string;
  value?: number;
  unit?: string;
  canonicalValue?: number;
  canonicalUnit?: string;
  sourceNodeId?: string;
  sourceField?: string;
  provenance?: ProvenanceInfo;
}

export type StatusLabel = "success" | "partial" | "failed" | "unknown";

export interface BoundedStringValue<KnownValue extends string = string> {
  kind: "known" | "extension";
  raw: string;
  value: KnownValue | string;
}

export type AnalysisTypeLabel = "tlc" | "nmr" | "hplc" | "lcms" | "gcms";
export type AnalysisTypeValue = BoundedStringValue<AnalysisTypeLabel>;

export type AtmosphereLabel = "nitrogen" | "argon" | "air" | "oxygen" | "inert";
export type AtmosphereValue = BoundedStringValue<AtmosphereLabel>;

export interface ReferenceType {
  kind: "reference";
  targetKind: "molecule" | "reaction" | "result" | "analysis" | "sample" | "template" | "unknown";
  refId: string;
  resolved: boolean;
}

export type ReferenceOrLiteral = ReferenceType | { kind: "literal"; raw: string };

export interface TypedNodeBase {
  nodeId: string;
  kind: string;
  sourceNodeType: ChemdNode["type"];
  syntaxOrigin?: string;
  declaredKind?: string;
  diagnostics?: V03Diagnostic[];
}

export interface TypedMoleculeNode extends TypedNodeBase {
  kind: "molecule";
  smiles?: string;
  cas?: string;
  name?: string;
  role?: string;
  formula?: string;
  amount?: QuantityType;
  equivalents?: QuantityType;
}

export interface TypedReactionNode extends TypedNodeBase {
  kind: "reaction";
  reactants: ReferenceOrLiteral[];
  products: ReferenceOrLiteral[];
  normalizedConditions: NormalizedReactionConditions;
  solvent?: string;
  catalyst?: string;
  reagents?: string;
  atmosphere?: AtmosphereValue;
  temperature?: QuantityType;
  time?: QuantityType;
  pressure?: QuantityType;
}

export interface TypedResultNode extends TypedNodeBase {
  kind: "result";
  status?: StatusLabel;
  reaction?: ReferenceOrLiteral;
  product?: ReferenceOrLiteral;
  yield?: QuantityType;
  conversion?: QuantityType;
  selectivity?: QuantityType;
  purity?: QuantityType;
  isolatedMass?: QuantityType;
  notes?: string;
}

export interface TypedAnalysisNode extends TypedNodeBase {
  kind: "analysis";
  analysisType?: AnalysisTypeValue;
  normalizedTlc?: NormalizedTlcAnalysis | null;
  ref?: ReferenceOrLiteral;
  result?: string;
  instrument?: string;
  method?: string;
  data?: string;
  notes?: string;
}

export interface TypedProcedureNarrativeNode extends TypedNodeBase {
  kind: "procedure_narrative";
  rawText: string;
  structureHint: "ordered_list" | "paragraph" | "mixed" | "explicit_steps";
}

export interface TypedObservationNarrativeNode extends TypedNodeBase {
  kind: "observation_narrative";
  rawText: string;
  stageHint?: string;
}

export interface TypedStepNode extends TypedNodeBase {
  kind: "step";
  stepId: string;
  family: CanonicalStepNode["family"];
  params: Record<string, unknown>;
  inputs?: CanonicalStepNode["inputs"];
  outputs?: CanonicalStepNode["outputs"];
  artifacts?: CanonicalStepNode["artifacts"];
  effects?: CanonicalStepNode["effects"];
  dependsOn?: string[];
  source: CanonicalStepNode["source"];
  provenance?: CanonicalStepNode["provenance"];
  confidence: number;
}

export interface TypedObservationEventNode extends TypedNodeBase {
  kind: "observation_event";
  eventId: string;
  eventType?: ObservationEventNode["eventType"];
  stage?: string;
  rawText: string;
  params?: Record<string, unknown>;
  linkedStepId?: string;
  linkedStepFamily?: ObservationEventNode["linkedStepFamily"];
  normalizedValue?: unknown;
  source: ObservationEventNode["source"];
  provenance?: ObservationEventNode["provenance"];
  confidence: number;
}

export interface TypedSampleNode extends TypedNodeBase {
  kind: "sample";
  name?: string;
  sampleCode?: string;
  ref?: ReferenceOrLiteral;
  purity?: QuantityType;
  supplier?: string;
  notes?: string;
}

export type TypedSemanticNode =
  | TypedMoleculeNode
  | TypedReactionNode
  | TypedResultNode
  | TypedAnalysisNode
  | TypedProcedureNarrativeNode
  | TypedObservationNarrativeNode
  | TypedStepNode
  | TypedObservationEventNode
  | TypedSampleNode;

export interface TypedSemanticGraph {
  documentId: string;
  nodes: TypedSemanticNode[];
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

export interface TypecheckResult {
  document: ChemdDocument;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: V03Diagnostic[];
}

export type ProcedureMode = "auto" | "explicit" | "lowered";

export interface TypecheckOptions {
  procedureMode?: ProcedureMode;
}

export interface QuantityParseContext {
  sourceNodeType: string;
  sourceNodeId?: string;
  field: string;
}

export type ObjectNode =
  | MoleculeNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | ObservationNode
  | SampleNode;
