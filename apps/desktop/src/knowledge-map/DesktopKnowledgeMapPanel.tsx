import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Filter, GitGraph, LocateFixed } from "lucide-react";

import type {
  DesktopKnowledgeMapViewModel,
  DesktopRenderableSourceRef,
  DesktopSourceJumpIntent
} from "./desktop-knowledge-map";
import { filterDesktopKnowledgeMapNodes } from "./desktop-knowledge-map";

interface KnowledgeMapPanelProps {
  viewModel: DesktopKnowledgeMapViewModel;
  onSourceJump?: (intent: DesktopSourceJumpIntent) => void;
}

export const DesktopKnowledgeMapPanel = ({
  viewModel,
  onSourceJump
}: KnowledgeMapPanelProps) => {
  const [selectedClusterId, setSelectedClusterId] = useState<string>("all");
  const [selectedEdgeBasis, setSelectedEdgeBasis] = useState<string>("all");
  const [selectedReactionId, setSelectedReactionId] = useState<string | null>(null);
  const [expandedReactionIds, setExpandedReactionIds] = useState<string[]>([]);
  const graphNodes = useMemo(
    () => filterDesktopKnowledgeMapNodes(viewModel.reactionMap, {
      clusterId: selectedClusterId,
      edgeBasis: selectedEdgeBasis
    }),
    [selectedClusterId, selectedEdgeBasis, viewModel.reactionMap]
  );
  const edgeEvidenceRows = useMemo(
    () => filterEdgeEvidenceRows(
      buildEdgeEvidenceRows(viewModel.reactionMap.edges),
      selectedEdgeBasis
    ),
    [selectedEdgeBasis, viewModel.reactionMap.edges]
  );
  const selectedNode = graphNodes.find((node) =>
    node.reaction_entity_id === selectedReactionId
  ) ?? graphNodes[0];
  const selectedCluster = viewModel.reactionMap.clusters.find((cluster) =>
    cluster.cluster_id === selectedNode?.cluster_id
  );

  return (
    <div className="desktop-tool-panel">
      <div className="desktop-graph-summary">
        <div><span>State</span><strong>{viewModel.state}</strong></div>
        <div><span>Reactions</span><strong>{viewModel.reactionSummary.reactionCount}</strong></div>
        <div><span>Clusters</span><strong>{viewModel.reactionSummary.clusterCount}</strong></div>
      </div>
      <p className="desktop-empty-copy">{viewModel.reactionSummary.message}</p>
      <ReactionIntelligenceArtifactSummary viewModel={viewModel} />
      <label className="desktop-tool-search">
        <Filter size={14} />
        <select
          value={selectedClusterId}
          aria-label="Filter reaction map by cluster"
          onChange={(event) => {
            setSelectedClusterId(event.target.value);
            setSelectedReactionId(null);
          }}
        >
          <option value="all">All clusters</option>
          {viewModel.reactionMap.clusters.map((cluster) => (
            <option key={cluster.cluster_id} value={cluster.cluster_id}>
              {cluster.label}
            </option>
          ))}
        </select>
      </label>
      <label className="desktop-tool-search">
        <Filter size={14} />
        <select
          value={selectedEdgeBasis}
          aria-label="Filter reaction map by edge basis"
          onChange={(event) => {
            setSelectedEdgeBasis(event.target.value);
            setSelectedReactionId(null);
          }}
        >
          <option value="all">All basis</option>
          {viewModel.edgeBasisOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.edgeCount})
            </option>
          ))}
        </select>
      </label>
      <ReactionLayoutCanvas
        nodes={graphNodes}
        selectedReactionId={selectedNode?.reaction_entity_id}
        onSelectReaction={setSelectedReactionId}
      />
      {selectedNode ? (
        <div className="desktop-reaction-inspector">
          <span>{selectedNode.quality_tier ?? "semantic"}</span>
          <strong title={selectedNode.reaction_entity_id}>{selectedNode.reaction_entity_id}</strong>
          <code>{selectedCluster?.basis ?? "no-cluster"}</code>
          <p>{selectedCluster?.shared_features.join(", ") || "No shared features available."}</p>
        </div>
      ) : null}
      <EdgeEvidencePanel
        rows={edgeEvidenceRows}
        onSourceJump={onSourceJump}
      />
      <div className="desktop-graph-node-list" role="list">
        {graphNodes.slice(0, 20).map((node) => (
          <div key={node.reaction_entity_id} className="desktop-graph-node-row" role="listitem">
            <GitGraph size={13} />
            <span>{node.cluster_id ? "clustered" : "reaction"}</span>
            <strong title={node.reaction_entity_id}>{node.reaction_entity_id}</strong>
            <code>{Math.round(node.x)},{Math.round(node.y)}</code>
          </div>
        ))}
        {graphNodes.length === 0 ? (
          <p className="desktop-empty-copy">No reactions match the current filters.</p>
        ) : null}
      </div>
      <div className="desktop-graph-summary">
        <div><span>Semantic</span><strong>{viewModel.semanticSummary.nodeCount}</strong></div>
        <div><span>Hydrate</span><strong>{viewModel.semanticSummary.heavyNodeCount}</strong></div>
        <div><span>Warnings</span><strong>{viewModel.semanticSummary.warningCount}</strong></div>
      </div>
      <ReactionRenderableList
        viewModel={viewModel}
        expandedReactionIds={expandedReactionIds}
        onToggle={(nodeId) => {
          setExpandedReactionIds((current) =>
            current.includes(nodeId)
              ? current.filter((item) => item !== nodeId)
              : [...current, nodeId]
          );
        }}
        onSourceJump={onSourceJump}
      />
      <div className="desktop-tool-result-list" role="list" aria-label="Reaction clusters">
        {viewModel.clusters.slice(0, 6).map((cluster) => (
          <div key={cluster.id} className="desktop-tool-result-row" role="listitem">
            <span>{cluster.basis}</span>
            <strong title={cluster.label}>{cluster.label}</strong>
            <code>{cluster.memberCount}</code>
          </div>
        ))}
      </div>
    </div>
  );
};

