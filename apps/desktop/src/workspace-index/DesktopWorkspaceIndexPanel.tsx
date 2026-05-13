import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { DesktopWorkspaceIndexViewModel } from "./desktop-workspace-index";

interface WorkspaceIndexPanelProps {
  viewModel: DesktopWorkspaceIndexViewModel;
}

export const DesktopWorkspaceIndexPanel = ({
  viewModel
}: WorkspaceIndexPanelProps) => {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const symbolRows = viewModel.symbols.map((symbol) => ({
      id: `symbol-${symbol.id}`,
      kind: symbol.kind,
      label: symbol.label,
      detail: `${symbol.documentPath}:L${symbol.line}`
    }));
    const referenceRows = viewModel.references.map((reference) => ({
      id: `reference-${reference.id}`,
      kind: reference.status,
      label: reference.target,
      detail: `${reference.field} L${reference.line}`
    }));
    const ragRows = viewModel.ragResults.map((result) => ({
      id: result.id,
      kind: "rag",
      label: result.label,
      detail: `${result.detail} ${result.revisionId}/${result.chunkId}`
    }));
    const allRows = [...ragRows, ...symbolRows, ...referenceRows];
    if (!normalizedQuery) return allRows.slice(0, 8);
    return allRows.filter((row) =>
      `${row.kind} ${row.label} ${row.detail}`.toLowerCase().includes(normalizedQuery)
    ).slice(0, 12);
  }, [query, viewModel.ragResults, viewModel.references, viewModel.symbols]);

  return (
    <div className="desktop-tool-panel">
      <div className="desktop-graph-summary">
        {viewModel.badges.slice(0, 4).map((badge) => (
          <div key={badge.label} data-state={badge.tone}><span>{badge.label}</span><strong>{badge.value}</strong></div>
        ))}
      </div>
      <label className="desktop-tool-search">
        <Search size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search citation-backed RAG, symbols, references"
          aria-label="RAG search query"
        />
      </label>
      <p className="desktop-empty-copy">{viewModel.message}</p>
      <p className="desktop-empty-copy">{viewModel.ragGate.message}</p>
      <div className="desktop-tool-result-list" role="list">
        {rows.length > 0 ? rows.map((row) => (
          <div key={row.id} className="desktop-tool-result-row" role="listitem">
            <span>{row.kind}</span>
            <strong title={row.label}>{row.label}</strong>
            <code>{row.detail}</code>
          </div>
        )) : <p className="desktop-empty-copy">No matches.</p>}
      </div>
    </div>
  );
};

