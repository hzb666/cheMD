"use client";

import React, { useState } from "react";

import type { DocumentNode } from "../lib/mock-tree";

interface DocumentTreePanelProps {
  nodes?: DocumentNode[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

const defaultNodes: DocumentNode[] = [
  {
    id: "root",
    label: "Experiment",
    kind: "document",
    children: [
      {
        id: "section-intro",
        label: "Introduction",
        kind: "section",
        children: [
          { id: "mol-001", label: "Molecule #mol-001", kind: "block", blockType: "molecule" },
        ],
      },
      {
        id: "section-rxn",
        label: "Reaction",
        kind: "section",
        children: [
          { id: "rxn-main", label: "Reaction #rxn-main", kind: "block", blockType: "reaction" },
        ],
      },
    ],
  },
];

const TreeNode = ({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: DocumentNode;
  selectedId?: string;
  onSelect?: (id: string) => void;
  depth: number;
}) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <li>
      <button
        type="button"
        className="tree-node"
        data-selected={isSelected}
        data-depth={depth}
        style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
        onClick={() => {
          if (hasChildren) {
            setExpanded((prev) => !prev);
          }
          onSelect?.(node.id);
        }}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        {hasChildren && (
          <span className="tree-node-toggle" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        )}
        <span className="tree-node-icon" aria-hidden>
          {node.kind === "document" ? "📄" : node.blockType === "molecule" ? "⬡" : node.blockType === "reaction" ? "⇌" : "§"}
        </span>
        <span className="tree-node-label">{node.label}</span>
      </button>
      {hasChildren && expanded && (
        <ul className="tree-children">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const DocumentTreePanel = ({
  nodes = defaultNodes,
  selectedId,
  onSelect,
}: DocumentTreePanelProps) => (
  <section className="workspace-panel workspace-panel-tree panel-stack min-h-0">
    <div className="panel-header panel-toolbar shrink-0 items-center">
      <div className="panel-heading-cluster">
        <p className="panel-kicker">Documents</p>
        <p className="panel-meta">Experiment tree</p>
      </div>
    </div>
    <nav className="tree-nav scroll-area flex-1 min-h-0" aria-label="Document tree">
      <ul className="tree-root">
        {nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={0}
          />
        ))}
      </ul>
    </nav>
  </section>
);
