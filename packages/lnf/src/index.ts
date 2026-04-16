import type { ChemdDocument, Diagnostic } from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, ObservationEventNode, StepGraph } from "@chemd/step-ontology";
import type {
  QuantityType,
  TypedReactionNode,
  TypedResultNode,
  TypedSemanticGraph,
  TypedSemanticNode
} from "@chemd/typechecker";
import type { RunPlan } from "@chemd/runtime-lab";

export interface LnfDocumentInfo {
  id: string;
  title: string;
  date: string;
}

export interface LnfStep {
  stepId: string;
  family: string;
  params: Record<string, unknown>;
  sourceNodeId?: string;
  rawText: string;
  loweringConfidence: number;
}

export interface LnfReaction {
  nodeId: string;
  reactants: unknown[];
  products: unknown[];
  conditions: Record<string, unknown>;
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

export interface BuildLnfInput {
  document: ChemdDocument | LnfDocumentInfo;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: Array<Diagnostic | V03Diagnostic>;
  runPlan?: RunPlan;
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
  sourceNodeId: step.source.sourceNodeId,
  rawText: step.source.rawText,
  loweringConfidence: step.loweringConfidence
});

const toLnfReaction = (node: TypedReactionNode): LnfReaction => ({
  nodeId: node.nodeId,
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
  }
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
