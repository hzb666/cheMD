"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderOptions } from "@chemd/render-profile";

import { useRenderedPreview } from "../../chem-preview/hooks/useRenderedPreview";
import { useDocxExport } from "../../export-docx/hooks/useDocxExport";
import { readPreviewEditMessage } from "../lib/read-preview-edit-message";

type OutputTab = "preview" | "json" | "docxBridge";

interface UsePreviewShellControllerParams {
  html: string;
  json: string;
  docxBridge: string;
  source: string;
  documentId?: string;
  sessionId?: string;
  renderOptions?: RenderOptions;
  previewIsFresh: boolean;
  onEditMolecule?: (blockId: string, smiles: string) => void | Promise<void>;
  onEditReaction?: (
    blockId: string,
    reactants: string[],
    products: string[],
    conditions: string[]
  ) => void | Promise<void>;
}

export const usePreviewShellController = ({
  html,
  json,
  docxBridge,
  source,
  documentId,
  sessionId,
  renderOptions,
  previewIsFresh,
  onEditMolecule,
  onEditReaction
}: UsePreviewShellControllerParams) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const { exportingDocx, exportMessage, exportDocx } = useDocxExport({
    payload: { source }
  });
  const { hydratedHtml, previewBridgeToken } = useRenderedPreview(html, {
    documentId,
    sessionId,
    renderOptions
  });

  useEffect(() => {
    if (!onEditMolecule && !onEditReaction) {
      return undefined;
    }

    const handlePreviewMessage = (event: MessageEvent) => {
      const payload = readPreviewEditMessage(
        event,
        previewFrameRef.current?.contentWindow ?? null,
        previewIsFresh,
        previewBridgeToken
      );
      if (!payload) {
        return;
      }
      if (payload.kind === "molecule") {
        void onEditMolecule?.(payload.blockId, payload.smiles);
        return;
      }
      void onEditReaction?.(
        payload.blockId,
        payload.reactants,
        payload.products,
        payload.conditions
      );
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => {
      window.removeEventListener("message", handlePreviewMessage);
    };
  }, [onEditMolecule, onEditReaction, previewBridgeToken, previewIsFresh]);

  return {
    activeTab,
    setActiveTab,
    previewFrameRef,
    exportingDocx,
    exportMessage,
    exportDocx,
    hydratedHtml,
    activeCode: activeTab === "json" ? json : docxBridge
  };
};
