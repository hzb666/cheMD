"use client";

import React from "react";

import { useKetcherBridge } from "../hooks/useKetcherBridge";

interface KetcherFrameProps {
  ketcherUrl: string;
  onLoad?: () => void;
  iframeRef?: React.Ref<HTMLIFrameElement>;
}

/**
 * Sandboxed iframe that hosts the standalone Ketcher application.
 */
export const KetcherFrame = ({ ketcherUrl, onLoad, iframeRef }: KetcherFrameProps) => (
  <iframe
    ref={iframeRef}
    src={ketcherUrl}
    title="Ketcher structure editor"
    className="ketcher-frame"
    onLoad={onLoad}
    // Allow scripts + forms so Ketcher can function, but isolate from parent
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  />
);

interface KetcherDialogProps {
  open: boolean;
  /** Initial structure: prefer molfile, fall back to smiles. */
  initialMolfile?: string;
  initialSmiles?: string;
  /** Called when the user clicks Save. Receives the canonical smiles string. */
  onSave?: (smiles: string) => void;
  onClose?: () => void;
  documentId: string;
  blockId: string;
  /** URL of the standalone Ketcher HTML page. Defaults to /ketcher/index.html. */
  ketcherUrl?: string;
}

/**
 * Modal dialog that wraps the Ketcher iframe editor.
 *
 * When `open` transitions to `true`, the dialog renders and, once Ketcher is
 * ready, loads the initial structure. On save, the molfile is sent to
 * `/api/chem/structure/save`, and the returned canonical smiles is forwarded
 * to `onSave`.
 */
export const KetcherDialog = ({
  open,
  initialMolfile,
  initialSmiles,
  onSave,
  onClose,
  documentId,
  blockId,
  ketcherUrl = "/ketcher/index.html",
}: KetcherDialogProps) => {
  const { iframeRef, state, handleIframeLoad, loadStructure, getStructure, setError, setSaving } =
    useKetcherBridge();

  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);

  // Load initial structure once Ketcher is ready
  React.useEffect(() => {
    if (state.phase === "ready" && open) {
      loadStructure({ molfile: initialMolfile, smiles: initialSmiles });
    }
  }, [state.phase, open, initialMolfile, initialSmiles, loadStructure]);

  const handleSave = async () => {
    setSaving();
    setSaveMessage(null);
    try {
      const payload = await getStructure();
      const response = await fetch("/api/chem/structure/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          blockId,
          molfile: payload.molfile,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorBody.message ?? `Save failed (${response.status})`);
      }

      const saved = (await response.json()) as { smiles: string; warnings: string[] };
      onSave?.(saved.smiles);
      onClose?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      setError(message);
      setSaveMessage(message);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="ketcher-overlay"
      role="dialog"
      aria-modal
      aria-label="Structure editor"
      onClick={(e) => {
        // Close when clicking the backdrop
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div className="ketcher-dialog">
        <div className="ketcher-dialog-header">
          <span className="ketcher-dialog-title">Edit structure</span>
          <div className="ketcher-dialog-actions">
            {saveMessage && (
              <span className="ketcher-error-message" role="alert">
                {saveMessage}
              </span>
            )}
            <button
              type="button"
              className="button-primary"
              disabled={state.phase === "saving" || state.phase !== "ready"}
              onClick={handleSave}
            >
              {state.phase === "saving" ? "Saving…" : "Save"}
            </button>
            <button type="button" className="button-primary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
        <div className="ketcher-dialog-body">
          <KetcherFrame
            ketcherUrl={ketcherUrl}
            iframeRef={iframeRef}
            onLoad={handleIframeLoad}
          />
        </div>
      </div>
    </div>
  );
};
