import type { ChemEditorDraftWithBlockId } from "../types";

interface LoadChemdDraftOptions {
  documentId: string;
  blockId: string;
  sessionId: string;
  fallback: ChemEditorDraftWithBlockId;
  fetchImpl?: typeof fetch;
}

export const loadChemdDraft = async ({
  documentId,
  blockId,
  sessionId,
  fallback,
  fetchImpl = fetch
}: LoadChemdDraftOptions): Promise<ChemEditorDraftWithBlockId> => {
  const params = new URLSearchParams({
    documentId,
    blockId,
    sessionId
  });
  const response = await fetchImpl(`/api/chem/draft?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Chemd draft load failed (${response.status})`);
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        found?: boolean;
        draft?: {
          blockId?: unknown;
          type?: unknown;
          smiles?: unknown;
          molfile?: unknown;
          reactants?: unknown;
          products?: unknown;
          conditions?: unknown;
          reactionSmiles?: unknown;
          rxnfile?: unknown;
        };
      }
    | null;

  if (!payload?.found || !payload.draft || payload.draft.blockId !== blockId) {
    return fallback;
  }

  if (payload.draft.type === "reaction") {
    return {
      blockId,
      kind: "reaction",
      reactants: Array.isArray(payload.draft.reactants)
        ? payload.draft.reactants.filter((item): item is string => typeof item === "string")
        : fallback.kind === "reaction"
          ? fallback.reactants
          : [],
      products: Array.isArray(payload.draft.products)
        ? payload.draft.products.filter((item): item is string => typeof item === "string")
        : fallback.kind === "reaction"
          ? fallback.products
          : [],
      conditions: Array.isArray(payload.draft.conditions)
        ? payload.draft.conditions.filter((item): item is string => typeof item === "string")
        : fallback.kind === "reaction"
          ? fallback.conditions
          : [],
      reactionSmiles:
        typeof payload.draft.reactionSmiles === "string" ? payload.draft.reactionSmiles : undefined,
      rxnfile:
        typeof payload.draft.rxnfile === "string" ? payload.draft.rxnfile : undefined
    };
  }

  return {
    blockId,
    kind: "molecule",
    smiles:
      typeof payload.draft.smiles === "string"
        ? payload.draft.smiles
        : fallback.kind === "molecule"
          ? fallback.smiles
          : "",
    molfile:
      typeof payload.draft.molfile === "string" ? payload.draft.molfile : undefined
  };
};
