import type { ChemdDocument, Diagnostic, NormalizedReactionConditions } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, ObservationEventNode, StepGraph } from "@chemd/step-ontology";
import type {
  QuantityType,
  TypedReactionNode,
  TypedResultNode,
  TypedSemanticGraph,
  TypedSemanticNode
} from "@chemd/typechecker";
import type { LabState, RunPlan } from "@chemd/runtime-lab";

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
  artifacts?: CanonicalStepNode["artifacts"];
  source: CanonicalStepNode["source"];
  provenance?: CanonicalStepNode["provenance"];
  sourceNodeId?: string;
  sourceType?: string;
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

export interface ChemdLnfV03 {
  schemaVersion: "chemd-lnf/v0.3";
  experiment: {
    document: LnfDocumentInfo;
    reactions: LnfReaction[];
    results: LnfResult[];
    procedure: LnfStep[];
    observations: ObservationEventNode[];
    diagnostics: Array<Diagnostic | V03Diagnostic>;
    runPlan?: Pick<RunPlan, "planId" | "status"> & { stepCount: number };
  };
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

export interface ChemdLnfV04 {
  schemaVersion: "chemd-lnf/v0.4";
  experiment: ChemdLnfV03["experiment"] & {
    typedGraph: TypedSemanticGraph;
    stepGraph: {
      steps: LnfStep[];
      observations: ObservationEventNode[];
      diagnostics: V03Diagnostic[];
    };
    runtimeSummary?: LnfRuntimeSummary;
    stepSources: {
      explicit: LnfStep[];
      lowered: LnfStep[];
      observation: ObservationEventNode[];
    };
    migration: LnfMigrationSummary;
  };
}

export interface BuildLnfInput {
  document: ChemdDocument | LnfDocumentInfo;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: Array<Diagnostic | V03Diagnostic>;
  runPlan?: RunPlan;
  runtimeState?: LabState;
}

const toDocumentInfo = (document: ChemdDocument | LnfDocumentInfo): LnfDocumentInfo => {
  if ("meta" in document) {
    return {
      id: document.meta.id,
      title: document.meta.title,
      date: document.meta.date
    };
  }

  return document;
};

const isReactionNode = (node: TypedSemanticNode): node is TypedReactionNode =>
  node.kind === "reaction";

const isResultNode = (node: TypedSemanticNode): node is TypedResultNode =>
  node.kind === "result";

const toLnfStep = (step: CanonicalStepNode): LnfStep => ({
  stepId: step.stepId,
  family: step.family,
  params: step.params,
  inputs: step.inputs,
  outputs: step.outputs,
  artifacts: step.artifacts,
  source: step.source,
  provenance: step.provenance,
  sourceNodeId: step.source.sourceNodeId,
  sourceType: step.source.sourceType,
  rawText: step.source.rawText,
  loweringConfidence: step.loweringConfidence
});

const toLnfReaction = (node: TypedReactionNode): LnfReaction => ({
  nodeId: node.nodeId,
  syntaxOrigin: node.syntaxOrigin,
  declaredKind: node.declaredKind,
  reactants: node.reactants,
  products: node.products,
  conditions: {
    solvent: node.solvent,
    catalyst: node.catalyst,
    reagents: node.reagents,
    atmosphere: node.atmosphere,
    temperature: node.temperature,
    time: node.time,
    pressure: node.pressure
  },
  normalizedConditions: node.normalizedConditions
});

const toLnfResult = (node: TypedResultNode): LnfResult => ({
  nodeId: node.nodeId,
  status: node.status,
  outcome: {
    yield: node.yield,
    conversion: node.conversion,
    selectivity: node.selectivity,
    purity: node.purity,
    isolatedMass: node.isolatedMass
  },
  notes: node.notes
});

const toRunPlanSummary = (
  runPlan: RunPlan | undefined
): ChemdLnfV03["experiment"]["runPlan"] =>
  runPlan
    ? {
        planId: runPlan.planId,
        status: runPlan.status,
        stepCount: runPlan.steps.length
      }
    : undefined;

export const buildLnf = (input: BuildLnfInput): ChemdLnfV03 => ({
  schemaVersion: "chemd-lnf/v0.3",
  experiment: {
    document: toDocumentInfo(input.document),
    reactions: input.typedGraph.nodes.filter(isReactionNode).map(toLnfReaction),
    results: input.typedGraph.nodes.filter(isResultNode).map(toLnfResult),
    procedure: input.stepGraph.steps.map(toLnfStep),
    observations: input.stepGraph.observations.flatMap((observation) => observation.events),
    diagnostics: input.diagnostics,
    ...(input.runPlan ? { runPlan: toRunPlanSummary(input.runPlan) } : {})
  }
});

const countDiagnostics = (
  diagnostics: Array<Diagnostic | V03Diagnostic>,
  code: string
): number => diagnostics.filter((diagnostic) => diagnostic.code === code).length;

const isLegacyUnknownBlockDiagnostic = (diagnostic: Diagnostic | V03Diagnostic): boolean =>
  diagnostic.code === "W_UNKNOWN_BLOCK"
  && (
    diagnostic.sourceNodeType === "molecule"
    || diagnostic.sourceNodeType === "reaction"
    || typeof diagnostic.facts?.legacy_block_kind === "string"
  );

const countLegacyBlockDiagnostics = (
  diagnostics: Array<Diagnostic | V03Diagnostic>
): number =>
  diagnostics.filter((diagnostic) =>
    diagnostic.code === "W_LEGACY_BLOCK_KIND" || isLegacyUnknownBlockDiagnostic(diagnostic)
  ).length;

const buildMigrationSummary = (
  diagnostics: Array<Diagnostic | V03Diagnostic>
): LnfMigrationSummary => ({
  legacyBlockCount: countLegacyBlockDiagnostics(diagnostics),
  missingKindCount: countDiagnostics(diagnostics, "W_CHEMD_KIND_AMBIGUOUS"),
  conflictCount: countDiagnostics(diagnostics, "E_CHEMD_KIND_CONFLICT")
});

const toStepGraphSummary = (
  stepGraph: StepGraph,
  steps: LnfStep[]
): ChemdLnfV04["experiment"]["stepGraph"] => ({
  steps,
  observations: stepGraph.observations.flatMap((observation) => observation.events),
  diagnostics: stepGraph.diagnostics
});

const hasRuntimeSummaryInput = (input: BuildLnfInput): boolean =>
  Boolean(input.runtimeState || input.runPlan);

const toRuntimeStepStates = (runtimeState: LabState | undefined): LnfRuntimeSummary["stepStates"] =>
  runtimeState?.stepStates.map((step) => ({
    stepId: step.stepId,
    status: step.status,
    startedAt: step.startedAt,
    endedAt: step.endedAt
  })) ?? [];

const countRuntimeSteps = (input: BuildLnfInput): number =>
  input.runPlan?.steps.length ?? input.runtimeState?.stepStates.length ?? 0;

const toRuntimeSummary = (input: BuildLnfInput): LnfRuntimeSummary | undefined => {
  if (!hasRuntimeSummaryInput(input)) {
    return undefined;
  }

  const runtimeState = input.runtimeState;
  return {
    planId: runtimeState?.planId ?? input.runPlan?.planId,
    runId: runtimeState?.runId,
    mode: runtimeState?.mode,
    status: runtimeState?.status ?? input.runPlan?.status,
    currentStepId: runtimeState?.currentStepId,
    stepCount: countRuntimeSteps(input),
    traceCount: runtimeState?.trace.length ?? 0,
    stepStates: toRuntimeStepStates(runtimeState)
  };
};

export const buildLnfV04 = (input: BuildLnfInput): ChemdLnfV04 => {
  const v03 = buildLnf(input);
  const steps = input.stepGraph.steps.map(toLnfStep);
  const runtimeSummary = toRuntimeSummary(input);

  return {
    schemaVersion: "chemd-lnf/v0.4",
    experiment: {
      ...v03.experiment,
      typedGraph: input.typedGraph,
      stepGraph: toStepGraphSummary(input.stepGraph, steps),
      ...(runtimeSummary ? { runtimeSummary } : {}),
      stepSources: {
        explicit: steps.filter((step) => step.sourceType === "explicit_step"),
        lowered: steps.filter((step) => step.sourceType === "lowered_step"),
        observation: input.stepGraph.observations.flatMap((observation) => observation.events)
      },
      migration: buildMigrationSummary(input.diagnostics)
    }
  };
};
