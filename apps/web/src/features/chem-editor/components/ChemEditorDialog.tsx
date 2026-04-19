import React, { useMemo, useRef, useState } from "react";

import { Button } from "../../../components/ui/button";
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

interface ChemEditorDialogContentProps {
  value: ChemEditorDraftWithBlockId;
  onClose: () => void;
  onSave: (next: ChemEditorDraftWithBlockId) => Promise<void>;
}

const buildChemEditorDialogKey = (value: ChemEditorDraftWithBlockId): string => {
  const commonParts = [value.blockId, value.kind, value.sourceKind ?? ""];

  if (value.kind === "molecule") {
    return [...commonParts, value.smiles, value.molfile ?? ""].join("\x1f");
  }

  return [
    ...commonParts,
    value.reactants.join("\x1e"),
    value.products.join("\x1e"),
    value.conditions.join("\x1e"),
    value.reactionSmiles ?? "",
    value.rxnfile ?? ""
  ].join("\x1f");
};

export const resolveVisibleChemEditorDraft = ({
  open,
  value,
  draft
}: {
  open: boolean;
  value: ChemEditorDraftWithBlockId | null;
  draft: ChemEditorDraft | null;
}): ChemEditorDraft | null => {
  if (!open || !value) {
    return null;
  }

  if (!draft || draft.kind !== value.kind) {
    return value;
  }

  if (value.kind === "molecule") {
    return value.smiles.trim().length > 0 ? value : draft;
  }

  if (value.reactants.length > 0 || value.products.length > 0) {
    return value;
  }

  return draft;
};

const ChemEditorDialogContent = ({
  value,
  onClose,
  onSave
}: ChemEditorDialogContentProps) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChemEditorDraft | null>(value);
  const bridgeRef = useRef<KetcherBridgeInstance | null>(null);
  const resetKey = useMemo(
    () => (value ? `${value.blockId}:${value.kind}` : "closed"),
    [value]
  );
  const visibleDraft = resolveVisibleChemEditorDraft({
    open: true,
    value,
    draft
  });
  const currentDraft = draft ?? visibleDraft;

  if (!visibleDraft || !currentDraft) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog-card chem-editor-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chem-editor-dialog-title"
      >
        <div className="chem-editor-dialog-header">
          <h2 id="chem-editor-dialog-title" className="chem-editor-dialog-title notion-font-label">
            Chem Editor
          </h2>
          <div className="chem-editor-dialog-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="playground-topbar-button notion-font-ui h-8 px-3 text-[13px]"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              className="playground-topbar-button playground-topbar-button-primary notion-font-label h-8 px-3 text-[13px]"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  const nextDraft = bridgeRef.current
                    ? await exportChemEditorDraft(bridgeRef.current, currentDraft)
                    : currentDraft;
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
            </Button>
          </div>
        </div>
        {error ? (
          <p className="px-4 pt-3 text-[13px] text-[#dd5b00] notion-font-caption">
            {error}
          </p>
        ) : null}
        <div className="chem-editor-dialog-body">
          <ChemEditorFrame
            key={resetKey}
            value={visibleDraft}
            onChange={setDraft}
            onBridgeReady={(instance) => {
              bridgeRef.current = instance;
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const ChemEditorDialog = ({
  open,
  value,
  onClose,
  onSave
}: ChemEditorDialogProps) => {
  if (!open || !value) {
    return null;
  }

  return (
    <ChemEditorDialogContent
      key={buildChemEditorDialogKey(value)}
      value={value}
      onClose={onClose}
      onSave={onSave}
    />
  );
};
