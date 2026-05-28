import {
  buildReactionMapFromGraphIndex,
  type ChemdComputedSimilarityBasisV1,
  type ChemdReactionIntelligenceArtifactV1,
  type ReactionMapExplicitInput,
  type ReactionMapLayout
} from "@chemd/reaction-map";
import {
  buildSemanticRenderTree,
  type ChemdRenderableNodeV1,
  type ChemdSemanticRenderTreeV1,
  type ChemdSourceRefV1
} from "@chemd/semantic-rendering";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdSymbol
} from "@chemd/language-service";

export type KnowledgeMapState = "empty" | "ready" | "degraded" | "failed";

export interface SemanticSummary {
  nodeCount: number;
  heavyNodeCount: number;
  warningCount: number;
  components: Array<{ component: string; count: number }>;
}

export interface ReactionMapSummary {
  reactionCount: number;
  clusterCount: number;
  edgeCount: number;
  layoutEngine: ReactionMapLayout["layout_engine"];
  message: string;
}

export interface EdgeBasisOption {
  value: string;
  label: string;
  edgeCount: number;
}

export interface ArtifactProviderStatusCounts {
  PASS: number;
  SKIP: number;
  ERROR: number;
}

export interface ReactionIntelligenceArtifactSummary {
  artifactId: string;
  jobId: string;
  graphIndexId: string;
  generatedAt: string;
  providerStatusCounts: ArtifactProviderStatusCounts;
  computedEdgeCount: number;
  computedBasis: ChemdComputedSimilarityBasisV1[];
  warnings: string[];
  layout: {
    fromArtifact: boolean;
    usesTmap: boolean;
    engine: ReactionMapLayout["layout_engine"];
  };
}

export interface ReactionClusterRow {
  id: string;
  label: string;
  basis: string;
  memberCount: number;
  confidence: string;
  reviewRequired: boolean;
}

export interface SourceJumpIntent {
  kind: "chemd-source-jump";
  nodeId: string;
  semanticId?: string;
  sourceKind: ChemdSourceRefV1["source_kind"];
  sourceUri?: string;
  range: {
    startLine: number;
    endLine: number;
    startOffset?: number;
    endOffset?: number;
  };
}

export interface RenderableSourceRef {
  label: string;
  sourceKind: ChemdSourceRefV1["source_kind"];
  sourceUri?: string;
  startLine?: number;
  endLine?: number;
  intent: SourceJumpIntent | null;
}

export interface ReactionClusterBadge {
  clusterId: string;
  label: string;
  basis: string;
  confidence: string;
  memberCount: number;
  reviewRequired: boolean;
}

export interface RenderableChildRow {
  nodeId: string;
  nodeType: string;
  label: string;
  sourceRef: RenderableSourceRef | null;
}

export interface ReactionRenderableRow {
  nodeId: string;
  semanticId: string;
  component: string;
  hydration: string;
  title: string;
  sourceRef: RenderableSourceRef | null;
  clusterBadge: ReactionClusterBadge | null;
  children: RenderableChildRow[];
}

export interface EvidenceSourceRow {
  nodeId: string;
  label: string;
  sourceRef: RenderableSourceRef;
}

export interface EdgeEvidenceSourceRow {
  evidenceId?: string;
  source: string;
  basis: string[];
  warnings: string[];
}

export interface EdgeEvidenceEndpoint {
  reactionId: string;
  label: string;
  sourceRef: RenderableSourceRef | null;
  jumpIntent: SourceJumpIntent | null;
}

export interface EdgeEvidenceRow {
  edgeId: string;
  from: EdgeEvidenceEndpoint;
  to: EdgeEvidenceEndpoint;
  basis: string[];
  score: number | null;
  warnings: string[];
  evidenceSources: EdgeEvidenceSourceRow[];
}

export type SemanticFlowLaneId =
  | "source"
  | "materials"
  | "procedure"
  | "reaction"
  | "results"
  | "analysis"
  | "evidence";

export interface SemanticFlowLane {
  id: SemanticFlowLaneId;
  label: string;
  detail: string;
}

export interface SemanticFlowNode {
  id: string;
  laneId: SemanticFlowLaneId;
  nodeType: ChemdRenderableNodeV1["node_type"];
  label: string;
  detail: string;
  component: string;
  sourceRef: RenderableSourceRef | null;
  diagnosticSeverity: ChemdEditorDiagnostic["severity"] | null;
  order: number;
}

export interface SemanticFlowEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "document_order" | "contains" | "reactant" | "product" | "evidence" | "semantic_relation";
  label: string;
}

export interface SemanticFlowDiagram {
  lanes: SemanticFlowLane[];
  nodes: SemanticFlowNode[];
  edges: SemanticFlowEdge[];
  message: string;
}

export interface KnowledgeMapViewModel {
  state: KnowledgeMapState;
  message: string;
  semanticTree: ChemdSemanticRenderTreeV1 | null;
  semanticSummary: SemanticSummary;
  semanticFlow: SemanticFlowDiagram;
  reactionMap: ReactionMapLayout;
  reactionSummary: ReactionMapSummary;
  reactionIntelligenceArtifact: ReactionIntelligenceArtifactSummary | null;
  edgeBasisOptions: EdgeBasisOption[];
  clusters: ReactionClusterRow[];
  reactionRenderables: ReactionRenderableRow[];
  evidenceSourceRefs: EvidenceSourceRow[];
  edgeEvidenceRows: EdgeEvidenceRow[];
}

export interface BuildKnowledgeMapViewModelOptions {
  reactionIntelligenceArtifact?: ChemdReactionIntelligenceArtifactV1 | null;
}

