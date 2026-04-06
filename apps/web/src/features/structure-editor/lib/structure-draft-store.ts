import type { StructureEditorDraft } from "../types";

const STORAGE_KEY_PREFIX = "chemd:structure-draft";

interface StoredStructureDraft extends StructureEditorDraft {
  sourceSmiles?: string;
  updatedAt: string;
}

interface StructureDraftKey {
  documentId: string;
  blockId: string;
  sessionId?: string;
}

interface SaveStructureDraftInput extends StructureDraftKey, StructureEditorDraft {
  sourceSmiles?: string;
}

interface StorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

const createStorageKey = ({ documentId, blockId, sessionId }: StructureDraftKey): string =>
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

export const loadStoredStructureDraft = (
  key: StructureDraftKey,
  storageImpl?: StorageLike
): (StructureEditorDraft & { sourceSmiles?: string }) | null => {
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
    const parsed = JSON.parse(raw) as StoredStructureDraft | null;
    if (!parsed || typeof parsed.smiles !== "string") {
      try {
        storage.removeItem(createStorageKey(key));
      } catch {
        return null;
      }
      return null;
    }

    return {
      smiles: parsed.smiles,
      molfile: typeof parsed.molfile === "string" ? parsed.molfile : undefined,
      sourceSmiles: typeof parsed.sourceSmiles === "string" ? parsed.sourceSmiles : undefined
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

export const removeStoredStructureDraft = (
  key: StructureDraftKey,
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

export const saveStoredStructureDraft = (
  input: SaveStructureDraftInput,
  storageImpl?: StorageLike
): void => {
  const storage = resolveStorage(storageImpl);
  if (!storage) {
    return;
  }

  const payload: StoredStructureDraft = {
    smiles: input.smiles,
    molfile: input.molfile,
    sourceSmiles: input.sourceSmiles,
    updatedAt: new Date().toISOString()
  };
  try {
    storage.setItem(createStorageKey(input), JSON.stringify(payload));
  } catch {
    return;
  }
};