type EdgeEvidenceRow = {
  edgeId: string;
  fromReactionId: string;
  toReactionId: string;
  confidence: string;
  score?: number;
  basis: readonly string[];
  evidenceIds: readonly string[];
  warnings: readonly string[];
  sourceRef: DesktopRenderableSourceRef | null;
};

const buildEdgeEvidenceRows = (
  edges: DesktopKnowledgeMapViewModel["reactionMap"]["edges"]
): EdgeEvidenceRow[] => edges.map((edge) => ({
  edgeId: edge.edge_id,
  fromReactionId: edge.from_reaction_entity_id,
  toReactionId: edge.to_reaction_entity_id,
  confidence: edge.confidence,
  score: edge.score,
  basis: edge.basis,
  evidenceIds: edge.evidence.map((item) => item.evidence_id),
  warnings: edge.warnings,
  // TODO: Wire edge-level source refs when the view-model exposes edgeEvidenceRows.
  sourceRef: null
}));

const filterEdgeEvidenceRows = (
  rows: readonly EdgeEvidenceRow[],
  selectedBasis: string
): EdgeEvidenceRow[] => {
  if (selectedBasis === "all") {
    return [...rows];
  }
  return rows.filter((row) => row.basis.includes(selectedBasis));
};

const formatEdgeScore = (score: number | undefined): string =>
  score === undefined ? "score pending" : score.toFixed(2);

type EdgeEvidencePanelProps = {
  rows: readonly EdgeEvidenceRow[];
  onSourceJump?: (intent: DesktopSourceJumpIntent) => void;
};

