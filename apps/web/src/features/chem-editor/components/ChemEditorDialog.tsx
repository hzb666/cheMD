import React, { useEffect, useMemo, useRef, useState } from "react";

import { ChemEditorFrame } from "./ChemEditorFrame";
import { exportChemEditorDraft } from "../lib/chem-editor-export";
import type {
  ChemEditorDraft,
  ChemEditorDraftWithBlockId,
  KetcherBridgeInstance
} from "../types";

interface ChemEditorDialogProps {
  open: boolean;
  value: ChemEditorDraftWithBlockId | null;
  onClose: () => void;
  onSave: (next: ChemEditorDraftWithBlockId) => Promise<void>;
}

export const ChemEditorDialog = ({
  open,
  value,
  onClose,
  onSave
}: ChemEditorDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChemEditorDraft | null>(value);
  const bridgeRef = useRef<KetcherBridgeInstance | null>(null);
  const resetKey = useMemo(
    () => (value ? `${value.blockId}:${value.kind}` : "closed"),
    [value]
  );

  useEffect(() => {
    if (open && value) {
      setDraft(value);
      setError(null);
    }
  }, [open, resetKey, value]);

  if (!open || !value || !draft) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-label="Edit chemistry">
        <div className="panel-header panel-toolbar">
          <div className="panel-heading-cluster">
            <p className="panel-kicker">Chem Editor</p>
            <p className="panel-meta">Edit one chemical canvas and save as molecule or reaction.</p>
          </div>
          <div className="panel-inline-meta">
            <button type="button" className="tab-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  const nextDraft = bridgeRef.current
                    ? await exportChemEditorDraft(bridgeRef.current, draft)
                    : draft;
                  await onSave({
                    blockId: value.blockId,
                    sourceKind: value.sourceKind ?? value.kind,
                    ...nextDraft
                  });
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "Save failed");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        {error ? <p className="status-text">{error}</p> : null}
        <div className="detail-card" style={{ margin: "0.8rem" }}>
          <div className="detail-card-body" style={{ padding: "0.8rem" }}>
            <ChemEditorFrame
              value={draft}
              onChange={setDraft}
              onBridgeReady={(instance) => {
                bridgeRef.current = instance;
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
