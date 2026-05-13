import { GitGraph } from "lucide-react";

import type { DesktopKnowledgeMapViewModel } from "./desktop-knowledge-map";

interface KnowledgeMapPanelProps {
  viewModel: DesktopKnowledgeMapViewModel;
}

export const DesktopKnowledgeMapPanel = ({
  viewModel
}: KnowledgeMapPanelProps) => {
  const graphNodes = viewModel.reactionMap.nodes.slice(0, 10);
  return (
    <div className="desktop-tool-panel">
      <div className="desktop-graph-summary">
        <div><span>State</span><strong>{viewModel.state}</strong></div>
        <div><span>Reactions</span><strong>{viewModel.reactionSummary.reactionCount}</strong></div>
        <div><span>Clusters</span><strong>{viewModel.reactionSummary.clusterCount}</strong></div>
      </div>
      <p className="desktop-empty-copy">{viewModel.reactionSummary.message}</p>
      <div className="desktop-graph-node-list" role="list">
        {graphNodes.length > 0 ? graphNodes.map((node) => (
          <div key={node.reaction_entity_id} className="desktop-graph-node-row" role="listitem">
            <GitGraph size={13} />
            <span>{node.cluster_id ? "clustered" : "reaction"}</span>
            <strong title={node.reaction_entity_id}>{node.reaction_entity_id}</strong>
            <code>{Math.round(node.x)},{Math.round(node.y)}</code>
          </div>
        )) : <p className="desktop-empty-copy">{viewModel.message}</p>}
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

