import React from "react";

import type { KetcherDialogValue } from "../types";

interface KetcherFrameProps {
  value: KetcherDialogValue;
  onSmilesChange: (next: string) => void;
}

export const KetcherFrame = ({ value, onSmilesChange }: KetcherFrameProps) => (
  <div className="ketcher-frame">
    <p className="panel-meta">Ketcher MVP placeholder (iframe integration in next step)</p>
    <label className="sr-only" htmlFor="ketcher-smiles-input">
      Edit smiles
    </label>
    <input
      id="ketcher-smiles-input"
      className="ketcher-input"
      value={value.smiles}
      onChange={(event) => onSmilesChange(event.target.value)}
    />
  </div>
);
