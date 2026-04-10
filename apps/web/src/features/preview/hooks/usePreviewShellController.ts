"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderOptions } from "@chemd/render-profile";

import { useRenderedPreview } from "../../chem-preview/hooks/useRenderedPreview";
import {
  readPreviewEditMessage,
  readPreviewInventoryHoverMessage,
  type PreviewInventoryHoverMessage
} from "../lib/read-preview-edit-message";
import type { ChemEditorDraftWithBlockId } from "../../chem-editor/types";

type OutputTab = "preview" | "json" | "docxBridge";

interface InventoryItemRecord {
  notation: string;
  displayName: string;
  casNumber: string | null;
  inventory: {
    exists_in_inventory: boolean;
    total_remaining: number;
    in_stock_count: number;
    borrowed_count: number;
    items: Array<{
      unit: string | null;
    }>;
  } | null;
  error?: string;
}

interface ReactionInventoryItemRecord extends InventoryItemRecord {
  reactant: string;
}

interface MoleculeInventoryResponse {
  type: "molecule";
  item: InventoryItemRecord;
}

interface ReactionInventoryResponse {
  type: "reaction";
  items: ReactionInventoryItemRecord[];
}

type InventoryLookupResponse = MoleculeInventoryResponse | ReactionInventoryResponse;

type InventoryStateMessage =
  | {
      type: "chemd:inventory-state";
      previewToken: string;
      blockId: string;
      draftType: "molecule" | "reaction";
      state: "loading";
    }
  | {
      type: "chemd:inventory-state";
      previewToken: string;
      blockId: string;
      draftType: "molecule";
      state: "ready";
      item: InventoryItemRecord;
    }
  | {
      type: "chemd:inventory-state";
      previewToken: string;
      blockId: string;
      draftType: "reaction";
      state: "ready";
      items: ReactionInventoryItemRecord[];
    }
  | {
      type: "chemd:inventory-state";
      previewToken: string;
      blockId: string;
      draftType: "molecule" | "reaction";
      state: "error";
      message: string;
    };

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
  source: _source,
  documentId,
  sessionId,
  renderOptions,
  previewIsFresh,
  onEditChemd
}: UsePreviewShellControllerParams) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const inventoryCacheRef = useRef<Map<string, InventoryLookupResponse>>(new Map());
  const inventoryPendingRef = useRef<Map<string, Promise<InventoryLookupResponse>>>(new Map());
  const { hydratedHtml, previewBridgeToken } = useRenderedPreview(html, {
    documentId,
    sessionId,
    renderOptions
  });

  useEffect(() => {
    const postInventoryState = (message: InventoryStateMessage) => {
      try {
        previewFrameRef.current?.contentWindow?.postMessage(message, "*");
      } catch {
        // Ignore transient iframe reload races.
      }
    };

    const createInventoryCacheKey = (payload: PreviewInventoryHoverMessage): string | null => {
      if (payload.type === "molecule") {
        const smiles = payload.smiles.trim();
        return smiles ? `molecule:${smiles}` : null;
      }

      const reactants = payload.reactants.map((item) => item.trim()).filter((item) => item.length > 0);
      return reactants.length > 0 ? `reaction:${reactants.join("\u001f")}` : null;
    };

    const readInventoryErrorMessage = async (response: Response): Promise<string> => {
      const payload = (await response.json().catch(() => null)) as { message?: unknown } | null;
      return typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : `Inventory lookup failed (${response.status})`;
    };

    const fetchInventoryLookup = async (
      payload: PreviewInventoryHoverMessage
    ): Promise<InventoryLookupResponse> => {
      const response = await fetch("/api/chem/inventory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          payload.type === "molecule"
            ? {
                type: "molecule",
                smiles: payload.smiles
              }
            : {
                type: "reaction",
                reactants: payload.reactants
              }
        )
      });

      if (!response.ok) {
        throw new Error(await readInventoryErrorMessage(response));
      }

      const result = (await response.json().catch(() => null)) as InventoryLookupResponse | null;
      if (!result || result.type !== payload.type) {
        throw new Error("Inventory response type mismatch");
      }

      return result;
    };

    const handleInventoryHover = async (payload: PreviewInventoryHoverMessage) => {
      const cacheKey = createInventoryCacheKey(payload);
      if (!cacheKey) {
        return;
      }

      const cached = inventoryCacheRef.current.get(cacheKey);
      if (cached) {
        if (cached.type === "reaction") {
          postInventoryState({
            type: "chemd:inventory-state",
            previewToken: previewBridgeToken,
            blockId: payload.blockId,
            draftType: "reaction",
            state: "ready",
            items: cached.items
          });
          return;
        }

        postInventoryState({
          type: "chemd:inventory-state",
          previewToken: previewBridgeToken,
          blockId: payload.blockId,
          draftType: "molecule",
          state: "ready",
          item: cached.item
        });
        return;
      }

      postInventoryState({
        type: "chemd:inventory-state",
        previewToken: previewBridgeToken,
        blockId: payload.blockId,
        draftType: payload.type,
        state: "loading"
      });

      let pending = inventoryPendingRef.current.get(cacheKey);
      if (!pending) {
        pending = fetchInventoryLookup(payload)
          .then((result) => {
            inventoryCacheRef.current.set(cacheKey, result);
            return result;
          })
          .finally(() => {
            inventoryPendingRef.current.delete(cacheKey);
          });
        inventoryPendingRef.current.set(cacheKey, pending);
      }

      try {
        const result = await pending;
        if (result.type === "reaction") {
          postInventoryState({
            type: "chemd:inventory-state",
            previewToken: previewBridgeToken,
            blockId: payload.blockId,
            draftType: "reaction",
            state: "ready",
            items: result.items
          });
          return;
        }

        postInventoryState({
          type: "chemd:inventory-state",
          previewToken: previewBridgeToken,
          blockId: payload.blockId,
          draftType: "molecule",
          state: "ready",
          item: result.item
        });
      } catch (error) {
        postInventoryState({
          type: "chemd:inventory-state",
          previewToken: previewBridgeToken,
          blockId: payload.blockId,
          draftType: payload.type,
          state: "error",
          message: error instanceof Error ? error.message : "Inventory lookup failed"
        });
      }
    };

    const handlePreviewMessage = (event: MessageEvent) => {
      const editPayload = readPreviewEditMessage(
        event,
        previewFrameRef.current?.contentWindow ?? null,
        previewIsFresh,
        previewBridgeToken
      );
      if (editPayload) {
        if (editPayload.type === "reaction") {
          if (onEditChemd) {
            void onEditChemd({
              blockId: editPayload.blockId,
              kind: "reaction",
              reactants: editPayload.reactants,
              products: editPayload.products,
              conditions: editPayload.conditions
            });
          }
          return;
        }

        if (onEditChemd) {
          void onEditChemd({
            blockId: editPayload.blockId,
            kind: "molecule",
            smiles: editPayload.smiles
          });
        }
        return;
      }

      const inventoryPayload = readPreviewInventoryHoverMessage(
        event,
        previewFrameRef.current?.contentWindow ?? null,
        previewIsFresh,
        previewBridgeToken
      );
      if (!inventoryPayload) {
        return;
      }

      void handleInventoryHover(inventoryPayload);
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
