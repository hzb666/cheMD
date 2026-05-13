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

export type DesktopKnowledgeMapState = "empty" | "ready" | "degraded" | "failed";

export interface DesktopSemanticSummary {
  nodeCount: number;
  heavyNodeCount: number;
  warningCount: number;
  components: Array<{ component: string; count: number }>;
}

export interface DesktopReactionMapSummary {
  reactionCount: number;
  clusterCount: number;
  edgeCount: number;
  layoutEngine: ReactionMapLayout["layout_engine"];
  message: string;
}

export interface DesktopArtifactProviderStatusCounts {
  PASS: number;
  SKIP: number;
  ERROR: number;
}

export interface DesktopReactionIntelligenceArtifactSummary {
  artifactId: string;
  jobId: string;
  graphIndexId: string;
  generatedAt: string;
  providerStatusCounts: DesktopArtifactProviderStatusCounts;
  computedEdgeCount: number;
  computedBasis: ChemdComputedSimilarityBasisV1[];
  warnings: string[];
  layout: {
    fromArtifact: boolean;
    usesTmap: boolean;
    engine: ReactionMapLayout["layout_engine"];
  };
}

export interface DesktopReactionClusterRow {
  id: string;
  label: string;
  basis: string;
  memberCount: number;
  confidence: string;
  reviewRequired: boolean;
}

