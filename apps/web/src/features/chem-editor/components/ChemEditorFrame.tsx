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
  </div>
);
