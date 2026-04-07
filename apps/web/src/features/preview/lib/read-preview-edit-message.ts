export interface MoleculePreviewEditMessage {
  type: "molecule";
  blockId: string;
  smiles: string;
}

export interface ReactionPreviewEditMessage {
  type: "reaction";
  blockId: string;
  reactants: string[];
  products: string[];
  conditions: string[];
}

export type PreviewEditMessage = MoleculePreviewEditMessage | ReactionPreviewEditMessage;

export const readPreviewEditMessage = (
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  previewWindow: Window | null,
  previewIsFresh: boolean,
  previewToken: string
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
    draftType?: unknown;
    smiles?: unknown;
    reactants?: unknown;
    products?: unknown;
    conditions?: unknown;
    previewToken?: unknown;
  } | null;
  if (typeof payload?.blockId !== "string" || !payload.blockId) {
    return null;
  }
  if (typeof payload?.previewToken !== "string" || payload.previewToken !== previewToken) {
    return null;
  }

  if (payload.type === "chemd:edit" && payload.draftType === "molecule") {
    return {
      type: "molecule",
      blockId: payload.blockId,
      smiles: typeof payload.smiles === "string" ? payload.smiles : ""
    };
  }

  if (!(payload.type === "chemd:edit" && payload.draftType === "reaction")) {
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

  return {
    type: "reaction",
    blockId: payload.blockId,
    reactants,
    products,
    conditions
  };
};