const EdgeEvidencePanel = ({
  rows,
  onSourceJump
}: EdgeEvidencePanelProps) => {
  const sourceReadyCount = rows.filter((row) => row.sourceRef !== null).length;
  return (
    <div className="desktop-renderable-node-list" role="list" aria-label="Graph edge evidence">
      <div className="desktop-tool-result-row" role="listitem">
        <span>Edge Evidence</span>
        <div className="desktop-tool-result-main">
          <strong>{rows.length} visible edges</strong>
          <small>{sourceReadyCount} source refs ready</small>
        </div>
        <code>graph</code>
      </div>
      {rows.slice(0, 12).map((row) => (
        <div key={row.edgeId} className="desktop-tool-result-row" role="listitem">
          <span>{row.confidence}</span>
          <div className="desktop-tool-result-main">
            <strong title={`${row.fromReactionId} -> ${row.toReactionId}`}>
              {row.fromReactionId} {"->"} {row.toReactionId}
            </strong>
            <small title={row.basis.join(", ")}>
              {row.basis.join(" / ") || "basis pending"}
            </small>
            <small title={row.evidenceIds.join(", ")}>
              {row.evidenceIds.length > 0
                ? row.evidenceIds.join(", ")
                : "evidence pending"}
            </small>
            {row.warnings.length > 0 ? (
              <small title={row.warnings.join(", ")}>
                {row.warnings.join(", ")}
              </small>
            ) : null}
          </div>
          <code>{formatEdgeScore(row.score)}</code>
          <SourceRefAction
            sourceRef={row.sourceRef}
            onSourceJump={onSourceJump}
            missingLabel="Source pending"
          />
        </div>
      ))}
      {rows.length === 0 ? (
        <p className="desktop-empty-copy">No graph edges match the current evidence filters.</p>
      ) : null}
    </div>
  );
};

type ReactionIntelligenceArtifactSummaryProps = {
  viewModel: DesktopKnowledgeMapViewModel;
};

const ReactionIntelligenceArtifactSummary = ({
  viewModel
}: ReactionIntelligenceArtifactSummaryProps) => {
  const summary = viewModel.reactionIntelligenceArtifact;
  if (!summary) {
    return null;
  }
  return (
    <>
      <div className="desktop-graph-summary" aria-label="Reaction intelligence artifact summary">
        <div><span>Artifact</span><strong title={summary.artifactId}>{summary.artifactId}</strong></div>
        <div><span>Job</span><strong title={summary.jobId}>{summary.jobId}</strong></div>
        <div><span>Generated</span><strong>{summary.generatedAt}</strong></div>
      </div>
      <div className="desktop-graph-summary">
        <div><span>PASS</span><strong>{summary.providerStatusCounts.PASS}</strong></div>
        <div><span>SKIP</span><strong>{summary.providerStatusCounts.SKIP}</strong></div>
        <div><span>ERROR</span><strong>{summary.providerStatusCounts.ERROR}</strong></div>
      </div>
      <div className="desktop-tool-result-list" role="list" aria-label="Reaction intelligence computed basis">
        <div className="desktop-tool-result-row" role="listitem">
          <span>{summary.layout.fromArtifact ? "artifact layout" : "fallback layout"}</span>
          <strong>{summary.layout.usesTmap ? "TMAP" : summary.layout.engine}</strong>
          <code>{summary.computedEdgeCount} edges</code>
        </div>
        {summary.computedBasis.slice(0, 6).map((basis) => (
          <div key={basis} className="desktop-tool-result-row" role="listitem">
            <span>Basis</span>
            <strong title={basis}>{basis}</strong>
            <code>{summary.graphIndexId}</code>
          </div>
        ))}
        {summary.warnings.slice(0, 4).map((warning) => (
          <div key={warning} className="desktop-tool-result-row" role="listitem">
            <span>Warning</span>
            <strong title={warning}>{warning}</strong>
            <code>artifact</code>
          </div>
        ))}
      </div>
    </>
  );
};

type ReactionRenderableListProps = {
  viewModel: DesktopKnowledgeMapViewModel;
  expandedReactionIds: readonly string[];
  onToggle: (nodeId: string) => void;
  onSourceJump?: (intent: DesktopSourceJumpIntent) => void;
};

