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
  kind: "document_order" | "contains" | "reactant" | "product" | "evidence";
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
  if (
    reactionMap.nodes.length === 0
    && output.outline.every((item) => item.kind === "metadata")
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
  || output.result?.document.meta.id
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
  ChemdColumnNode: "source",
  ChemdConditionNode: "procedure",
  ChemdDocumentNode: "source",
  ChemdEvidenceNode: "evidence",
  ChemdListNode: "source",
  ChemdMoleculeNode: "materials",
  ChemdParagraphNode: "source",
  ChemdProcedureNode: "procedure",
  ChemdProcedureStepNode: "procedure",
  ChemdReactionNode: "reaction",
  ChemdResultNode: "results",
  ChemdSampleNode: "materials",
  ChemdSectionNode: "source",
  ChemdTableNode: "source",
  ChemdTemplateNode: "source",
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
  && node.node_type !== "ChemdColumnNode";

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

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const addReactionMaterialEdges = (
  edges: Map<string, SemanticFlowEdge>,
  tree: ChemdSemanticRenderTreeV1,
  visibleIds: ReadonlySet<string>
): void => {
  const nodeBySemanticId = new Map(tree.nodes
    .filter((node) => node.semantic_id && visibleIds.has(node.node_id))
    .map((node) => [node.semantic_id ?? "", node]));

  tree.nodes
    .filter((node) => node.node_type === "ChemdReactionNode" && visibleIds.has(node.node_id))
    .forEach((reaction) => {
      stringList(reaction.attrs.reactants).forEach((id) => {
        const source = nodeBySemanticId.get(id);
        if (source) addFlowEdge(edges, {
          id: `reactant:${source.node_id}->${reaction.node_id}`,
          sourceId: source.node_id,
          targetId: reaction.node_id,
          kind: "reactant",
          label: "reactant"
        });
      });
      stringList(reaction.attrs.products).forEach((id) => {
        const target = nodeBySemanticId.get(id);
        if (target) addFlowEdge(edges, {
          id: `product:${reaction.node_id}->${target.node_id}`,
          sourceId: reaction.node_id,
          targetId: target.node_id,
          kind: "product",
          label: "product"
        });
      });
    });
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
  addReactionMaterialEdges(edges, tree, visibleIds);
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
    ? buildSemanticRenderTree({
      document: output.result.document,
      diagnostics: output.result.diagnostics,
      sourceUri: output.documentUri
    })
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
