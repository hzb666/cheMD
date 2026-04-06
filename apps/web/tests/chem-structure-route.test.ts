import { beforeEach, describe, expect, it, vi } from "vitest";

const getStructureRecordMock = vi.fn();

vi.mock("../src/server/chem/structure-store", () => ({
  getStructureRecord: (...args: unknown[]) => getStructureRecordMock(...args)
}));

describe("GET /api/chem/structure", () => {
  beforeEach(() => {
    getStructureRecordMock.mockReset();
    vi.resetModules();
  });

  it("returns found false when cache misses", async () => {
    getStructureRecordMock.mockResolvedValueOnce(undefined);
    const { GET } = await import("../src/app/api/chem/structure/route");
    const response = await GET(
      new Request("http://localhost/api/chem/structure?documentId=doc-x&blockId=mol-x&sessionId=session-x")
    );
    const payload = (await response.json()) as { found: boolean };

    expect(response.status).toBe(200);
    expect(payload.found).toBe(false);
  });

  it("returns cached record when present", async () => {
    getStructureRecordMock.mockResolvedValueOnce({
      kind: "molecule",
      documentId: "doc-1",
      blockId: "mol-1",
      sessionId: "session-1",
      smiles: "CCO",
      molfile: "mock-mol",
      source: "ocr",
      updatedAt: "2026-04-04T00:00:00.000Z",
      expiresAt: "2026-04-04T00:05:00.000Z"
    });

    const { GET } = await import("../src/app/api/chem/structure/route");
    const response = await GET(
      new Request("http://localhost/api/chem/structure?documentId=doc-1&blockId=mol-1&sessionId=session-1")
    );
    const payload = (await response.json()) as {
      found: boolean;
      structure?: { smiles: string; source: string; molfile?: string; expiresAt: string };
    };

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.structure?.smiles).toBe("CCO");
    expect(payload.structure?.source).toBe("ocr");
    expect(payload.structure?.molfile).toBe("mock-mol");
    expect(typeof payload.structure?.expiresAt).toBe("string");
  });

  it("does not leak cached drafts across sessions", async () => {
    getStructureRecordMock.mockResolvedValueOnce(undefined);

    const { GET } = await import("../src/app/api/chem/structure/route");
    const response = await GET(
      new Request("http://localhost/api/chem/structure?documentId=doc-2&blockId=mol-2&sessionId=session-b")
    );
    const payload = (await response.json()) as { found: boolean };

    expect(response.status).toBe(200);
    expect(payload.found).toBe(false);
  });
});
