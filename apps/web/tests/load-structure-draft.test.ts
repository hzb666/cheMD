import { describe, expect, it, vi } from "vitest";

import { loadStructureDraft } from "../src/features/structure-editor/lib/load-structure-draft";

describe("loadStructureDraft", () => {
  it("prefers persisted browser draft before hitting the structure cache route", async () => {
    const fetchMock = vi.fn();
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({
        smiles: "CCO",
        molfile: "persisted-molfile",
        sourceSmiles: "CCO",
        updatedAt: "2026-04-02T00:00:00.000Z"
      })),
      removeItem: vi.fn(),
      setItem: vi.fn()
    };

    const draft = await loadStructureDraft({
      documentId: "doc-local",
      blockId: "mol-local",
      sessionId: "session-local",
      fallbackSmiles: "CCO",
      fetchImpl: fetchMock as unknown as typeof fetch,
      storageImpl: storage
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(draft).toEqual({
      blockId: "mol-local",
      smiles: "CCO",
      molfile: "persisted-molfile"
    });
  });

  it("ignores stale persisted drafts when source smiles has changed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: false
      })
    });
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify({
        smiles: "CCO",
        molfile: "persisted-molfile",
        sourceSmiles: "CCO",
        updatedAt: "2026-04-02T00:00:00.000Z"
      })),
      removeItem: vi.fn(),
      setItem: vi.fn()
    };

    const draft = await loadStructureDraft({
      documentId: "doc-stale",
      blockId: "mol-stale",
      sessionId: "session-stale",
      fallbackSmiles: "CCN",
      fetchImpl: fetchMock,
      storageImpl: storage
    });

    expect(storage.removeItem).toHaveBeenCalledWith(
      "chemd:structure-draft:doc-stale:mol-stale:session-stale"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chem/structure?documentId=doc-stale&blockId=mol-stale&sessionId=session-stale"
    );
    expect(draft).toEqual({
      blockId: "mol-stale",
      smiles: "CCN"
    });
  });

  it("hydrates saved molfile from structure cache when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: true,
        structure: {
          smiles: "CCO",
          molfile: "mock-molfile"
        }
      })
    });

    const draft = await loadStructureDraft({
      documentId: "doc-1",
      blockId: "mol-1",
      sessionId: "session-1",
      fallbackSmiles: "CCO",
      fetchImpl: fetchMock,
      storageImpl: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn()
      }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chem/structure?documentId=doc-1&blockId=mol-1&sessionId=session-1"
    );
    expect(draft).toEqual({
      blockId: "mol-1",
      smiles: "CCO",
      molfile: "mock-molfile"
    });
  });

  it("falls back to preview smiles when structure cache misses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: false
      })
    });

    const draft = await loadStructureDraft({
      documentId: "doc-2",
      blockId: "mol-2",
      sessionId: "session-2",
      fallbackSmiles: "CCN",
      fetchImpl: fetchMock,
      storageImpl: {
        getItem: vi.fn().mockReturnValue(null),
        removeItem: vi.fn(),
        setItem: vi.fn()
      }
    });

    expect(draft).toEqual({
      blockId: "mol-2",
      smiles: "CCN"
    });
  });

  it("does not reuse persisted browser draft from a different session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        found: false
      })
    });
    const storage = {
      getItem: vi.fn((key: string) =>
        key === "chemd:structure-draft:doc-session:mol-session:session-b"
          ? JSON.stringify({
              smiles: "CCO",
              molfile: "persisted-molfile",
              sourceSmiles: "CCO",
              updatedAt: "2026-04-02T00:00:00.000Z"
            })
          : null
      ),
      removeItem: vi.fn(),
      setItem: vi.fn()
    };

    const draft = await loadStructureDraft({
      documentId: "doc-session",
      blockId: "mol-session",
      sessionId: "session-a",
      fallbackSmiles: "CCO",
      fetchImpl: fetchMock,
      storageImpl: storage
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chem/structure?documentId=doc-session&blockId=mol-session&sessionId=session-a"
    );
    expect(draft).toEqual({
      blockId: "mol-session",
      smiles: "CCO"
    });
  });
});
