import type { ChemdDocument, Diagnostic, NormalizedReactionConditions } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalStepNode,
  ObservationEventNode,
  StepGraph
} from "@chemd/step-ontology";
import type {
  QuantityType,
  TypedSemanticGraph
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
}

export interface LnfStep {
  stepId: string;
  family: string;
  params: Record<string, unknown>;
  inputs?: CanonicalStepNode["inputs"];
  outputs?: CanonicalStepNode["outputs"];
  dependsOn?: CanonicalStepNode["dependsOn"];
  artifacts?: CanonicalStepNode["artifacts"];
  effects?: CanonicalStepNode["effects"];
  source: CanonicalStepNode["source"];
  provenance?: CanonicalStepNode["provenance"];
  sourceNodeId?: string;
  sourceType?: CanonicalStepNode["source"]["sourceType"];
  rawText: string;
  loweringConfidence: number;
}

export interface LnfReaction {
  nodeId: string;
  syntaxOrigin?: string;
  declaredKind?: string;
  reactants: unknown[];
  products: unknown[];
  conditions: Record<string, unknown>;
  normalizedConditions?: NormalizedReactionConditions;
}

export interface LnfResult {
  nodeId: string;
  status?: string;
  outcome: Record<string, QuantityType | undefined>;
  notes?: string;
}

export interface LnfMigrationSummary {
  legacyBlockCount: number;
  missingKindCount: number;
  conflictCount: number;
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
  diagnostics: V03Diagnostic[];
  steps: LnfRuntimeStepSummary[];
}

export interface ChemdLnfCanonical {
  schemaVersion: "chemd-lnf/v0.5";
  experiment: {
    document: LnfDocumentInfo;
    entities: {
      reactions: LnfReaction[];
      results: LnfResult[];
    };
    semantic: {
      typedGraph: TypedSemanticGraph;
      quantities: QuantityType[];
    };
    workflow: {
      steps: LnfStep[];
      observations: ObservationEventNode[];
      diagnostics: V03Diagnostic[];
      stepSources: LnfStepSourceIndex;
    };
    runtime?: {
      planSummary?: LnfRuntimePlanSummary;
      stateSummary?: LnfRuntimeSummary;
      preflight?: PreflightResult;
    };
    quality: {
      diagnostics: Array<Diagnostic | V03Diagnostic>;
      migration: LnfMigrationSummary;
    };
  };
}

export type ChemdLnf = ChemdLnfCanonical;

export interface BuildLnfInput {
  document: ChemdDocument | LnfDocumentInfo;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: Array<Diagnostic | V03Diagnostic>;
  runPlan?: RunPlan;
  runtimeState?: LabState;
  runtimePreflight?: PreflightResult;
}