const ReactionRenderableList = ({
  viewModel,
  expandedReactionIds,
  onToggle,
  onSourceJump
}: ReactionRenderableListProps) => (
  <div className="desktop-renderable-node-list" role="list" aria-label="Reaction renderable nodes">
    {viewModel.reactionRenderables.slice(0, 12).map((node) => {
      const expanded = expandedReactionIds.includes(node.nodeId);
      return (
        <div key={node.nodeId} className="desktop-renderable-node-row" role="listitem">
          <button
            type="button"
            className="desktop-renderable-node-toggle"
            aria-expanded={expanded}
            onClick={() => onToggle(node.nodeId)}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{node.component}</span>
            <strong title={node.title}>{node.title}</strong>
          </button>
          {node.clusterBadge ? (
            <span className="desktop-cluster-badge" title={node.clusterBadge.label}>
              {node.clusterBadge.basis} / {node.clusterBadge.confidence}
            </span>
          ) : null}
          <SourceRefAction sourceRef={node.sourceRef} onSourceJump={onSourceJump} />
          {expanded ? (
            <div className="desktop-renderable-node-detail">
              <code>{node.hydration}</code>
              {node.children.length > 0 ? node.children.map((child) => (
                <span key={child.nodeId} title={child.nodeType}>
                  {child.label}
                </span>
              )) : <span>No child renderables</span>}
            </div>
          ) : null}
        </div>
      );
    })}
    {viewModel.evidenceSourceRefs.slice(0, 6).map((evidence) => (
      <div key={evidence.nodeId} className="desktop-renderable-evidence-row" role="listitem">
        <span>Evidence</span>
        <strong title={evidence.label}>{evidence.label}</strong>
        <SourceRefAction sourceRef={evidence.sourceRef} onSourceJump={onSourceJump} />
      </div>
    ))}
  </div>
);

type SourceRefActionProps = {
  sourceRef: DesktopRenderableSourceRef | null;
  onSourceJump?: (intent: DesktopSourceJumpIntent) => void;
  missingLabel?: string;
};

const SourceRefAction = ({
  sourceRef,
  onSourceJump,
  missingLabel
}: SourceRefActionProps) => {
  if (!sourceRef) {
    return <span className="desktop-source-ref-chip">{missingLabel ?? "No source"}</span>;
  }
  if (!sourceRef.intent || !onSourceJump) {
    return <span className="desktop-source-ref-chip">{sourceRef.label}</span>;
  }
  const intent = sourceRef.intent;
  return (
    <button
      type="button"
      className="desktop-source-ref-button"
      onClick={() => onSourceJump(intent)}
    >
      <LocateFixed size={13} />
      <span>{sourceRef.label}</span>
    </button>
  );
};

type ReactionLayoutCanvasProps = {
  nodes: DesktopKnowledgeMapViewModel["reactionMap"]["nodes"];
  selectedReactionId?: string;
  onSelectReaction: (reactionId: string) => void;
};

const normalizePoints = (
  nodes: ReactionLayoutCanvasProps["nodes"]
) => {
  if (nodes.length === 0) {
    return [];
  }
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  return nodes.map((node) => ({
    node,
    x: 24 + ((node.x - minX) / width) * 252,
    y: 20 + ((node.y - minY) / height) * 152
  }));
};

const ReactionLayoutCanvas = ({
  nodes,
  selectedReactionId,
  onSelectReaction
}: ReactionLayoutCanvasProps) => {
  const points = normalizePoints(nodes);

  return (
    <svg className="desktop-reaction-map-canvas" viewBox="0 0 300 192" role="img" aria-label="Reaction cluster map">
      <rect x="1" y="1" width="298" height="190" rx="7" />
      {points.map(({ node, x, y }) => (
        <g
          key={node.reaction_entity_id}
          role="button"
          tabIndex={0}
          aria-label={`Inspect ${node.reaction_entity_id}`}
          onClick={() => onSelectReaction(node.reaction_entity_id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              onSelectReaction(node.reaction_entity_id);
            }
          }}
        >
          <circle
            cx={x}
            cy={y}
            r={node.reaction_entity_id === selectedReactionId ? 5 : 3}
            data-selected={node.reaction_entity_id === selectedReactionId}
          />
        </g>
      ))}
    </svg>
  );
};
