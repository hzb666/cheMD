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
};

const SourceRefAction = ({
  sourceRef,
  onSourceJump
}: SourceRefActionProps) => {
  if (!sourceRef) {
    return <span className="desktop-source-ref-chip">No source</span>;
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