type SuccessfulCompileOutput = Extract<ChemdLanguageCompileOutput, { status: "ok" }>;
type ProgramDocument = SuccessfulCompileOutput["result"]["program"];
type ProgramDeclaration = ProgramDocument["declarations"][number];
type ProgramReference = { raw?: string; target?: string };
type ProgramProcedure = Extract<ProgramDeclaration, { kind: "procedure" }>;
type ProgramProcedureStatement = ProgramProcedure["children"][number];
type ProgramProcedureStep = Extract<ProgramProcedureStatement, { kind: "step" }>;
type ProgramProcedureControl = Extract<ProgramProcedureStatement, { kind: "control" }>;
type ProgramSourceSpan = NonNullable<ProgramDeclaration["sourceSpan"]>;

type SyntheticSemanticNode = Record<string, unknown> & {
  type: string;
  id?: string;
  sourceSpan?: ProgramSourceSpan;
  fieldSpans?: Record<string, ProgramSourceSpan>;
};

const emptyReactionMap = (documentUri = "current"): ReactionMapLayout =>
  buildReactionMapFromGraphIndex({
    graph_index_id: `desktop-knowledge-map::${documentUri}`,
    reaction_features: [],
    warnings: ["no_reaction_symbols_available"]
  }, {
    graph_index_id: `desktop-knowledge-map::${documentUri}`,
    generated_at: "1970-01-01T00:00:00.000Z"
  });

const buildState = (
  output: ChemdLanguageCompileOutput,
  reactionMap: ReactionMapLayout
): KnowledgeMapState => {
  if (output.status === "failed") {
    return "failed";
  }
  const semanticSymbolCount = output.symbols.filter((symbol) =>
    symbol.kind !== "module" && symbol.kind !== "meta"
  ).length;
  if (
    reactionMap.nodes.length === 0
    && semanticSymbolCount === 0
  ) {
    return "empty";
  }
  if (output.diagnostics.length > 0) {
    return "degraded";
  }
  return "ready";
};

const messageForState = (
  state: KnowledgeMapState
): string => {
  switch (state) {
    case "empty":
      return "Compiled document has no semantic outline or reaction nodes to map.";
    case "failed":
      return "Compile failed; semantic rendering and reaction map are unavailable.";
    case "degraded":
      return "Knowledge map is available with compile diagnostics.";
    case "ready":
      return "Semantic render tree and deterministic reaction map are available.";
  }
};

const isReactionSymbol = (symbol: ChemdSymbol): boolean =>
  symbol.kind === "reaction" || symbol.sourceNodeType === "reaction";

const reactionFeatureForSymbol = (
  symbol: ChemdSymbol,
  documentId: string
): ReactionMapExplicitInput["reaction_features"][number] => ({
  reaction_entity_id: symbol.id,
  document_id: documentId,
  reaction_signature: symbol.label,
  participant_signature: symbol.label,
  fingerprint_status: "not_available",
  chemistry_feature_ref_ids: [],
  cluster_keys: [
    { basis: "reaction_signature", key: symbol.label },
    { basis: "reaction_family", key: symbol.sourceNodeType ?? "reaction" }
  ],
  changed_variable_fields: [],
  controlled_variable_fields: []
});

const documentIdForOutput = (output: ChemdLanguageCompileOutput): string =>
  output.documentUri?.split(/[\\/]/u).pop()?.replace(/\.chemd(?:\.md)?$/u, "")
  || output.result?.program.meta.id
  || "current";

const buildReactionInput = (
  output: ChemdLanguageCompileOutput,
  artifact?: ChemdReactionIntelligenceArtifactV1 | null
): ReactionMapExplicitInput => {
  if (output.status === "failed") {
    return {
      graph_index_id: `desktop-knowledge-map::${output.documentUri ?? "failed"}`,
      reaction_features: [],
      warnings: ["compile_failed"]
    };
  }
  const documentId = documentIdForOutput(output);
  return {
    graph_index_id: `desktop-knowledge-map::${documentId}`,
    source_compile_run_ids: [output.compiledAt],
    reaction_features: output.symbols
      .filter(isReactionSymbol)
      .map((symbol) => reactionFeatureForSymbol(symbol, documentId)),
    explicit_edges: artifact?.similarity_edges.map((edge) => ({
      from_reaction_entity_id: edge.from_reaction_entity_id,
      to_reaction_entity_id: edge.to_reaction_entity_id,
      score: edge.score,
      basis: edge.basis,
      warnings: edge.warnings,
      evidence: [{
        evidence_id: edge.edge_id,
        source: "explicit_edge",
        basis: edge.basis,
        warnings: edge.warnings
      }]
    })),
    warnings: artifact
      ? ["deterministic_fallback_layout_used", "reaction_intelligence_edges_applied"]
      : ["deterministic_fallback_layout_used"]
  };
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const referenceText = (reference: unknown): string | undefined => {
  if (!isPlainRecord(reference)) {
    return undefined;
  }
  const programReference = reference as ProgramReference;
  return programReference.raw || (programReference.target ? `@${programReference.target}` : undefined);
};

const programValueToAttr = (value: unknown): unknown => {
  if (!isPlainRecord(value)) {
    return value;
  }
  switch (value.type) {
    case "string": return value.value;
    case "identifier": return value.name;
    case "boolean": return value.value;
    case "number": return value.value ?? value.raw;
    case "quantity": return value.raw;
    case "percent": return value.raw;
    case "reference": return referenceText(value as ProgramReference);
    case "list": return Array.isArray(value.items)
      ? value.items.map(programValueToAttr)
      : [];
    case "record": return isPlainRecord(value.fields)
      ? Object.fromEntries(Object.entries(value.fields).map(([key, item]) => [
        key,
        programValueToAttr(item)
      ]))
      : {};
    case "call": return value.raw ?? value.callee;
    case "patch": return value.raw;
    default: return value.raw ?? value.value ?? value;
  }
};

const programFieldsToAttrs = (
  fields: Record<string, unknown> | undefined
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [
    key,
    programValueToAttr(value)
  ]));

const programReferencesToAttrs = (
  references: readonly unknown[] | undefined
): string[] => (references ?? []).flatMap((reference) => {
  const value = referenceText(reference);
  return value ? [value] : [];
});

