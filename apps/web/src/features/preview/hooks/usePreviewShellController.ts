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
// Sandboxed srcDoc iframes (without allow-same-origin) use the literal "null" origin.
const PREVIEW_FRAME_TARGET_ORIGIN = "null";

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

interface InventoryHoverContext {
  getPreviewFrame: () => HTMLIFrameElement | null;
  previewBridgeToken: string;
  inventoryCache: Map<string, InventoryLookupResponse>;
  inventoryPending: Map<string, Promise<InventoryLookupResponse>>;
}

const postInventoryState = (
  getPreviewFrame: () => HTMLIFrameElement | null,
  message: InventoryStateMessage
): void => {
  try {
    getPreviewFrame()?.contentWindow?.postMessage(message, PREVIEW_FRAME_TARGET_ORIGIN);
  } catch {
    // iframe srcDoc reload 时 contentWindow 可能短暂不可用，下一次 hover 会重新同步状态。
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

const buildReadyInventoryState = (
  previewToken: string,
  blockId: string,
  result: InventoryLookupResponse
): InventoryStateMessage =>
  result.type === "reaction"
    ? {
        type: "chemd:inventory-state",
        previewToken,
        blockId,
        draftType: "reaction",
        state: "ready",
        items: result.items
      }
    : {
        type: "chemd:inventory-state",
        previewToken,
        blockId,
        draftType: "molecule",
        state: "ready",
        item: result.item
      };

const getPendingInventoryLookup = (
  payload: PreviewInventoryHoverMessage,
  cacheKey: string,
  context: InventoryHoverContext
): Promise<InventoryLookupResponse> => {
  const pending = context.inventoryPending.get(cacheKey);
  if (pending) {
    return pending;
  }

  const nextPending = fetchInventoryLookup(payload)
    .then((result) => {
      context.inventoryCache.set(cacheKey, result);
      return result;
    })
    .finally(() => {
      context.inventoryPending.delete(cacheKey);
    });
  context.inventoryPending.set(cacheKey, nextPending);
  return nextPending;
};

export const handleInventoryHover = async (
  payload: PreviewInventoryHoverMessage,
  context: InventoryHoverContext
): Promise<void> => {
  const cacheKey = createInventoryCacheKey(payload);
  if (!cacheKey) {
    return;
  }

  const cached = context.inventoryCache.get(cacheKey);
  if (cached) {
    postInventoryState(context.getPreviewFrame, buildReadyInventoryState(context.previewBridgeToken, payload.blockId, cached));
    return;
  }

  postInventoryState(context.getPreviewFrame, {
    type: "chemd:inventory-state",
    previewToken: context.previewBridgeToken,
    blockId: payload.blockId,
    draftType: payload.type,
    state: "loading"
  });

  try {
    const result = await getPendingInventoryLookup(payload, cacheKey, context);
    postInventoryState(context.getPreviewFrame, buildReadyInventoryState(context.previewBridgeToken, payload.blockId, result));
  } catch (error) {
    postInventoryState(context.getPreviewFrame, {
      type: "chemd:inventory-state",
      previewToken: context.previewBridgeToken,
      blockId: payload.blockId,
      draftType: payload.type,
      state: "error",
      message: error instanceof Error ? error.message : "Inventory lookup failed"
    });
  }
};

const dispatchPreviewEdit = (
  editPayload: NonNullable<ReturnType<typeof readPreviewEditMessage>>,
  onEditChemd?: (draft: ChemEditorDraftWithBlockId) => void | Promise<void>
): void => {
  if (!onEditChemd) {
    return;
  }

  if (editPayload.type === "reaction") {
    void onEditChemd({
      blockId: editPayload.blockId,
      kind: "reaction",
      reactants: editPayload.reactants,
      products: editPayload.products,
      conditions: editPayload.conditions
    });
    return;
  }

  void onEditChemd({
    blockId: editPayload.blockId,
    kind: "molecule",
    smiles: editPayload.smiles
  });
};

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
    const handlePreviewMessage = (event: MessageEvent) => {
      const previewWindow = previewFrameRef.current?.contentWindow ?? null;
      const editPayload = readPreviewEditMessage(
        event,
        previewWindow,
        previewIsFresh,
        previewBridgeToken
      );
      if (editPayload) {
        dispatchPreviewEdit(editPayload, onEditChemd);
        return;
      }

      const inventoryPayload = readPreviewInventoryHoverMessage(
        event,
        previewWindow,
        previewIsFresh,
        previewBridgeToken
      );
      if (!inventoryPayload) {
        return;
      }

      void handleInventoryHover(inventoryPayload, {
        getPreviewFrame: () => previewFrameRef.current,
        previewBridgeToken,
        inventoryCache: inventoryCacheRef.current,
        inventoryPending: inventoryPendingRef.current
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
