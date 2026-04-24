import { describe, expect, it } from "vitest";

import { loadChemdDraft } from "../src/features/chem-editor/lib/load-chemd-draft";

describe("loadChemdDraft", () => {
  it("hydrates a molecule fallback with normalized molfile when draft cache misses", async () => {
    const fetchMock = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/chem/draft?")) {
        return {
          ok: true,
          json: async () => ({
            found: false
          })
        } as Response;
      }

      if (url === "/api/chem/normalize") {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ smiles: "CCO" }));
        return {
          ok: true,
          json: async () => ({
            canonicalSmiles: "CCO",
            normalizedMolfile: "normalized-molfile"
          })
        } as Response;
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    await expect(
      loadChemdDraft({
        documentId: "doc-1",
        blockId: "mol-1",
        sessionId: "session-1",
        fallback: {
          blockId: "mol-1",
          kind: "molecule",
          smiles: "CCO"
        },
        fetchImpl: fetchMock as typeof fetch
      })
    ).resolves.toEqual({
      blockId: "mol-1",
      kind: "molecule",
      smiles: "CCO",
      molfile: "normalized-molfile"
    });
  });

  it("hydrates cached molecule drafts that are missing molfile", async () => {
    let normalizeCalls = 0;
    const fetchMock = async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("/api/chem/draft?")) {
        return {
          ok: true,
          json: async () => ({
            found: true,
            draft: {
              blockId: "mol-1",
              type: "molecule",
              smiles: "CCO"
            }
          })
        } as Response;
      }

      if (url === "/api/chem/normalize") {
        normalizeCalls += 1;
        return {
          ok: true,
          json: async () => ({
            canonicalSmiles: "CCO",
            normalizedMolfile: "normalized-molfile"
          })
        } as Response;
      }

      throw new Error(`Unexpected request: ${url}`);
    };

    const result = await loadChemdDraft({
      documentId: "doc-1",
      blockId: "mol-1",
      sessionId: "session-1",
      fallback: {
        blockId: "mol-1",
        kind: "molecule",
        smiles: "seed"
      },
      fetchImpl: fetchMock as typeof fetch
    });

    expect(normalizeCalls).toBe(1);
    expect(result).toEqual({
      blockId: "mol-1",
      kind: "molecule",
      smiles: "CCO",
      molfile: "normalized-molfile"
    });
  });
});
