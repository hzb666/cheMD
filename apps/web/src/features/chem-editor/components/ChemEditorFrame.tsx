import React from "react";

import { EmbeddedChemEditorHost } from "./EmbeddedChemEditorHost";
import type { ChemEditorDraft, KetcherBridgeInstance } from "../types";

interface ChemEditorFrameProps {
  value: ChemEditorDraft;
  onChange: (next: ChemEditorDraft) => void;
  onBridgeReady?: (instance: KetcherBridgeInstance | null) => void;
}

export const ChemEditorFrame = ({ value, onChange, onBridgeReady }: ChemEditorFrameProps) => (
  <div className="ketcher-frame" data-chem-editor-kind={value.kind}>
    <EmbeddedChemEditorHost value={value} onChange={onChange} onBridgeReady={onBridgeReady} />
    {value.kind === "reaction" ? (
      <div className="detail-card" style={{ marginTop: "0.8rem" }}>
        <div className="detail-card-body" style={{ padding: "0.8rem" }}>
          <p className="panel-kicker">Reaction metadata</p>
          <p className="panel-meta">Conditions remain outside the Ketcher canvas.</p>
          <label className="panel-meta" htmlFor="chem-editor-conditions-input">
            Conditions
          </label>
          <textarea
            id="chem-editor-conditions-input"
            className="editor-textarea playground-editor-textarea scroll-area"
            value={value.conditions.join("\n")}
            onChange={(event) =>
              onChange({
                ...value,
                conditions: event.target.value
                  .split(/\r?\n/)
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0)
              })
            }
          />
        </div>
      </div>
    ) : null}
  </div>
);