const declarationType = (kind: ProgramDeclaration["kind"]): string => {
  if (kind === "condition_screen") return "condition_varies";
  if (kind === "agent_run") return "trace";
  return kind;
};

const targetFieldForDeclaration = (
  kind: ProgramDeclaration["kind"]
): string | null => {
  switch (kind) {
    case "result":
    case "condition_screen":
      return "reaction";
    case "analysis":
    case "observation":
    case "trace":
      return "ref";
    default:
      return null;
  }
};

const procedureStepToNode = (
  step: ProgramProcedureStep
): SyntheticSemanticNode => ({
  type: "step",
  id: step.id,
  stepId: step.id,
  family: step.family,
  ...programFieldsToAttrs(step.args),
  inputs: programReferencesToAttrs(step.inputs),
  outputs: programReferencesToAttrs(step.outputs),
  dependsOn: [...(step.dependsOn ?? [])],
  evidence: programReferencesToAttrs(step.evidence),
  sourceSpan: step.sourceSpan
});

const procedureControlToNode = (
  control: ProgramProcedureControl
): SyntheticSemanticNode => ({
  type: "control",
  id: control.id,
  controlId: control.id,
  kind: control.controlKind,
  ...programFieldsToAttrs(control.args),
  children: control.children.flatMap(programProcedureStatementToNode),
  sourceSpan: control.sourceSpan
});

const programProcedureStatementToNode = (
  statement: ProgramProcedureStatement
): SyntheticSemanticNode[] => {
  if (statement.kind === "step") {
    return [procedureStepToNode(statement)];
  }
  if (statement.kind === "control") {
    return [procedureControlToNode(statement)];
  }
  return [];
};

const procedureDeclarationToNode = (
  declaration: ProgramProcedure
): SyntheticSemanticNode => ({
  type: "procedure",
  id: declaration.id,
  reaction: referenceText(declaration.target),
  evidence: programReferencesToAttrs(declaration.evidence),
  steps: declaration.children.filter((item): item is ProgramProcedureStep =>
    item.kind === "step"
  ).map(procedureStepToNode),
  controls: declaration.children.filter((item): item is ProgramProcedureControl =>
    item.kind === "control"
  ).map(procedureControlToNode),
  sourceSpan: declaration.sourceSpan,
  fieldSpans: declaration.fieldSpans
});

const agentRunDeclarationToNode = (
  declaration: Extract<ProgramDeclaration, { kind: "agent_run" }>
): SyntheticSemanticNode => ({
  type: "trace",
  id: declaration.id,
  agent_run: true,
  goal: declaration.goal,
  status: declaration.status,
  targetFiles: [...(declaration.targetFiles ?? [])],
  events: declaration.auditTimeline.map((event) => ({
    type: "trace_event",
    eventId: event.id,
    eventType: event.event,
    summary: event.summary,
    sourceSpan: event.sourceSpan
  })),
  sourceSpan: declaration.sourceSpan
});

const declarationToSemanticNode = (
  declaration: ProgramDeclaration
): SyntheticSemanticNode => {
  if (declaration.kind === "procedure") {
    return procedureDeclarationToNode(declaration);
  }
  if (declaration.kind === "agent_run") {
    return agentRunDeclarationToNode(declaration);
  }

  const attrs = "fields" in declaration
    ? programFieldsToAttrs(declaration.fields)
    : {};
  const targetField = targetFieldForDeclaration(declaration.kind);
  const target = "target" in declaration ? referenceText(declaration.target) : undefined;
  return {
    type: declarationType(declaration.kind),
    id: declaration.id,
    ...attrs,
    ...(targetField && target ? { [targetField]: target } : {}),
    sourceSpan: declaration.sourceSpan,
    fieldSpans: declaration.fieldSpans
  };
};

const buildProgramSemanticDocument = (
  program: ProgramDocument
) => ({
  type: "document" as const,
  meta: {
    id: program.meta.id,
    title: program.meta.title,
    date: program.meta.date
  },
  children: [
    ...program.docs.map((doc) => ({
      type: "markdown",
      value: doc.markdown,
      sourceSpan: doc.sourceSpan
    })),
    ...program.declarations.map(declarationToSemanticNode)
  ],
  diagnostics: program.diagnostics
});

const buildSemanticTreeForOutput = (
  output: SuccessfulCompileOutput
): ChemdSemanticRenderTreeV1 => {
  const renderInput = {
    document: buildProgramSemanticDocument(output.result.program),
    diagnostics: output.result.diagnostics,
    sourceUri: output.documentUri
  };
  return buildSemanticRenderTree(renderInput as Parameters<typeof buildSemanticRenderTree>[0]);
};

const summarizeSemanticTree = (
  tree: ChemdSemanticRenderTreeV1 | null
): SemanticSummary => {
  const components = new Map<string, number>();
  for (const node of tree?.nodes ?? []) {
    components.set(node.render.component, (components.get(node.render.component) ?? 0) + 1);
  }
  return {
    nodeCount: tree?.nodes.length ?? 0,
    heavyNodeCount: tree?.nodes.filter((node) => node.render.hydrate !== "never").length ?? 0,
    warningCount: tree?.warnings.length ?? 0,
    components: [...components.entries()]
      .map(([component, count]) => ({ component, count }))
      .sort((left, right) => right.count - left.count || left.component.localeCompare(right.component))
  };
};

const summarizeReactionMap = (
  reactionMap: ReactionMapLayout
): ReactionMapSummary => ({
  reactionCount: reactionMap.input_summary.reaction_count,
  clusterCount: reactionMap.input_summary.cluster_count,
  edgeCount: reactionMap.input_summary.edge_count,
  layoutEngine: reactionMap.layout_engine,
  message: reactionMap.layout_engine === "deterministic_fallback"
    ? "Using deterministic fallback layout; TMAP/worker output can replace positions later."
    : "Using external reaction map layout output."
});

