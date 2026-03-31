import { describe, expect, it } from "vitest";

import { saveStructureRecord } from "../src/server/chem/structure-store";

describe("GET /api/chem/structure", () => {
  it("returns found false when cache misses", async () => {
    const { GET } = await import("../src/app/api/chem/structure/route");
    const response = await GET(
      new Request("http://localhost/api/chem/structure?documentId=doc-x&blockId=mol-x")
    );
    const payload = (await response.json()) as { found: boolean };

    expect(response.status).toBe(200);
    expect(payload.found).toBe(false);
  });

  it("returns cached record when present", async () => {
    saveStructureRecord({
      documentId: "doc-1",
      blockId: "mol-1",
      smiles: "CCO",
      molfile: "mock-mol",
      source: "ocr"
    });

    const { GET } = await import("../src/app/api/chem/structure/route");
    const response = await GET(
      new Request("http://localhost/api/chem/structure?documentId=doc-1&blockId=mol-1")
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
});
