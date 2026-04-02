export interface PreviewEditMessage {
  blockId: string;
  smiles: string;
}

export const readPreviewEditMessage = (
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  previewWindow: Window | null,
  previewIsFresh: boolean
): PreviewEditMessage | null => {
  if (!previewIsFresh) {
    return null;
  }

  if (event.origin !== "null") {
    return null;
  }

  if (!previewWindow || event.source !== previewWindow) {
    return null;
  }

  const payload = event.data as { type?: unknown; blockId?: unknown; smiles?: unknown } | null;
  if (payload?.type !== "chemd:edit-molecule" || typeof payload.blockId !== "string" || !payload.blockId) {
    return null;
  }

  return {
    blockId: payload.blockId,
    smiles: typeof payload.smiles === "string" ? payload.smiles : ""
  };
};
