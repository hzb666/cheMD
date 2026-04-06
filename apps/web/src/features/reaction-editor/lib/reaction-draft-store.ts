import type { ReactionEditorDraft } from "../types";

const STORAGE_KEY_PREFIX = "chemd:reaction-draft";

interface StoredReactionDraft extends ReactionEditorDraft {
  sourceReactionKey?: string;
  draftReactionKey?: string;
  updatedAt: string;
}

interface ReactionDraftKey {
  documentId: string;
  blockId: string;
  sessionId?: string;
}

interface SaveReactionDraftInput extends ReactionDraftKey, ReactionEditorDraft {
  sourceReactionKey?: string;
  draftReactionKey?: string;
}

interface StorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

const createStorageKey = ({ documentId, blockId, sessionId }: ReactionDraftKey): string =>
  `${STORAGE_KEY_PREFIX}:${documentId}:${blockId}:${sessionId ?? "global"}`;

const resolveStorage = (storageImpl?: StorageLike): StorageLike | null => {
  if (storageImpl) {
    return storageImpl;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export const createReactionSourceKey = (draft: ReactionEditorDraft): string =>
  JSON.stringify({
    reactants: draft.reactants,
    products: draft.products,
    conditions: draft.conditions,
    reactionSmiles: draft.reactionSmiles ?? null,
    rxnfile: draft.rxnfile ?? null
  });

export const saveStoredReactionDraft = (
  input: SaveReactionDraftInput,
  storageImpl?: StorageLike
): void => {
  const storage = resolveStorage(storageImpl);
  if (!storage) {
    return;
  }

  const payload: StoredReactionDraft = {
    reactants: input.reactants,
    products: input.products,
    conditions: input.conditions,
    reactionSmiles: input.reactionSmiles,
    rxnfile: input.rxnfile,
    sourceReactionKey: input.sourceReactionKey,
    draftReactionKey: input.draftReactionKey,
    updatedAt: new Date().toISOString()
  };

  try {
    storage.setItem(createStorageKey(input), JSON.stringify(payload));
  } catch {
    return;
  }
};

export const loadStoredReactionDraft = (
  key: ReactionDraftKey,
  storageImpl?: StorageLike
): (ReactionEditorDraft & { sourceReactionKey?: string; draftReactionKey?: string }) | null => {
  const storage = resolveStorage(storageImpl);
  if (!storage) {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(createStorageKey(key));
  } catch {
    return null;
  }

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredReactionDraft | null;
    if (
      !parsed
      || !isStringArray(parsed.reactants)
      || !isStringArray(parsed.products)
      || !isStringArray(parsed.conditions)
    ) {
      storage.removeItem(createStorageKey(key));
      return null;
    }

    return {
      reactants: parsed.reactants,
      products: parsed.products,
      conditions: parsed.conditions,
      reactionSmiles:
        typeof parsed.reactionSmiles === "string" ? parsed.reactionSmiles : undefined,
      rxnfile:
        typeof parsed.rxnfile === "string" ? parsed.rxnfile : undefined,
      sourceReactionKey:
        typeof parsed.sourceReactionKey === "string" ? parsed.sourceReactionKey : undefined,
      draftReactionKey:
        typeof parsed.draftReactionKey === "string" ? parsed.draftReactionKey : undefined
    };
  } catch {
    try {
      storage.removeItem(createStorageKey(key));
    } catch {
      return null;
    }
    return null;
  }
};

export const removeStoredReactionDraft = (
  key: ReactionDraftKey,
  storageImpl?: StorageLike
): void => {
  const storage = resolveStorage(storageImpl);
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(createStorageKey(key));
  } catch {
    return;
  }
};
