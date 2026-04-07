import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceNormalizeMock = vi.fn();
const resolveChemicalNotationMock = vi.fn();
const resolveChemicalNotationListMock = vi.fn();
const saveStructureRecordMock = vi.fn();

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceNormalize: (...args: unknown[]) => callChemServiceNormalizeMock(...args)
}));

vi.mock("../src/server/chem/cas-resolver", () => ({
  resolveChemicalNotation: (...args: unknown[]) => resolveChemicalNotationMock(...args),
  resolveChemicalNotationList: (...args: unknown[]) => resolveChemicalNotationListMock(...args),
  isCasResolutionError: () => false
}));

vi.mock("../src/server/chem/structure-store", () => ({
  saveStructureRecord: (...args: unknown[]) => saveStructureRecordMock(...args)
}));

const SESSION_TOKEN = "session-token";

describe("POST /api/chem/save", () => {
  beforeEach(() => {
    callChemServiceNormalizeMock.mockReset();
    resolveChemicalNotationMock.mockReset();
    resolveChemicalNotationListMock.mockReset();
    saveStructureRecordMock.mockReset();
    vi.resetModules();
  });

  it("saves a molecule chemd draft through the unified route", async () => {
    resolveChemicalNotationMock.mockResolvedValueOnce("CCO");
    callChemServiceNormalizeMock.mockResolvedValueOnce({
      canonicalSmiles: "CCO",
      normalizedMolfile: "normalized-molfile",
      warnings: []
    });
    saveStructureRecordMock.mockResolvedValueOnce(undefined);

    const { POST } = await import("../src/app/api/chem/save/route");
    const response = await POST(
      new Request("http://localhost/api/chem/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chemd-session-token": SESSION_TOKEN,
          cookie: `chemd-session-token=${SESSION_TOKEN}`
        },
        body: JSON.stringify({
          documentId: "doc-1",
          blockId: "chem-1",
          sessionId: "session-1",
          type: "molecule",
          smiles: "64-17-5"
        })
      })
    );
    const payload = (await response.json()) as { type?: string; smiles?: string; molfile?: string };

    expect(response.status).toBe(200);
    expect(resolveChemicalNotationMock).toHaveBeenCalledWith("64-17-5");
    expect(saveStructureRecordMock).toHaveBeenCalledWith({
      kind: "molecule",
      documentId: "doc-1",
      blockId: "chem-1",
      sessionId: "session-1",
      smiles: "CCO",
      molfile: "normalized-molfile",
      source: "ketcher"
    });
    expect(payload).toEqual({
      blockId: "chem-1",
      type: "molecule",
      smiles: "CCO",
      molfile: "normalized-molfile",
      warnings: []
    });
  });

  it("saves a reaction chemd draft through the unified route", async () => {
    resolveChemicalNotationListMock
      .mockResolvedValueOnce(["CCO"])
      .mockResolvedValueOnce(["CC=O"]);
    saveStructureRecordMock.mockResolvedValueOnce(undefined);

    const { POST } = await import("../src/app/api/chem/save/route");
    const response = await POST(
      new Request("http://localhost/api/chem/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-chemd-session-token": SESSION_TOKEN,
          cookie: `chemd-session-token=${SESSION_TOKEN}`
        },
        body: JSON.stringify({
          documentId: "doc-2",
          blockId: "chem-2",
          sessionId: "session-2",
          type: "reaction",
          reactants: ["CCO"],
          products: ["CC=O"],
          conditions: ["air"]
        })
      })
    );
    const payload = (await response.json()) as { type?: string; reactants?: string[]; products?: string[] };

    expect(response.status).toBe(200);
    expect(saveStructureRecordMock).toHaveBeenCalledWith({
      kind: "reaction",
      documentId: "doc-2",
      blockId: "chem-2",
      sessionId: "session-2",
      reactants: ["CCO"],
      products: ["CC=O"],
      conditions: ["air"],
      reactionSmiles: undefined,
      rxnfile: undefined,
      source: "ketcher"
    });
    expect(payload).toEqual({
      blockId: "chem-2",
      type: "reaction",
      reactants: ["CCO"],
      products: ["CC=O"],
      conditions: ["air"]
    });
  });
});
