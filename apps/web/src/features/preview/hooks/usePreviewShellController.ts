"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderOptions } from "@chemd/render-profile";

import { useRenderedPreview } from "../../chem-preview/hooks/useRenderedPreview";
import { readPreviewEditMessage } from "../lib/read-preview-edit-message";
import type { ChemEditorDraftWithBlockId } from "../../chem-editor/types";

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
  onEditChemd?: (draft: ChemEditorDraftWithBlockId) => void | Promise<void>;
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
  onEditChemd
}: UsePreviewShellControllerParams) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const { hydratedHtml, previewBridgeToken } = useRenderedPreview(html, {
    documentId,
    sessionId,
    renderOptions
  });

  useEffect(() => {
    if (!onEditChemd) {
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
      if (payload.type === "reaction") {
        void onEditChemd({
          blockId: payload.blockId,
          kind: "reaction",
          reactants: payload.reactants,
          products: payload.products,
          conditions: payload.conditions
        });
        return;
      }

      void onEditChemd({
        blockId: payload.blockId,
        kind: "molecule",
        smiles: payload.smiles
      });
    };

    window.addEventListener("message", handlePreviewMessage);
    return () => {
      window.removeEventListener("message", handlePreviewMessage);
    };
  }, [onEditChemd, previewBridgeToken, previewIsFresh]);

  return {
    activeTab,
    setActiveTab,
    previewFrameRef,
    hydratedHtml,
    activeCode: activeTab === "json" ? json : docxBridge
  };
};
