import React from "react";

import type { KetcherDialogValue } from "../types";

interface KetcherFrameProps {
  value: KetcherDialogValue;
  onChange: (next: KetcherDialogValue) => void;
}

export const KetcherFrame = ({ value, onChange }: KetcherFrameProps) => (
  <div className="ketcher-frame" data-ketcher-shell="ketcher-ready">
    <div className="detail-card" style={{ marginBottom: "0.8rem" }}>
      <div className="detail-card-body" style={{ padding: "0.8rem" }}>
        <p className="panel-kicker">Structure sketch surface</p>
        <p className="panel-meta">
          Ketcher-ready structure shell. Replace this surface with the real iframe bridge in the next step.
        </p>
        <div className="panel-inline-meta" style={{ marginTop: "0.6rem", marginBottom: "0.6rem" }}>
          <span className="toolbar-chip">Bridge ready</span>
          <span className="toolbar-chip">SMILES</span>
          <span className="toolbar-chip">{value.molfile ? "Molfile ready" : "Molfile missing"}</span>
        </div>
        <div className="code-surface">
          <pre className="code-block scroll-area" style={{ minHeight: "5rem" }}>
            <code>{value.smiles || value.molfile || "Structure draft"}</code>
          </pre>
        </div>
      </div>
    </div>
    <label className="sr-only" htmlFor="ketcher-smiles-input">
      Edit smiles
    </label>
    <input
      id="ketcher-smiles-input"
      className="ketcher-input"
      value={value.smiles}
      onChange={(event) =>
        onChange({
          ...value,
          smiles: event.target.value
        })
      }
    />
    <label className="panel-meta" htmlFor="ketcher-molfile-input">
      Molfile
    </label>
    <textarea
      id="ketcher-molfile-input"
      className="editor-textarea playground-editor-textarea scroll-area"
      value={value.molfile ?? ""}
      onChange={(event) =>
        onChange({
          ...value,
          molfile: event.target.value
        })
      }
    />
  </div>
);