const isReactionMapLayout = (value: unknown): value is ReactionMapLayout => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const layout = value as Partial<ReactionMapLayout>;
  return layout.schema_version === "chemd-reaction-cluster-layout/v0.1"
    && Array.isArray(layout.nodes)
    && Array.isArray(layout.edges)
    && Array.isArray(layout.clusters)
    && typeof layout.layout_engine === "string";
};

const uniqueSortedStrings = (values: readonly string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "en")
  );

const uniqueStrings = (values: readonly string[]): string[] =>
  Array.from(new Set(values.filter(Boolean)));

const providerStatusCounts = (
  artifact: ChemdReactionIntelligenceArtifactV1
): ArtifactProviderStatusCounts =>
  artifact.providers.reduce<ArtifactProviderStatusCounts>((counts, provider) => ({
    ...counts,
    [provider.status]: counts[provider.status] + 1
  }), { PASS: 0, SKIP: 0, ERROR: 0 });

const computedBasisForArtifact = (
  artifact: ChemdReactionIntelligenceArtifactV1
): ChemdComputedSimilarityBasisV1[] =>
  uniqueSortedStrings(
    artifact.similarity_edges.flatMap((edge) => edge.basis)
  ) as ChemdComputedSimilarityBasisV1[];

const summarizeReactionIntelligenceArtifact = (
  artifact: ChemdReactionIntelligenceArtifactV1 | null | undefined,
  reactionMap: ReactionMapLayout,
  layoutFromArtifact: boolean
): ReactionIntelligenceArtifactSummary | null => {
  if (!artifact) {
    return null;
  }
  return {
    artifactId: artifact.artifact_id,
    jobId: artifact.job_id,
    graphIndexId: artifact.graph_index_id,
    generatedAt: artifact.generated_at,
    providerStatusCounts: providerStatusCounts(artifact),
    computedEdgeCount: artifact.similarity_edges.length,
    computedBasis: computedBasisForArtifact(artifact),
    warnings: [...artifact.warnings],
    layout: {
      fromArtifact: layoutFromArtifact,
      usesTmap: reactionMap.layout_engine === "tmap",
      engine: reactionMap.layout_engine
    }
  };
};

const clusterRows = (
  reactionMap: ReactionMapLayout
): ReactionClusterRow[] =>
  reactionMap.clusters.map((cluster) => ({
    id: cluster.cluster_id,
    label: cluster.label,
    basis: cluster.basis,
    memberCount: cluster.member_count,
    confidence: cluster.confidence,
    reviewRequired: cluster.training_use.requires_human_review
  }));

const buildEdgeBasisOptions = (
  reactionMap: ReactionMapLayout,
  artifactSummary: ReactionIntelligenceArtifactSummary | null
): EdgeBasisOption[] =>
  uniqueSortedStrings([
    ...reactionMap.edges.flatMap((edge) => edge.basis),
    ...(artifactSummary?.computedBasis ?? [])
  ]).map((basis) => ({
    value: basis,
    label: basis,
    edgeCount: reactionMap.edges.filter((edge) => edge.basis.includes(basis)).length
  }));

export const filterKnowledgeMapNodes = (
  reactionMap: ReactionMapLayout,
  filters: {
    clusterId?: string;
    edgeBasis?: string;
  }
): ReactionMapLayout["nodes"] => {
  const clusterId = filters.clusterId ?? "all";
  const edgeBasis = filters.edgeBasis ?? "all";
  const connectedReactionIds = edgeBasis === "all"
    ? null
    : new Set(reactionMap.edges
      .filter((edge) => edge.basis.includes(edgeBasis))
      .flatMap((edge) => [
        edge.from_reaction_entity_id,
        edge.to_reaction_entity_id
      ]));

  return reactionMap.nodes.filter((node) =>
    (clusterId === "all" || node.cluster_id === clusterId)
    && (
      connectedReactionIds === null
      || connectedReactionIds.has(node.reaction_entity_id)
    )
  );
};

export const createKnowledgeMapSourceJumpIntent = (
  nodeId: string,
  semanticId: string | undefined,
  sourceRef: ChemdSourceRefV1 | undefined
): SourceJumpIntent | null => {
  if (!sourceRef || sourceRef.start_line === undefined) {
    return null;
  }
  return {
    kind: "chemd-source-jump",
    nodeId,
    semanticId,
    sourceKind: sourceRef.source_kind,
    sourceUri: sourceRef.source_uri,
    range: {
      startLine: sourceRef.start_line,
      endLine: sourceRef.end_line ?? sourceRef.start_line,
      startOffset: sourceRef.start_offset,
      endOffset: sourceRef.end_offset
    }
  };
};

const sourceRefLabel = (sourceRef: ChemdSourceRefV1): string => {
  let location = "source";
  if (sourceRef.start_line !== undefined) {
    const endLineSuffix = sourceRef.end_line ? `-L${sourceRef.end_line}` : "";
    location = `L${sourceRef.start_line}${endLineSuffix}`;
  }
  const uri = sourceRef.source_uri?.split(/[\\/]/u).pop();
  return uri ? `${uri} ${location}` : location;
};

const toSourceRef = (
  node: ChemdRenderableNodeV1
): RenderableSourceRef | null => {
  if (!node.source_ref) {
    return null;
  }
  return {
    label: sourceRefLabel(node.source_ref),
    sourceKind: node.source_ref.source_kind,
    sourceUri: node.source_ref.source_uri,
    startLine: node.source_ref.start_line,
    endLine: node.source_ref.end_line,
    intent: createKnowledgeMapSourceJumpIntent(node.node_id, node.semantic_id, node.source_ref)
  };
};

const semanticFlowLanes: SemanticFlowLane[] = [
  { id: "source", label: "Source", detail: "Document shell and sections" },
  { id: "materials", label: "Materials", detail: "Molecules and samples" },
  { id: "procedure", label: "Procedure", detail: "Procedure blocks and steps" },
  { id: "reaction", label: "Reaction", detail: "Reaction entities and conditions" },
  { id: "results", label: "Results", detail: "Results and artifacts" },
  { id: "analysis", label: "Analysis", detail: "Analysis nodes" },
  { id: "evidence", label: "Evidence", detail: "Observations and citations" }
];

