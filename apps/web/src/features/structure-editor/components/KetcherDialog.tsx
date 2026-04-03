import React, { useEffect, useMemo, useState } from "react";

import { KetcherFrame } from "./KetcherFrame";
import { useKetcherBridge } from "../hooks/useKetcherBridge";
import type { KetcherDialogValue } from "../types";

interface KetcherDialogProps {
  open: boolean;
  value: KetcherDialogValue | null;
  onClose: () => void;
  onSave: (next: KetcherDialogValue) => Promise<void>;
}

export const KetcherDialog = ({ open, value, onClose, onSave }: KetcherDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { exportDraft, importDraft } = useKetcherBridge();
  const initialValue = useMemo<KetcherDialogValue>(
    () =>
      importDraft({
        smiles: value?.smiles ?? "",
        molfile: value?.molfile
      }),
    [importDraft, value]
  );
  const [frameValue, setFrameValue] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setFrameValue(initialValue);
      setError(null);
    }
  }, [initialValue, open]);

  if (!open || !value) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-label="Edit molecule">
        <div className="panel-header panel-toolbar">
          <div className="panel-heading-cluster">
            <p className="panel-kicker">Structure Editor</p>
            <p className="panel-meta">Adjust structure and save to document</p>
          </div>
          <div className="panel-inline-meta">
            <button type="button" className="tab-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={saving || (frameValue.smiles.trim().length === 0 && !frameValue.molfile?.trim())}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  await onSave(await exportDraft(frameValue));
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
            <KetcherFrame value={frameValue} onChange={setFrameValue} />
          </div>
        </div>
      </div>
    </div>
  );
};
