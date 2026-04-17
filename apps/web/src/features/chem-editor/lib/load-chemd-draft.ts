import type { ChemEditorDraftWithBlockId } from "../types";

interface LoadChemdDraftOptions {
  documentId: string;
  blockId: string;
  sessionId: string;
  fallback: ChemEditorDraftWithBlockId;
  fetchImpl?: typeof fetch;
}

interface DraftCacheRecord {
  blockId?: unknown;
  type?: unknown;
  smiles?: unknown;
  molfile?: unknown;
  reactants?: unknown;
  products?: unknown;
  conditions?: unknown;
  reactionSmiles?: unknown;
  rxnfile?: unknown;
}

interface DraftCachePayload {
  found?: boolean;
  draft?: DraftCacheRecord;
}

const readStringArray = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : fallback;

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const readDraftCachePayload = async (response: Response): Promise<DraftCachePayload | null> =>
  (await response.json().catch(() => null)) as DraftCachePayload | null;

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

const buildCachedReactionDraft = (
  blockId: string,
  draft: DraftCacheRecord,
  fallback: ChemEditorDraftWithBlockId
): ChemEditorDraftWithBlockId => {
  const fallbackReaction = fallback.kind === "reaction" ? fallback : undefined;

  return {
    blockId,
    kind: "reaction",
    reactants: readStringArray(draft.reactants, fallbackReaction?.reactants ?? []),
    products: readStringArray(draft.products, fallbackReaction?.products ?? []),
    conditions: readStringArray(draft.conditions, fallbackReaction?.conditions ?? []),
    reactionSmiles: readOptionalString(draft.reactionSmiles),
    rxnfile: readOptionalString(draft.rxnfile)
  };
};

const buildCachedMoleculeDraft = (
  blockId: string,
  draft: DraftCacheRecord,
  fallback: ChemEditorDraftWithBlockId
): ChemEditorDraftWithBlockId => ({
  blockId,
  sourceKind: fallback.sourceKind,
  kind: "molecule",
  smiles: readOptionalString(draft.smiles) ?? (fallback.kind === "molecule" ? fallback.smiles : ""),
  molfile: readOptionalString(draft.molfile)
});

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

  const payload = await readDraftCachePayload(response);

  if (!payload?.found || !payload.draft || payload.draft.blockId !== blockId) {
    return hydrateMoleculeDraft(fallback, fetchImpl);
  }

  if (payload.draft.type === "reaction") {
    return buildCachedReactionDraft(blockId, payload.draft, fallback);
  }

  // 缓存的 molecule draft 可能只有 smiles，进入编辑器前补一次标准 molfile。
  return hydrateMoleculeDraft(buildCachedMoleculeDraft(blockId, payload.draft, fallback), fetchImpl);
};
