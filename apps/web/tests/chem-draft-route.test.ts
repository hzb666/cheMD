import { beforeEach, describe, expect, it, vi } from "vitest";

const getStructureRecordMock = vi.fn();

vi.mock("../src/server/chem/structure-store", () => ({
  getStructureRecord: (...args: unknown[]) => getStructureRecordMock(...args)
}));

describe("GET /api/chem/draft", () => {
  beforeEach(() => {
    getStructureRecordMock.mockReset();
    vi.resetModules();
  });

  it("returns a molecule chemd draft when the stored record is a molecule", async () => {
    getStructureRecordMock.mockResolvedValueOnce({
      kind: "molecule",
      documentId: "doc-1",
      blockId: "chem-1",
      sessionId: "session-1",
      source: "ketcher",
      smiles: "CCO",
      molfile: "mock-molfile",
      updatedAt: "2026-04-08T00:00:00.000Z",
      expiresAt: "2026-04-09T00:00:00.000Z"
    });

    const { GET } = await import("../src/app/api/chem/draft/route");
    const response = await GET(
      new Request("http://localhost/api/chem/draft?documentId=doc-1&blockId=chem-1&sessionId=session-1")
    );
    const payload = (await response.json()) as { found?: boolean; draft?: { type?: string; smiles?: string } };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      found: true,
      draft: {
        blockId: "chem-1",
        type: "molecule",
        smiles: "CCO",
        molfile: "mock-molfile"
      }
    });
  });

  it("returns a reaction chemd draft when the stored record is a reaction", async () => {
    getStructureRecordMock.mockResolvedValueOnce({
      kind: "reaction",
      documentId: "doc-2",
      blockId: "chem-2",
      sessionId: "session-2",
      source: "ketcher",
      reactants: ["CCO"],
      products: ["CC=O"],
      conditions: ["air"],
      reactionSmiles: "CCO>>CC=O",
      updatedAt: "2026-04-08T00:00:00.000Z",
      expiresAt: "2026-04-09T00:00:00.000Z"
    });

    const { GET } = await import("../src/app/api/chem/draft/route");
    const response = await GET(
      new Request("http://localhost/api/chem/draft?documentId=doc-2&blockId=chem-2&sessionId=session-2")
    );
    const payload = (await response.json()) as { found?: boolean; draft?: { type?: string; reactants?: string[] } };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      found: true,
      draft: {
        blockId: "chem-2",
        type: "reaction",
        reactants: ["CCO"],
        products: ["CC=O"],
        conditions: ["air"],
        reactionSmiles: "CCO>>CC=O"
      }
    });
  });
});
