import type { ChemEditorDraftWithBlockId } from "../types";

interface LoadChemdDraftOptions {
  documentId: string;
  blockId: string;
  sessionId: string;
  fallback: ChemEditorDraftWithBlockId;
  fetchImpl?: typeof fetch;
}

const hydrateMoleculeDraft = async (
  draft: ChemEditorDraftWithBlockId,
  fetchImpl: typeof fetch
): Promise<ChemEditorDraftWithBlockId> => {
  if (draft.kind !== "molecule" || draft.molfile || draft.smiles.trim().length === 0) {
    return draft;
  }

  try {
    const response = await fetchImpl("/api/chem/normalize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        smiles: draft.smiles
      })
    });
    if (!response.ok) {
      return draft;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          canonicalSmiles?: unknown;
          normalizedMolfile?: unknown;
        }
      | null;

    return {
      ...draft,
      smiles:
        typeof payload?.canonicalSmiles === "string" && payload.canonicalSmiles.trim().length > 0
          ? payload.canonicalSmiles
          : draft.smiles,
      molfile:
        typeof payload?.normalizedMolfile === "string" && payload.normalizedMolfile.trim().length > 0
          ? payload.normalizedMolfile
          : draft.molfile
    };
  } catch {
    return draft;
  }
};

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
    return hydrateMoleculeDraft(fallback, fetchImpl);
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

  return hydrateMoleculeDraft({
    blockId,
    sourceKind: fallback.sourceKind,
    kind: "molecule",
    smiles:
      typeof payload.draft.smiles === "string"
        ? payload.draft.smiles
        : fallback.kind === "molecule"
          ? fallback.smiles
          : "",
    molfile:
      typeof payload.draft.molfile === "string" ? payload.draft.molfile : undefined
  }, fetchImpl);
};
