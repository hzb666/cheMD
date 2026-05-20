import type {
  AnalysisNode,
  ArtifactNode,
  ChemdDocument,
  ChemdNode,
  ConditionVariesNode,
  ExternalReferenceTarget,
  BatchNode,
  MaterialNode,
  ReactionRouteContext,
  ReferenceContext,
  ReferenceTargetKind,
  MoleculeNode,
  ObservationNode,
  ProvenanceInfo,
  ProcedureNode,
  QuantityClass,
  QuantityComparator,
  QuantityShorthand,
  QuantityValueKind,
  ReactionNode,
  ResultNode,
  SourceSpan,
  SampleNode
} from "@chemd/core";
import type {
  NormalizedReactionConditions,
  NormalizedTlcAnalysis
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, ObservationEventNode, StepGraph } from "@chemd/step-ontology";

export type { QuantityClass } from "@chemd/core";

export interface QuantityType {
  kind: "quantity";
  quantityClass: QuantityClass;
  raw: string;
  valueKind?: QuantityValueKind;
  comparator?: QuantityComparator;
  value?: number;
  minValue?: number;
  maxValue?: number;
  uncertainty?: number;
  unit?: string;
  canonicalValue?: number;
  canonicalUnit?: string;
  shorthand?: QuantityShorthand;
  program?: QuantityProgramSegment[];
  normalizedText?: string;
  sourceNodeId?: string;
  sourceField?: string;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface QuantityProgramSegment {
  raw: string;
  from?: QuantityType;
  to?: QuantityType;
  rate?: QuantityType;
  hold?: QuantityType;
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
  targetKind: ReferenceTargetKind;
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
  inchi?: string;
  inchikey?: string;
  canonicalSmiles?: string;
  name?: string;
  role?: string;
  formula?: string;
  mw?: string;
  amount?: QuantityType;
  equivalents?: QuantityType;
}

export interface TypedMaterialNode extends TypedNodeBase {
  kind: "material";
  molecule?: ReferenceOrLiteral;
  supplier?: string;
  lot?: string;
  purity?: QuantityType;
  density?: string;
  storage?: string;
  notes?: string;
}

export interface TypedBatchNode extends TypedNodeBase {
  kind: "batch";
  source?: ReferenceOrLiteral;
  molecule?: ReferenceOrLiteral;
  state?: string;
  mass?: QuantityType;
  purity?: QuantityType;
  artifacts?: ReferenceOrLiteral[];
  notes?: string;
}

export type ReactionParticipantRole = "reactant" | "product";

export interface TypedReactionParticipant {
  id: string;
  role: ReactionParticipantRole;
  raw: string;
  reference?: ReferenceOrLiteral;
  amount?: QuantityType;
  mass?: QuantityType;
  volume?: QuantityType;
  equivalents?: QuantityType;
  limiting?: boolean;
}

export interface StoichiometrySummary {
  limitingParticipantId?: string;
  consistencyStatus: "ok" | "warning" | "error" | "unknown";
}

export interface TypedReactionNode extends TypedNodeBase {
  kind: "reaction";
  route?: string;
  prev: ReferenceOrLiteral[];
  next: ReferenceType[];
  reactants: ReferenceOrLiteral[];
  products: ReferenceOrLiteral[];
  participants: TypedReactionParticipant[];
  stoichiometry?: StoichiometrySummary;
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
  stage?: string;
  purpose?: string;
  params: Record<string, unknown>;
  inputs?: CanonicalStepNode["inputs"];
  outputs?: CanonicalStepNode["outputs"];
  evidence?: string[];
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
  timepoint?: string;
  severity?: string;
  rawText: string;
  params?: Record<string, unknown>;
  linkedStepId?: string;
  linkedStepFamily?: ObservationEventNode["linkedStepFamily"];
  evidence?: string[];
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
  derivedFrom?: ReferenceOrLiteral;
  aliquotOf?: ReferenceOrLiteral;
  batchOf?: ReferenceOrLiteral;
  artifacts?: ReferenceOrLiteral[];
  purity?: QuantityType;
  supplier?: string;
  notes?: string;
}

export interface TypedArtifactNode extends TypedNodeBase {
  kind: "artifact";
  artifactKind?: string;
  ref?: ReferenceOrLiteral;
  path?: string;
  checksum?: string;
  instrument?: string;
  notes?: string;
}

export interface TypedConditionVariesNode extends TypedNodeBase {
  kind: "condition_varies";
  reaction?: ReferenceOrLiteral;
  standard?: ReferenceOrLiteral;
  condition?: ConditionVariesNode["condition"];
  varyFields?: ConditionVariesNode["varyFields"];
  changes: ConditionVariesNode["changes"];
  attempts?: ConditionVariesNode["attempts"];
  notes?: string;
}

export type TypedSemanticNode =
  | TypedMoleculeNode
  | TypedMaterialNode
  | TypedBatchNode
  | TypedReactionNode
  | TypedResultNode
  | TypedAnalysisNode
  | TypedProcedureNarrativeNode
  | TypedObservationNarrativeNode
  | TypedStepNode
  | TypedObservationEventNode
  | TypedSampleNode
  | TypedArtifactNode
  | TypedConditionVariesNode;

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
  referenceContext?: ReferenceContext;
  reactionRouteContext?: ReactionRouteContext;
}

export type ExternalTargetIndex = Map<string, ExternalReferenceTarget>;

export interface QuantityParseContext {
  sourceNodeType: string;
  sourceNodeId?: string;
  field: string;
  sourceSpan?: SourceSpan;
}

export type ObjectNode =
  | MoleculeNode
  | MaterialNode
  | BatchNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | ObservationNode
  | SampleNode
  | ArtifactNode
  | ConditionVariesNode;
