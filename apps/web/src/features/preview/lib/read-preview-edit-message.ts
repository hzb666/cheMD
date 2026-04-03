export interface MoleculePreviewEditMessage {
  kind: "molecule";
  blockId: string;
  smiles: string;
}

export interface ReactionPreviewEditMessage {
  kind: "reaction";
  blockId: string;
  reactants: string[];
  products: string[];
  conditions: string[];
}

export type PreviewEditMessage = MoleculePreviewEditMessage | ReactionPreviewEditMessage;

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

  const payload = event.data as {
    type?: unknown;
    blockId?: unknown;
    smiles?: unknown;
    reactants?: unknown;
    products?: unknown;
    conditions?: unknown;
  } | null;
  if (typeof payload?.blockId !== "string" || !payload.blockId) {
    return null;
  }

  if (payload.type === "chemd:edit-molecule") {
    return {
      kind: "molecule",
      blockId: payload.blockId,
      smiles: typeof payload.smiles === "string" ? payload.smiles : ""
    };
  }

  if (payload.type !== "chemd:edit-reaction") {
    return null;
  }

  const reactants = Array.isArray(payload.reactants)
    ? payload.reactants.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const products = Array.isArray(payload.products)
    ? payload.products.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const conditions = Array.isArray(payload.conditions)
    ? payload.conditions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (reactants.length === 0 || products.length === 0) {
    return null;
  }

  return {
    kind: "reaction",
    blockId: payload.blockId,
    reactants,
    products,
    conditions
  };
};
