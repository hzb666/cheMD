import type {
  ChemdImportDeclaration,
  ChemdProgramDeclarationKind,
  ChemdProgramDocument,
  ExternalReferenceTarget,
  ReactionRouteContext,
  ReferenceContext,
  ReferenceTargetKind,
  ProvenanceInfo,
  QuantityClass,
  QuantityComparator,
  QuantityShorthand,
  QuantityValueKind,
  SourceSpan,
  NormalizedReactionConditions,
  NormalizedAnalysis,
  NormalizedTlcAnalysis
} from "@chemd/core";
import type {
  AnalysisNode,
  ArtifactNode,
  BatchNode,
  ChemdNode,
  ConditionVariesNode,
  MaterialNode,
  MoleculeNode,
  ObservationNode,
  ProcedureNode,
  ReactionNode,
  ResultNode,
  SampleNode,
  TraceNode
} from "@chemd/core/compat";
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

export type AnalysisTypeLabel = "tlc" | "nmr" | "hplc" | "uplc" | "gc" | "lcms" | "gcms" | "ms" | "hrms" | "ir" | "uv";
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
  sourceMetadata?: ProgramSourceMetadata;
  sourceNodeType: ChemdNode["type"] | ChemdProgramDeclarationKind;
  syntaxOrigin?: string;
  declaredKind?: string;
  diagnostics?: V03Diagnostic[];
}

export interface ProgramSourceMetadata {
  sourceKind: "declaration" | "procedure_step" | "agent_run" | "doc_comment";
  declarationKind?: ChemdProgramDeclarationKind;
  declarationId?: string;
  field?: string;
  sourceSpan?: SourceSpan;
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
  rxn_smiles?: string;
  template?: ReferenceOrLiteral;
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
  normalizedAnalysis?: NormalizedAnalysis | null;
  normalizedTlc?: NormalizedTlcAnalysis | null;
  ref?: ReferenceOrLiteral;
  artifacts?: ReferenceOrLiteral[];
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

export interface TypedTraceNode extends TypedNodeBase {
  kind: "trace";
  plan?: ReferenceOrLiteral;
  mode?: string;
  eventCount: number;
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
  factors?: ConditionVariesNode["factors"];
  outcomes?: ConditionVariesNode["outcomes"];
  condition?: ConditionVariesNode["condition"];
  varyFields?: ConditionVariesNode["varyFields"];
  changes: ConditionVariesNode["changes"];
  attempts?: ConditionVariesNode["attempts"];
  notes?: string;
}

export interface TypedReactionTemplateNode extends TypedNodeBase {
  kind: "reaction_template";
  name?: string;
  family?: string;
  roles: string[];
  notes?: string;
}

export interface TypedConditionScreenNode extends TypedNodeBase {
  kind: "condition_screen";
  reaction?: ReferenceOrLiteral;
  standard?: ReferenceOrLiteral;
  factors?: string[];
  outcomes?: string[];
  notes?: string;
}

export interface TypedAgentRunNode extends TypedNodeBase {
  kind: "agent_run";
  goal: string;
  status: string;
  targetFiles: string[];
  toolCalls: Array<{ id: string; name: string; status: string }>;
  patches: Array<{ id: string; status: string; editCount: number }>;
  decisions: Array<{ id: string; decision: string; patchId?: string }>;
  evidence: string[];
}

export type TypedSemanticNode =
  | TypedMoleculeNode
  | TypedReactionTemplateNode
  | TypedMaterialNode
  | TypedBatchNode
  | TypedReactionNode
  | TypedResultNode
  | TypedAnalysisNode
  | TypedProcedureNarrativeNode
  | TypedTraceNode
  | TypedObservationNarrativeNode
  | TypedStepNode
  | TypedObservationEventNode
  | TypedSampleNode
  | TypedArtifactNode
  | TypedConditionVariesNode
  | TypedConditionScreenNode
  | TypedAgentRunNode;

export interface TypedSemanticGraph {
  documentId: string;
  nodes: TypedSemanticNode[];
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

export interface TypecheckResult {
  program: ChemdProgramDocument;
  document: ChemdProgramDocument;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: V03Diagnostic[];
}

export type ProcedureMode = "auto" | "explicit" | "lowered";

export interface TypecheckOptions {
  moduleImports?: ChemdImportDeclaration[];
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
  | TraceNode
  | ObservationNode
  | SampleNode
  | ArtifactNode
  | ConditionVariesNode;