const semanticFlowLaneByNodeType: Record<ChemdRenderableNodeV1["node_type"], SemanticFlowLaneId> = {
  ChemdAnalysisNode: "analysis",
  ChemdArtifactNode: "results",
  ChemdConditionAttemptNode: "reaction",
  ChemdConditionNode: "reaction",
  ChemdDocumentNode: "source",
  ChemdEvidenceNode: "evidence",
  ChemdListNode: "source",
  ChemdMaterialNode: "materials",
  ChemdBatchNode: "materials",
  ChemdMoleculeNode: "materials",
  ChemdObservationEventNode: "evidence",
  ChemdParagraphNode: "source",
  ChemdProcedureControlNode: "procedure",
  ChemdProcedureNode: "procedure",
  ChemdProcedureStepNode: "procedure",
  ChemdReactionNode: "reaction",
  ChemdResultNode: "results",
  ChemdSampleNode: "materials",
  ChemdSectionNode: "source",
  ChemdTableNode: "source",
  ChemdTraceEventNode: "source",
  ChemdTraceNode: "source",
  ChemdUnknownNode: "evidence"
};

const semanticFlowLaneForType = (
  nodeType: ChemdRenderableNodeV1["node_type"]
): SemanticFlowLaneId => semanticFlowLaneByNodeType[nodeType];

const nodeOrder = (node: ChemdRenderableNodeV1, fallback: number): number =>
  node.source_ref?.start_line ?? fallback;

const nodeLabel = (node: ChemdRenderableNodeV1): string =>
  node.semantic_id
  ?? node.original_id
  ?? (typeof node.attrs.name === "string" ? node.attrs.name : undefined)
  ?? node.node_type.replace(/^Chemd|Node$/g, "")
  ?? node.node_id;

const nodeDetail = (node: ChemdRenderableNodeV1): string =>
  node.source_ref ? sourceRefLabel(node.source_ref) : node.render.component;

const nodeSeverity = (
  node: ChemdRenderableNodeV1
): ChemdEditorDiagnostic["severity"] | null => {
  if (node.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "error";
  }
  if (node.diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "warning";
  }
  if (node.diagnostics.length > 0) {
    return "info";
  }
  return null;
};

const isFlowNode = (node: ChemdRenderableNodeV1): boolean =>
  node.node_type !== "ChemdParagraphNode"
  && node.node_type !== "ChemdListNode"
  && node.node_type !== "ChemdTableNode"
  && node.node_type !== "ChemdTraceNode"
  && node.node_type !== "ChemdTraceEventNode";

const semanticFlowNode = (
  node: ChemdRenderableNodeV1,
  order: number
): SemanticFlowNode => ({
  id: node.node_id,
  laneId: semanticFlowLaneForType(node.node_type),
  nodeType: node.node_type,
  label: nodeLabel(node),
  detail: nodeDetail(node),
  component: node.render.component,
  sourceRef: toSourceRef(node),
  diagnosticSeverity: nodeSeverity(node),
  order
});

const sortableSemanticFlowNodes = (
  tree: ChemdSemanticRenderTreeV1
): SemanticFlowNode[] =>
  tree.nodes
    .filter(isFlowNode)
    .map((node, index) => semanticFlowNode(node, nodeOrder(node, index + 1)))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

const addFlowEdge = (
  edges: Map<string, SemanticFlowEdge>,
  edge: SemanticFlowEdge
): void => {
  if (edge.sourceId !== edge.targetId) {
    edges.set(edge.id, edge);
  }
};

const addDocumentOrderEdges = (
  edges: Map<string, SemanticFlowEdge>,
  nodes: readonly SemanticFlowNode[]
): void => {
  nodes.slice(0, -1).forEach((node, index) => {
    const target = nodes[index + 1];
    if (!target) return;
    addFlowEdge(edges, {
      id: `order:${node.id}->${target.id}`,
      sourceId: node.id,
      targetId: target.id,
      kind: "document_order",
      label: "next"
    });
  });
};

const addContainsEdges = (
  edges: Map<string, SemanticFlowEdge>,
  node: ChemdRenderableNodeV1,
  visibleIds: ReadonlySet<string>
): void => {
  node.children.forEach((child) => {
    if (visibleIds.has(node.node_id) && visibleIds.has(child.node_id)) {
      addFlowEdge(edges, {
        id: `contains:${node.node_id}->${child.node_id}`,
        sourceId: node.node_id,
        targetId: child.node_id,
        kind: "contains",
        label: "contains"
      });
    }
    addContainsEdges(edges, child, visibleIds);
  });
};

type ReferenceEdgeDirection = "from_reference" | "to_reference";

interface ReferenceEdgeRule {
  nodeType: ChemdRenderableNodeV1["node_type"];
  field: string;
  direction: ReferenceEdgeDirection;
  kind: SemanticFlowEdge["kind"];
  label: string;
}

