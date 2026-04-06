import { createScopedToken } from "../../../lib/random-token";

const STORAGE_KEY = "chemd:structure-session-id";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const createSessionId = (): string => createScopedToken("session");

const resolveStorage = (storageImpl?: StorageLike): StorageLike | null => {
  if (storageImpl) {
    return storageImpl;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const getStructureSessionId = (storageImpl?: StorageLike): string => {
  const storage = resolveStorage(storageImpl);
  if (!storage) {
    return "session-server";
  }

  try {
    const existing = storage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const next = createSessionId();
    storage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return "session-fallback";
  }
};
