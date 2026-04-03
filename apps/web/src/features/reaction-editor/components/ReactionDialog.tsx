import React, { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { ReactionFrame } from "./ReactionFrame";
import {
  createReactionBridgeValue,
  normalizeReactionDraft,
  useReactionBridge
} from "../hooks/useReactionBridge";
import {
  createReactionSourceKey,
  saveStoredReactionDraft
} from "../lib/reaction-draft-store";
import type {
  ReactionEditorDraft,
  ReactionEditorDraftWithBlockId,
  ReactionFrameValue
} from "../types";

export interface ReactionEditorRuntimeState<TPayload = unknown> {
  draft: ReactionEditorDraft;
  payload: TPayload;
}

export interface ReactionDialogFrameRenderProps<TPayload = unknown> {
  state: ReactionEditorRuntimeState<TPayload>;
  onChange: (next: ReactionEditorRuntimeState<TPayload>) => void;
}

export interface ReactionEditorAdapter<TPayload = unknown> {
  id: string;
  createState: (draft: ReactionEditorDraft) => ReactionEditorRuntimeState<TPayload>;
  exportDraft: (state: ReactionEditorRuntimeState<TPayload>) => Promise<ReactionEditorDraft>;
  renderFrame: (props: ReactionDialogFrameRenderProps<TPayload>) => ReactNode;
}

interface ReactionDialogProps {
  documentId?: string;
  open: boolean;
  value: ReactionEditorDraftWithBlockId | null;
  onClose: () => void;
  onSave: (next: ReactionEditorDraftWithBlockId) => Promise<void>;
  adapter?: ReactionEditorAdapter<any>;
}

export const ReactionDialog = ({
  documentId,
  open,
  value,
  onClose,
  onSave,
  adapter
}: ReactionDialogProps) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textBridge = useReactionBridge();
  const defaultAdapter = useMemo<ReactionEditorAdapter<ReactionFrameValue>>(
    () => ({
      id: "text-default",
      createState: (draft) => ({
        draft,
        payload: createReactionBridgeValue(draft)
      }),
      exportDraft: async (state) => textBridge.exportDraft(state.payload),
      renderFrame: ({ state, onChange }) => (
        <ReactionFrame
          value={state.payload}
          onChange={(next) =>
            onChange({
              draft: normalizeReactionDraft(next),
              payload: next
            })
          }
        />
      )
    }),
    [textBridge]
  );
  const activeAdapter: ReactionEditorAdapter<any> = adapter ?? defaultAdapter;
  const initialDraft = useMemo<ReactionEditorDraft>(
    () => ({
      reactants: value?.reactants ?? [],
      products: value?.products ?? [],
      conditions: value?.conditions ?? []
    }),
    [value]
  );
  const [editorState, setEditorState] = useState<ReactionEditorRuntimeState<any>>(
    () => activeAdapter.createState(initialDraft)
  );
  const sourceReactionKey = useMemo(
    () =>
      value?.sourceReactionKey
      ?? (value
        ? createReactionSourceKey({
            reactants: value.reactants,
            products: value.products,
            conditions: value.conditions
          })
        : undefined),
    [value]
  );
  const resetKey = useMemo(
    () => `${activeAdapter.id}::${value?.blockId ?? ""}::${sourceReactionKey ?? ""}`,
    [activeAdapter.id, sourceReactionKey, value?.blockId]
  );
  const adapterRef = useRef(activeAdapter);
  const lastResetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    adapterRef.current = activeAdapter;
  }, [activeAdapter]);

  useEffect(() => {
    if (!open) {
      lastResetKeyRef.current = null;
      return;
    }

    if (lastResetKeyRef.current === resetKey) {
      return;
    }

    setEditorState(adapterRef.current.createState(initialDraft));
    setError(null);
    lastResetKeyRef.current = resetKey;
  }, [initialDraft, open, resetKey]);

  const parsedDraft = editorState.draft;
  const frameRenderProps: ReactionDialogFrameRenderProps<any> = useMemo(
    () => ({
      state: editorState,
      onChange: setEditorState
    }),
    [editorState]
  );

  useEffect(() => {
    if (!open || !value || !documentId) {
      return;
    }

    saveStoredReactionDraft({
      documentId,
      blockId: value.blockId,
      reactants: parsedDraft.reactants,
      products: parsedDraft.products,
      conditions: parsedDraft.conditions,
      sourceReactionKey
    });
  }, [documentId, open, parsedDraft.conditions, parsedDraft.products, parsedDraft.reactants, sourceReactionKey, value]);

  if (!open || !value) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card" role="dialog" aria-modal="true" aria-label="Edit reaction">
        <div className="panel-header panel-toolbar">
          <div className="panel-heading-cluster">
            <p className="panel-kicker">Reaction Editor</p>
            <p className="panel-meta">Adjust reactants, products, and conditions before saving</p>
          </div>
          <div className="panel-inline-meta">
            <button type="button" className="tab-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={saving || parsedDraft.reactants.length === 0 || parsedDraft.products.length === 0}
              onClick={async () => {
                setSaving(true);
                setError(null);
                try {
                  const draft = await activeAdapter.exportDraft(editorState);
                  await onSave({
                    blockId: value.blockId,
                    sourceReactionKey,
                    ...draft
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
            {activeAdapter.renderFrame(frameRenderProps)}
          </div>
        </div>
      </div>
    </div>
  );
};
