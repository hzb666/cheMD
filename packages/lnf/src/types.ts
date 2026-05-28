import type {
  AgentPatchDecisionDeclaration,
  AgentPatchProposalDeclaration,
  AgentRunDeclaration,
  ArtifactDeclaration,
  BatchDeclaration,
  ChemdDeclaration,
  ChemdDocComment,
  ChemdDocCommentAttachment,
  ChemdMetaDeclaration,
  ChemdModuleDeclaration,
  ChemdProgramDeclarationKind,
  ChemdProgramDocument,
  ChemdValue,
  ConditionScreenDeclaration,
  Diagnostic,
  MaterialDeclaration,
  MoleculeDeclaration,
  ReactionDeclaration,
  ResultDeclaration,
  AnalysisDeclaration,
  SampleDeclaration,
  SourceSpan,
  TraceDeclaration
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalStepNode,
  ObservationEventNode,
  CanonicalProcedureControlNode,
  ProcedureLoweringResult,
  StepGraph
} from "@chemd/step-ontology";
import type {
  QuantityType,
  TypedSemanticGraph,
  TypedSemanticNode
} from "@chemd/typechecker";
import type {
  LabState,
  PreflightResult,
  RunPlan,
  RuntimeStep
} from "@chemd/runtime-lab";

export interface LnfDocumentInfo {
  id: string;
  title: string;
  date: string;
  moduleName: string;
  sourceLanguage: ChemdProgramDocument["sourceLanguage"];
}

export interface LnfDeclarationIndexEntry {
  declarationId: string;
  qualifiedId: string;
  declarationKind: ChemdProgramDeclarationKind;
  sourceSpan?: SourceSpan;
  docIds: string[];
}

export interface LnfProgramSource {
  module: ChemdModuleDeclaration;
  meta: ChemdMetaDeclaration;
  declarationIndex: LnfDeclarationIndexEntry[];
  documentation: ChemdDocComment[];
}

export interface LnfEntityBase<
  Declaration extends ChemdDeclaration,
  TypedNode extends TypedSemanticNode | undefined = undefined
> {
  declarationId: string;
  qualifiedId: string;
  declarationKind: Declaration["kind"];
  fields: Record<string, ChemdValue>;
  annotations?: Declaration["annotations"];
  sourceSpan?: SourceSpan;
  docIds: string[];
  declaration: Declaration;
  typedNode?: TypedNode;
}

export type LnfMolecule = LnfEntityBase<MoleculeDeclaration, Extract<TypedSemanticNode, { kind: "molecule" }>>;
export type LnfMaterial = LnfEntityBase<MaterialDeclaration, Extract<TypedSemanticNode, { kind: "material" }>>;
export type LnfBatch = LnfEntityBase<BatchDeclaration, Extract<TypedSemanticNode, { kind: "batch" }>>;
export type LnfReaction = LnfEntityBase<ReactionDeclaration, Extract<TypedSemanticNode, { kind: "reaction" }>>;
export type LnfResult = LnfEntityBase<ResultDeclaration, Extract<TypedSemanticNode, { kind: "result" }>>;
export type LnfAnalysis = LnfEntityBase<AnalysisDeclaration, Extract<TypedSemanticNode, { kind: "analysis" }>>;
export type LnfSample = LnfEntityBase<SampleDeclaration, Extract<TypedSemanticNode, { kind: "sample" }>>;
export type LnfArtifact = LnfEntityBase<ArtifactDeclaration, Extract<TypedSemanticNode, { kind: "artifact" }>>;
export type LnfConditionScreen = LnfEntityBase<
  ConditionScreenDeclaration,
  Extract<TypedSemanticNode, { kind: "condition_screen" }>
>;
export type LnfTrace = LnfEntityBase<TraceDeclaration, Extract<TypedSemanticNode, { kind: "trace" }>>;

export interface LnfStep {
  stepId: string;
  family: string;
  stage?: string;
  purpose?: string;
  params: Record<string, unknown>;
  inputs?: CanonicalStepNode["inputs"];
  outputs?: CanonicalStepNode["outputs"];
  dependsOn?: CanonicalStepNode["dependsOn"];
  evidence?: CanonicalStepNode["evidence"];
  artifacts?: CanonicalStepNode["artifacts"];
  effects?: CanonicalStepNode["effects"];
  controlPath?: string[];
  source: CanonicalStepNode["source"];
  provenance?: CanonicalStepNode["provenance"];
  sourceNodeId?: string;
  sourceType?: CanonicalStepNode["source"]["sourceType"];
  rawText: string;
  loweringConfidence: number;
}

