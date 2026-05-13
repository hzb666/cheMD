import {
  buildReactionMapFromGraphIndex,
  type ReactionMapExplicitInput,
  type ReactionMapLayout
} from "@chemd/reaction-map";
import {
  buildSemanticRenderTree,
  type ChemdSemanticRenderTreeV1
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

export interface DesktopReactionClusterRow {
  id: string;
  label: string;
  basis: string;
  memberCount: number;
  confidence: string;
  reviewRequired: boolean;
}

export interface DesktopKnowledgeMapViewModel {
  state: DesktopKnowledgeMapState;
  message: string;
  semanticTree: ChemdSemanticRenderTreeV1 | null;
  semanticSummary: DesktopSemanticSummary;
  reactionMap: ReactionMapLayout;
  reactionSummary: DesktopReactionMapSummary;
  clusters: DesktopReactionClusterRow[];
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
  output: ChemdLanguageCompileOutput
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
    warnings: ["deterministic_fallback_layout_used"]
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
  output: ChemdLanguageCompileOutput
): DesktopKnowledgeMapViewModel => {
  const semanticTree = output.status === "ok"
    ? buildSemanticRenderTree({
      document: output.result.document,
      diagnostics: output.result.diagnostics,
      sourceUri: output.documentUri
    })
    : null;
  const reactionMap = output.status === "failed"
    ? emptyReactionMap(output.documentUri)
    : buildReactionMapFromGraphIndex(buildReactionInput(output), {
      graph_index_id: `desktop-knowledge-map::${documentIdForOutput(output)}`,
      source_compile_run_ids: [output.compiledAt],
      generated_at: output.compiledAt
    });
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
    clusters: clusterRows(reactionMap)
  };
};