const referenceEdgeRules: ReferenceEdgeRule[] = [
  { nodeType: "ChemdReactionNode", field: "reactants", direction: "from_reference", kind: "reactant", label: "reactant" },
  { nodeType: "ChemdReactionNode", field: "products", direction: "to_reference", kind: "product", label: "product" },
  { nodeType: "ChemdProcedureNode", field: "reaction", direction: "to_reference", kind: "semantic_relation", label: "procedure reaction" },
  { nodeType: "ChemdProcedureNode", field: "ref", direction: "to_reference", kind: "semantic_relation", label: "procedure ref" },
  { nodeType: "ChemdProcedureNode", field: "evidence", direction: "to_reference", kind: "evidence", label: "procedure evidence" },
  { nodeType: "ChemdProcedureStepNode", field: "inputs", direction: "from_reference", kind: "semantic_relation", label: "step input" },
  { nodeType: "ChemdProcedureStepNode", field: "outputs", direction: "to_reference", kind: "semantic_relation", label: "step output" },
  { nodeType: "ChemdProcedureStepNode", field: "dependsOn", direction: "from_reference", kind: "semantic_relation", label: "step dependency" },
  { nodeType: "ChemdProcedureStepNode", field: "evidence", direction: "to_reference", kind: "evidence", label: "step evidence" },
  { nodeType: "ChemdProcedureControlNode", field: "outputs", direction: "to_reference", kind: "semantic_relation", label: "control output" },
  { nodeType: "ChemdConditionNode", field: "reaction", direction: "from_reference", kind: "semantic_relation", label: "condition reaction" },
  { nodeType: "ChemdConditionNode", field: "standard", direction: "from_reference", kind: "semantic_relation", label: "condition standard" },
  { nodeType: "ChemdConditionAttemptNode", field: "reaction", direction: "from_reference", kind: "semantic_relation", label: "attempt reaction" },
  { nodeType: "ChemdConditionAttemptNode", field: "result", direction: "to_reference", kind: "semantic_relation", label: "attempt result" },
  { nodeType: "ChemdResultNode", field: "reaction", direction: "from_reference", kind: "semantic_relation", label: "result reaction" },
  { nodeType: "ChemdResultNode", field: "product", direction: "from_reference", kind: "semantic_relation", label: "result product" },
  { nodeType: "ChemdResultNode", field: "ref", direction: "from_reference", kind: "semantic_relation", label: "result ref" },
  { nodeType: "ChemdAnalysisNode", field: "ref", direction: "from_reference", kind: "semantic_relation", label: "analysis ref" },
  { nodeType: "ChemdAnalysisNode", field: "result", direction: "from_reference", kind: "semantic_relation", label: "analysis result" },
  { nodeType: "ChemdAnalysisNode", field: "artifact", direction: "from_reference", kind: "semantic_relation", label: "analysis artifact" },
  { nodeType: "ChemdAnalysisNode", field: "artifacts", direction: "from_reference", kind: "semantic_relation", label: "analysis artifact" },
  { nodeType: "ChemdSampleNode", field: "ref", direction: "from_reference", kind: "semantic_relation", label: "sample ref" },
  { nodeType: "ChemdSampleNode", field: "derived_from", direction: "from_reference", kind: "semantic_relation", label: "sample derived" },
  { nodeType: "ChemdSampleNode", field: "aliquot_of", direction: "from_reference", kind: "semantic_relation", label: "sample aliquot" },
  { nodeType: "ChemdSampleNode", field: "batch_of", direction: "from_reference", kind: "semantic_relation", label: "sample batch" },
  { nodeType: "ChemdSampleNode", field: "artifacts", direction: "to_reference", kind: "semantic_relation", label: "sample artifact" },
  { nodeType: "ChemdArtifactNode", field: "ref", direction: "from_reference", kind: "semantic_relation", label: "artifact ref" },
  { nodeType: "ChemdEvidenceNode", field: "ref", direction: "from_reference", kind: "evidence", label: "observation ref" },
  { nodeType: "ChemdObservationEventNode", field: "linkedStepId", direction: "from_reference", kind: "evidence", label: "event step" },
  { nodeType: "ChemdObservationEventNode", field: "evidence", direction: "to_reference", kind: "evidence", label: "event evidence" }
];

