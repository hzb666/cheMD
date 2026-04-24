import { describe, expect, it } from "vitest";

import { buildChemdSessionHeaders, getOrCreateChemdSessionToken } from "../src/lib/chemd-session-token";
import { getStructureSessionId } from "../src/features/structure-editor/lib/structure-session";

interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const createMemoryStorage = (): StorageLike => {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
};

describe("session token fallbacks", () => {
  it("falls back to a legacy chemd session token when secure crypto is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const storage = createMemoryStorage();

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: storage
      }
    });

    try {
      const token = getOrCreateChemdSessionToken();
      const headers = buildChemdSessionHeaders();

      expect(token).toMatch(/^chemd-[a-z0-9]+-[a-z0-9]+$/);
      expect(headers.get("x-chemd-session-token")).toBe(token);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }
  });

  it("prefers the shared cookie token over a stale tab-scoped session token", () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const storage = createMemoryStorage();
    storage.setItem("chemd-session-token", "stale-tab-token");

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: storage
      }
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        cookie: "chemd-session-token=cookie-token"
      }
    });

    try {
      const token = getOrCreateChemdSessionToken();
      const headers = buildChemdSessionHeaders();

      expect(token).toBe("cookie-token");
      expect(headers.get("x-chemd-session-token")).toBe("cookie-token");
      expect(storage.getItem("chemd-session-token")).toBe("cookie-token");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }
  });

  it("falls back to a generated structure session id when secure crypto is unavailable", () => {
    const originalCrypto = globalThis.crypto;
    const storage = createMemoryStorage();

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: undefined
    });

    try {
      const sessionId = getStructureSessionId(storage);

      expect(sessionId).toMatch(/^session-[a-z0-9]+-[a-z0-9]+$/);
      expect(getStructureSessionId(storage)).toBe(sessionId);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto
      });
    }
  });
});
