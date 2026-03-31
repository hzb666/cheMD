"use client";

import React from "react";

import { buildMockTreeFromSource } from "../lib/mock-tree";

interface DocumentTreePanelProps {
  source: string;
}

export const DocumentTreePanel = ({ source }: DocumentTreePanelProps) => {
  const nodes = buildMockTreeFromSource(source);

  return (
    <aside className="workspace-panel workspace-panel-tree panel-stack min-h-0">
      <div className="panel-header panel-toolbar shrink-0 items-center">
        <div className="panel-heading-cluster">
          <p className="panel-kicker">Tree</p>
          <p className="panel-meta">Document outline (MVP)</p>
        </div>
      </div>
      <div className="detail-card min-h-0 flex-1">
        <div className="detail-card-body h-full">
          <ul className="tree-list scroll-area" aria-label="Document tree">
            {nodes.map((node) => (
              <li key={`${node.kind}:${node.id}`} className="tree-item">
                <span className="tree-kind">{node.kind}</span>
                <code className="tree-id">#{node.id}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
};

