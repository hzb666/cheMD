import { useMemo, useState } from "react";
import { Filter, GitGraph } from "lucide-react";

import type { DesktopKnowledgeMapViewModel } from "./desktop-knowledge-map";

interface KnowledgeMapPanelProps {
  viewModel: DesktopKnowledgeMapViewModel;
}

export const DesktopKnowledgeMapPanel = ({
  viewModel
}: KnowledgeMapPanelProps) => {
  const [selectedClusterId, setSelectedClusterId] = useState<string>("all");
  const [selectedReactionId, setSelectedReactionId] = useState<string | null>(null);
  const graphNodes = useMemo(
    () => viewModel.reactionMap.nodes.filter((node) =>
      selectedClusterId === "all" || node.cluster_id === selectedClusterId
    ),
    [selectedClusterId, viewModel.reactionMap.nodes]
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
        {graphNodes.length === 0 ? <p className="desktop-empty-copy">{viewModel.message}</p> : null}
      </div>
      <div className="desktop-graph-summary">
        <div><span>Semantic</span><strong>{viewModel.semanticSummary.nodeCount}</strong></div>
        <div><span>Hydrate</span><strong>{viewModel.semanticSummary.heavyNodeCount}</strong></div>
        <div><span>Warnings</span><strong>{viewModel.semanticSummary.warningCount}</strong></div>
      </div>
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