export interface DesktopSourceJumpIntent {
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

export interface DesktopRenderableSourceRef {
  label: string;
  sourceKind: ChemdSourceRefV1["source_kind"];
  sourceUri?: string;
  startLine?: number;
  endLine?: number;
  intent: DesktopSourceJumpIntent | null;
}

export interface DesktopReactionClusterBadge {
  clusterId: string;
  label: string;
  basis: string;
  confidence: string;
  memberCount: number;
  reviewRequired: boolean;
}

export interface DesktopRenderableChildRow {
  nodeId: string;
  nodeType: string;
  label: string;
  sourceRef: DesktopRenderableSourceRef | null;
}

export interface DesktopReactionRenderableRow {
  nodeId: string;
  semanticId: string;
  component: string;
  hydration: string;
  title: string;
  sourceRef: DesktopRenderableSourceRef | null;
  clusterBadge: DesktopReactionClusterBadge | null;
  children: DesktopRenderableChildRow[];
}

export interface DesktopEvidenceSourceRow {
  nodeId: string;
  label: string;
  sourceRef: DesktopRenderableSourceRef;
}

export interface DesktopKnowledgeMapViewModel {
  state: DesktopKnowledgeMapState;
  message: string;
  semanticTree: ChemdSemanticRenderTreeV1 | null;
  semanticSummary: DesktopSemanticSummary;
  reactionMap: ReactionMapLayout;
  reactionSummary: DesktopReactionMapSummary;
  reactionIntelligenceArtifact: DesktopReactionIntelligenceArtifactSummary | null;
  clusters: DesktopReactionClusterRow[];
  reactionRenderables: DesktopReactionRenderableRow[];
  evidenceSourceRefs: DesktopEvidenceSourceRow[];
}

export interface BuildDesktopKnowledgeMapViewModelOptions {
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
): DesktopKnowledgeMapState => {
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
  state: DesktopKnowledgeMapState
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
): DesktopSemanticSummary => {
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
): DesktopReactionMapSummary => ({
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

const providerStatusCounts = (
  artifact: ChemdReactionIntelligenceArtifactV1
): DesktopArtifactProviderStatusCounts =>
  artifact.providers.reduce<DesktopArtifactProviderStatusCounts>((counts, provider) => ({
    ...counts,
    [provider.status]: counts[provider.status] + 1
  }), { PASS: 0, SKIP: 0, ERROR: 0 });

const computedBasisForArtifact = (
  artifact: ChemdReactionIntelligenceArtifactV1
): ChemdComputedSimilarityBasisV1[] =>
  Array.from(new Set(artifact.similarity_edges.flatMap((edge) => edge.basis))).sort();

const summarizeReactionIntelligenceArtifact = (
  artifact: ChemdReactionIntelligenceArtifactV1 | null | undefined,
  reactionMap: ReactionMapLayout,
  layoutFromArtifact: boolean
): DesktopReactionIntelligenceArtifactSummary | null => {
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
): DesktopReactionClusterRow[] =>
  reactionMap.clusters.map((cluster) => ({
    id: cluster.cluster_id,
    label: cluster.label,
    basis: cluster.basis,
    memberCount: cluster.member_count,
    confidence: cluster.confidence,
    reviewRequired: cluster.training_use.requires_human_review
  }));

export const createKnowledgeMapSourceJumpIntent = (
  nodeId: string,
  semanticId: string | undefined,
  sourceRef: ChemdSourceRefV1 | undefined
): DesktopSourceJumpIntent | null => {
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
  const location = sourceRef.start_line === undefined
    ? "source"
    : `L${sourceRef.start_line}${sourceRef.end_line ? `-L${sourceRef.end_line}` : ""}`;
  const uri = sourceRef.source_uri?.split(/[\\/]/u).pop();
  return uri ? `${uri} ${location}` : location;
};

const toDesktopSourceRef = (
  node: ChemdRenderableNodeV1
): DesktopRenderableSourceRef | null => {
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

const clusterBadgeForReaction = (
  reactionId: string,
  reactionMap: ReactionMapLayout
): DesktopReactionClusterBadge | null => {
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

const childRow = (node: ChemdRenderableNodeV1): DesktopRenderableChildRow => ({
  nodeId: node.node_id,
  nodeType: node.node_type,
  label: node.semantic_id ?? node.original_id ?? node.node_type,
  sourceRef: toDesktopSourceRef(node)
});

const reactionRenderableRows = (
  tree: ChemdSemanticRenderTreeV1 | null,
  reactionMap: ReactionMapLayout
): DesktopReactionRenderableRow[] =>
  (tree?.nodes ?? [])
    .filter((node) => node.node_type === "ChemdReactionNode" && node.semantic_id)
    .map((node) => ({
      nodeId: node.node_id,
      semanticId: node.semantic_id ?? node.node_id,
      component: node.render.component,
      hydration: node.render.hydrate,
      title: node.semantic_id ?? node.original_id ?? node.node_id,
      sourceRef: toDesktopSourceRef(node),
      clusterBadge: clusterBadgeForReaction(node.semantic_id ?? node.node_id, reactionMap),
      children: node.children.map(childRow)
    }));

const evidenceSourceRows = (
  tree: ChemdSemanticRenderTreeV1 | null
): DesktopEvidenceSourceRow[] =>
  (tree?.nodes ?? [])
    .filter((node) => node.node_type === "ChemdEvidenceNode")
    .map((node) => ({ node, sourceRef: toDesktopSourceRef(node) }))
    .filter((row): row is { node: ChemdRenderableNodeV1; sourceRef: DesktopRenderableSourceRef } =>
      row.sourceRef !== null
    )
    .map(({ node, sourceRef }) => ({
      nodeId: node.node_id,
      label: node.semantic_id ?? node.original_id ?? "evidence",
      sourceRef
    }));

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

export const buildDesktopKnowledgeMapViewModel = (
  output: ChemdLanguageCompileOutput,
  options: BuildDesktopKnowledgeMapViewModelOptions = {}
): DesktopKnowledgeMapViewModel => {
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

  return {
    state,
    message: severity === "error" && state === "degraded"
      ? "Knowledge map is degraded by compile errors; review diagnostics before persisting graph data."
      : messageForState(state),
    semanticTree,
    semanticSummary: summarizeSemanticTree(semanticTree),
    reactionMap,
    reactionSummary: summarizeReactionMap(reactionMap),
    reactionIntelligenceArtifact: summarizeReactionIntelligenceArtifact(
      artifact,
      reactionMap,
      reactionMapFromArtifact !== null
    ),
    clusters: clusterRows(reactionMap),
    reactionRenderables: reactionRenderableRows(semanticTree, reactionMap),
    evidenceSourceRefs: evidenceSourceRows(semanticTree)
  };
};