const referenceCandidates = (value: unknown): string[] => {
  if (typeof value === "string") {
    const referencePart = value.split("|")[0]?.trim() ?? value.trim();
    return uniqueStrings(referencePart.split(/[,\s]+/u)
      .map((item) => item.trim().replace(/^[@#]/u, "").replace(/[;:.)\]]+$/u, ""))
      .filter(Boolean));
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap(referenceCandidates));
  }
  if (isPlainRecord(value)) {
    if (value.type === "reference") {
      return typeof value.target === "string" ? [value.target] : referenceCandidates(value.raw);
    }
    if (value.type === "list") {
      return referenceCandidates(value.items);
    }
    return uniqueStrings(Object.values(value).flatMap(referenceCandidates));
  }
  return [];
};

const buildNodeLookup = (
  tree: ChemdSemanticRenderTreeV1,
  visibleIds: ReadonlySet<string>
): Map<string, ChemdRenderableNodeV1> => {
  const lookup = new Map<string, ChemdRenderableNodeV1>();
  tree.nodes.filter((node) => visibleIds.has(node.node_id)).forEach((node) => {
    [node.node_id, node.semantic_id, node.original_id].forEach((id) => {
      if (id) lookup.set(id, node);
    });
  });
  return lookup;
};

const relationEndpointIds = (
  node: ChemdRenderableNodeV1,
  target: ChemdRenderableNodeV1,
  direction: ReferenceEdgeDirection
): { sourceId: string; targetId: string } =>
  direction === "from_reference"
    ? { sourceId: target.node_id, targetId: node.node_id }
    : { sourceId: node.node_id, targetId: target.node_id };

const addReferenceEdge = (
  edges: Map<string, SemanticFlowEdge>,
  node: ChemdRenderableNodeV1,
  target: ChemdRenderableNodeV1,
  rule: ReferenceEdgeRule,
  ref: string
): void => {
  const endpoint = relationEndpointIds(node, target, rule.direction);
  addFlowEdge(edges, {
    id: `${rule.kind}:${rule.field}:${endpoint.sourceId}->${endpoint.targetId}:${ref}`,
    sourceId: endpoint.sourceId,
    targetId: endpoint.targetId,
    kind: rule.kind,
    label: rule.label
  });
};

const addSemanticReferenceEdges = (
  edges: Map<string, SemanticFlowEdge>,
  tree: ChemdSemanticRenderTreeV1,
  visibleIds: ReadonlySet<string>
): void => {
  const lookup = buildNodeLookup(tree, visibleIds);
  for (const node of tree.nodes.filter((item) => visibleIds.has(item.node_id))) {
    for (const rule of referenceEdgeRules.filter((item) => item.nodeType === node.node_type)) {
      referenceCandidates(node.attrs[rule.field]).forEach((ref) => {
        const target = lookup.get(ref);
        if (target) addReferenceEdge(edges, node, target, rule, ref);
      });
    }
  }
};

const semanticFlowMessage = (nodes: readonly SemanticFlowNode[]): string =>
  nodes.length === 0
    ? "No compiled semantic nodes are available for a document flow diagram."
    : "Document semantic flow is generated from compiled nodes, source ranges, and reaction references.";

const buildSemanticFlowDiagram = (
  tree: ChemdSemanticRenderTreeV1 | null
): SemanticFlowDiagram => {
  if (!tree) {
    return { lanes: semanticFlowLanes, nodes: [], edges: [], message: semanticFlowMessage([]) };
  }
  const nodes = sortableSemanticFlowNodes(tree);
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = new Map<string, SemanticFlowEdge>();
  addDocumentOrderEdges(edges, nodes);
  addContainsEdges(edges, tree.root, visibleIds);
  addSemanticReferenceEdges(edges, tree, visibleIds);
  return {
    lanes: semanticFlowLanes,
    nodes,
    edges: [...edges.values()],
    message: semanticFlowMessage(nodes)
  };
};

const clusterBadgeForReaction = (
  reactionId: string,
  reactionMap: ReactionMapLayout
): ReactionClusterBadge | null => {
  const mapNode = reactionMap.nodes.find((node) => node.reaction_entity_id === reactionId);
  const cluster = reactionMap.clusters.find((item) => item.cluster_id === mapNode?.cluster_id);
  if (!cluster) {
    return null;
  }
  return {
    clusterId: cluster.cluster_id,
    label: cluster.label,
    basis: cluster.basis,
    confidence: cluster.confidence,
    memberCount: cluster.member_count,
    reviewRequired: cluster.training_use.requires_human_review
  };
};

const childRow = (node: ChemdRenderableNodeV1): RenderableChildRow => ({
  nodeId: node.node_id,
  nodeType: node.node_type,
  label: node.semantic_id ?? node.original_id ?? node.node_type,
  sourceRef: toSourceRef(node)
});

const reactionRenderableRows = (
  tree: ChemdSemanticRenderTreeV1 | null,
  reactionMap: ReactionMapLayout
): ReactionRenderableRow[] =>
  (tree?.nodes ?? [])
    .filter((node) => node.node_type === "ChemdReactionNode" && node.semantic_id)
    .map((node) => ({
      nodeId: node.node_id,
      semanticId: node.semantic_id ?? node.node_id,
      component: node.render.component,
      hydration: node.render.hydrate,
      title: node.semantic_id ?? node.original_id ?? node.node_id,
      sourceRef: toSourceRef(node),
      clusterBadge: clusterBadgeForReaction(node.semantic_id ?? node.node_id, reactionMap),
      children: node.children.map(childRow)
    }));

const evidenceSourceRows = (
  tree: ChemdSemanticRenderTreeV1 | null
): EvidenceSourceRow[] =>
  (tree?.nodes ?? [])
    .filter((node) => node.node_type === "ChemdEvidenceNode")
    .map((node) => ({ node, sourceRef: toSourceRef(node) }))
    .filter((row): row is { node: ChemdRenderableNodeV1; sourceRef: RenderableSourceRef } =>
      row.sourceRef !== null
    )
    .map(({ node, sourceRef }) => ({
      nodeId: node.node_id,
      label: node.semantic_id ?? node.original_id ?? "evidence",
      sourceRef
    }));

type ReactionMapNode = ReactionMapLayout["nodes"][number];
type ReactionMapEdge = ReactionMapLayout["edges"][number];

type ReactionMapNodeWithSource = ReactionMapNode & {
  label?: string;
  reaction_signature?: string;
  source_ref?: ChemdSourceRefV1;
};

type ReactionMapEdgeEvidencePayload = {
  evidence_id?: string;
  source?: string;
  basis?: readonly string[] | string;
  warnings?: readonly string[];
};

type ReactionMapEdgeWithEvidence = ReactionMapEdge & {
  edge_id?: string;
  evidence?: readonly ReactionMapEdgeEvidencePayload[];
  score?: number;
  warnings?: readonly string[];
};

const sourceRefForReactionMapNode = (
  node: ReactionMapNodeWithSource
): RenderableSourceRef | null => {
  if (!node.source_ref) {
    return null;
  }
  return {
    label: sourceRefLabel(node.source_ref),
    sourceKind: node.source_ref.source_kind,
    sourceUri: node.source_ref.source_uri,
    startLine: node.source_ref.start_line,
    endLine: node.source_ref.end_line,
    intent: createKnowledgeMapSourceJumpIntent(
      `reaction::${node.reaction_entity_id}`,
      node.reaction_entity_id,
      node.source_ref
    )
  };
};

const reactionSourceRefMap = (
  tree: ChemdSemanticRenderTreeV1 | null
): Map<string, RenderableSourceRef | null> =>
  new Map((tree?.nodes ?? [])
    .filter((node) => node.node_type === "ChemdReactionNode" && node.semantic_id)
    .map((node) => [node.semantic_id ?? node.node_id, toSourceRef(node)]));

const reactionLabel = (
  node: ReactionMapNodeWithSource | undefined,
  reactionId: string
): string =>
  node?.label ?? node?.reaction_signature ?? reactionId;

const sourceRefForReactionEndpoint = (
  node: ReactionMapNodeWithSource | undefined,
  sourceRefsByReactionId: ReadonlyMap<string, RenderableSourceRef | null>,
  reactionId: string
): RenderableSourceRef | null => {
  if (!node) {
    return null;
  }
  return sourceRefForReactionMapNode(node)
    ?? sourceRefsByReactionId.get(reactionId)
    ?? null;
};

const edgeEndpoint = (
  node: ReactionMapNodeWithSource | undefined,
  sourceRefsByReactionId: ReadonlyMap<string, RenderableSourceRef | null>,
  reactionId: string
): EdgeEvidenceEndpoint => {
  const sourceRef = sourceRefForReactionEndpoint(node, sourceRefsByReactionId, reactionId);
  return {
    reactionId,
    label: reactionLabel(node, reactionId),
    sourceRef,
    jumpIntent: sourceRef?.intent ?? null
  };
};

const edgeEvidenceBasis = (
  basis: ReactionMapEdgeEvidencePayload["basis"],
  fallbackBasis: readonly string[]
): string[] => {
  if (Array.isArray(basis)) {
    return [...basis];
  }
  if (typeof basis === "string" && basis.length > 0) {
    return [basis];
  }
  return [...fallbackBasis];
};

const edgeEvidenceSources = (
  edge: ReactionMapEdgeWithEvidence,
  fallbackBasis: readonly string[],
  fallbackWarnings: readonly string[]
): EdgeEvidenceSourceRow[] => {
  const evidence = edge.evidence ?? [];
  if (evidence.length === 0) {
    return [{
      evidenceId: edge.edge_id,
      source: "reaction_map_edge",
      basis: [...fallbackBasis],
      warnings: [...fallbackWarnings]
    }];
  }
  return evidence.map((item) => ({
    evidenceId: item.evidence_id,
    source: item.source ?? "reaction_map_edge",
    basis: edgeEvidenceBasis(item.basis, fallbackBasis),
    warnings: [...(item.warnings ?? [])]
  }));
};

const edgeWarnings = (
  edge: ReactionMapEdgeWithEvidence
): string[] =>
  uniqueStrings([
    ...(edge.warnings ?? []),
    ...((edge.evidence ?? []).flatMap((item) => item.warnings ?? []))
  ]);

const edgeId = (
  edge: ReactionMapEdgeWithEvidence,
  basis: readonly string[]
): string =>
  edge.edge_id
  ?? edge.evidence?.find((item) => item.evidence_id)?.evidence_id
  ?? `${edge.from_reaction_entity_id}->${edge.to_reaction_entity_id}:${basis.join("|") || "edge"}`;

const edgeEvidenceRows = (
  reactionMap: ReactionMapLayout,
  tree: ChemdSemanticRenderTreeV1 | null
): EdgeEvidenceRow[] => {
  const sourceRefsByReactionId = reactionSourceRefMap(tree);
  const nodesByReactionId = new Map(reactionMap.nodes.map((node) => [
    node.reaction_entity_id,
    node as ReactionMapNodeWithSource
  ]));

  return reactionMap.edges.map((rawEdge) => {
    const edge = rawEdge as ReactionMapEdgeWithEvidence;
    const basis = [...edge.basis];
    const warnings = edgeWarnings(edge);
    return {
      edgeId: edgeId(edge, basis),
      from: edgeEndpoint(
        nodesByReactionId.get(edge.from_reaction_entity_id),
        sourceRefsByReactionId,
        edge.from_reaction_entity_id
      ),
      to: edgeEndpoint(
        nodesByReactionId.get(edge.to_reaction_entity_id),
        sourceRefsByReactionId,
        edge.to_reaction_entity_id
      ),
      basis,
      score: typeof edge.score === "number" ? edge.score : null,
      warnings,
      evidenceSources: edgeEvidenceSources(edge, basis, warnings)
    };
  });
};

const highestDiagnosticSeverity = (
  diagnostics: readonly ChemdEditorDiagnostic[]
): ChemdEditorDiagnostic["severity"] | null => {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "error";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "warning";
  }
  if (diagnostics.length > 0) {
    return "info";
  }
  return null;
};

export const buildKnowledgeMapViewModel = (
  output: ChemdLanguageCompileOutput,
  options: BuildKnowledgeMapViewModelOptions = {}
): KnowledgeMapViewModel => {
  const artifact = options.reactionIntelligenceArtifact;
  const reactionMapFromArtifact = isReactionMapLayout(artifact?.layout)
    ? artifact.layout
    : null;
  const semanticTree = output.status === "ok"
    ? buildSemanticTreeForOutput(output)
    : null;
  const reactionMap = reactionMapFromArtifact ?? (output.status === "failed"
    ? emptyReactionMap(output.documentUri)
    : buildReactionMapFromGraphIndex(buildReactionInput(output, artifact), {
      graph_index_id: `desktop-knowledge-map::${documentIdForOutput(output)}`,
      source_compile_run_ids: [output.compiledAt],
      generated_at: output.compiledAt,
      input_edge_kind: artifact && artifact.similarity_edges.length > 0 ? "hybrid" : "semantic"
    }));
  const state = buildState(output, reactionMap);
  const severity = highestDiagnosticSeverity(output.diagnostics);
  const reactionIntelligenceArtifact = summarizeReactionIntelligenceArtifact(
    artifact,
    reactionMap,
    reactionMapFromArtifact !== null
  );

  return {
    state,
    message: severity === "error" && state === "degraded"
      ? "Knowledge map is degraded by compile errors; review diagnostics before persisting graph data."
      : messageForState(state),
    semanticTree,
    semanticSummary: summarizeSemanticTree(semanticTree),
    semanticFlow: buildSemanticFlowDiagram(semanticTree),
    reactionMap,
    reactionSummary: summarizeReactionMap(reactionMap),
    reactionIntelligenceArtifact,
    edgeBasisOptions: buildEdgeBasisOptions(reactionMap, reactionIntelligenceArtifact),
    clusters: clusterRows(reactionMap),
    reactionRenderables: reactionRenderableRows(semanticTree, reactionMap),
    evidenceSourceRefs: evidenceSourceRows(semanticTree),
    edgeEvidenceRows: edgeEvidenceRows(reactionMap, semanticTree)
  };
};