export interface LnfProcedure {
  procedureId?: string;
  lowering: ProcedureLoweringResult;
}

export interface LnfDocumentationLink {
  docId: string;
  attachment: ChemdDocCommentAttachment;
  references: ChemdDocComment["references"];
  links: ChemdDocComment["links"];
}

export interface LnfRuntimeSummary {
  planId?: string;
  runId?: string;
  mode?: string;
  status?: string;
  currentStepId?: string;
  stepCount: number;
  traceCount: number;
  stepStates: Array<{
    stepId: string;
    status: string;
    startedAt?: string;
    endedAt?: string;
  }>;
  controlStates: Array<{
    controlId: string;
    kind: string;
    status: string;
    dynamic: boolean;
  }>;
}

export interface LnfStepSourceIndex {
  explicitStepIds: string[];
  loweredStepIds: string[];
  observationEvents: Array<{
    observationId: string;
    eventId?: string;
  }>;
}

export interface LnfRuntimeStepSummary {
  stepId: string;
  order: number;
  status: RuntimeStep["status"];
  requiredCapabilities: RuntimeStep["requiredCapabilities"];
  requiresConfirmation: boolean;
  confirmationStrategy: RuntimeStep["confirmationStrategy"];
  sourceType?: RuntimeStep["sourceType"];
  dependsOn?: RuntimeStep["dependsOn"];
}

export interface LnfRuntimePlanSummary {
  planId: string;
  documentId: string;
  status: RunPlan["status"];
  stepCount: number;
  controlCount: number;
  diagnostics: V03Diagnostic[];
  controls: CanonicalProcedureControlNode[];
  steps: LnfRuntimeStepSummary[];
}

export interface LnfAgentPatchProposal {
  runId: string;
  patch: AgentPatchProposalDeclaration;
}

export interface LnfAgentPatchDecision {
  runId: string;
  decision: AgentPatchDecisionDeclaration;
}

export interface LnfAgentSection {
  runs: AgentRunDeclaration[];
  patches: LnfAgentPatchProposal[];
  decisions: LnfAgentPatchDecision[];
}

export interface LnfSourceCompletenessSummary {
  declarationCount: number;
  documentationCount: number;
  unresolvedReferenceCount: number;
  incompleteDeclarationCount: number;
  agentAuditRunCount: number;
}

export interface ChemdLnfCanonicalV1 {
  schemaVersion: "chemd-lnf/v1.0";
  experiment: {
    document: LnfDocumentInfo;
    source: LnfProgramSource;
    entities: {
      molecules: LnfMolecule[];
      materials: LnfMaterial[];
      batches: LnfBatch[];
      reactions: LnfReaction[];
      results: LnfResult[];
      analyses: LnfAnalysis[];
      samples: LnfSample[];
      artifacts: LnfArtifact[];
      conditionScreens: LnfConditionScreen[];
    };
    semantic: {
      typedGraph: TypedSemanticGraph;
      quantities: QuantityType[];
      documentationLinks: LnfDocumentationLink[];
    };
    workflow: {
      procedures: LnfProcedure[];
      steps: LnfStep[];
      controls?: CanonicalProcedureControlNode[];
      observations: ObservationEventNode[];
      traces: LnfTrace[];
      diagnostics: V03Diagnostic[];
      stepSources: LnfStepSourceIndex;
    };
    agent?: LnfAgentSection;
    runtime?: {
      planSummary?: LnfRuntimePlanSummary;
      stateSummary?: LnfRuntimeSummary;
      preflight?: PreflightResult;
    };
    quality: {
      diagnostics: Array<Diagnostic | V03Diagnostic>;
      sourceCompleteness: LnfSourceCompletenessSummary;
    };
  };
}

export type ChemdLnf = ChemdLnfCanonicalV1;

export interface BuildLnfInput {
  document: ChemdProgramDocument;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: Array<Diagnostic | V03Diagnostic>;
  runPlan?: RunPlan;
  runtimeState?: LabState;
  runtimePreflight?: PreflightResult;
}
