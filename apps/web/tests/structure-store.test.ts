import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceGetStructureRecordMock = vi.fn();
const callChemServiceSaveStructureRecordMock = vi.fn();

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceGetStructureRecord: (...args: unknown[]) => callChemServiceGetStructureRecordMock(...args),
  callChemServiceSaveStructureRecord: (...args: unknown[]) => callChemServiceSaveStructureRecordMock(...args)
}));

describe("structure-store", () => {
  beforeEach(() => {
    callChemServiceGetStructureRecordMock.mockReset();
    callChemServiceSaveStructureRecordMock.mockReset();
    vi.resetModules();
  });

  it("delegates structure writes to chem-service", async () => {
    callChemServiceSaveStructureRecordMock.mockResolvedValueOnce({
      kind: "molecule",
      documentId: "doc-store",
      blockId: "mol-1",
      sessionId: "session-store",
      smiles: "CCO",
      molfile: "mock-mol",
      source: "manual",
      updatedAt: "2026-04-04T00:00:00.000Z",
      expiresAt: "2026-04-04T00:05:00.000Z"
    });

    const { saveStructureRecord } = await import("../src/server/chem/structure-store");

    await expect(
      saveStructureRecord({
        documentId: "doc-store",
        blockId: "mol-1",
        sessionId: "session-store",
        smiles: "CCO",
        molfile: "mock-mol",
        source: "manual"
      })
    ).resolves.toEqual({
      kind: "molecule",
      documentId: "doc-store",
      blockId: "mol-1",
      sessionId: "session-store",
      smiles: "CCO",
      molfile: "mock-mol",
      source: "manual",
      updatedAt: "2026-04-04T00:00:00.000Z",
      expiresAt: "2026-04-04T00:05:00.000Z"
    });

    expect(callChemServiceSaveStructureRecordMock).toHaveBeenCalledWith({
      documentId: "doc-store",
      blockId: "mol-1",
      sessionId: "session-store",
      smiles: "CCO",
      molfile: "mock-mol",
      source: "manual"
    });
  });

  it("delegates structure reads to chem-service", async () => {
    callChemServiceGetStructureRecordMock.mockResolvedValueOnce({
      found: true,
      record: {
        kind: "molecule",
        documentId: "doc-store",
        blockId: "mol-1",
        sessionId: "session-store",
        smiles: "CCO",
        source: "manual",
        updatedAt: "2026-04-04T00:00:00.000Z",
        expiresAt: "2026-04-04T00:05:00.000Z"
      }
    });

    const { getStructureRecord } = await import("../src/server/chem/structure-store");

    await expect(
      getStructureRecord("doc-store", "mol-1", "session-store")
    ).resolves.toEqual({
      kind: "molecule",
      documentId: "doc-store",
      blockId: "mol-1",
      sessionId: "session-store",
      smiles: "CCO",
      source: "manual",
      updatedAt: "2026-04-04T00:00:00.000Z",
      expiresAt: "2026-04-04T00:05:00.000Z"
    });

    expect(callChemServiceGetStructureRecordMock).toHaveBeenCalledWith(
      "doc-store",
      "mol-1",
      "session-store"
    );
  });

  it("returns undefined when chem-service reports a cache miss", async () => {
    callChemServiceGetStructureRecordMock.mockResolvedValueOnce({ found: false });

    const { getStructureRecord } = await import("../src/server/chem/structure-store");

    await expect(
      getStructureRecord("doc-store", "missing", "session-store")
    ).resolves.toBeUndefined();
  });

  it("preserves reaction draft shape when persisting through chem-service", async () => {
    callChemServiceSaveStructureRecordMock.mockResolvedValueOnce({
      kind: "reaction",
      documentId: "doc-store",
      blockId: "rxn-1",
      sessionId: "session-rxn",
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"],
      reactionSmiles: "CCO>>CC(=O)O",
      rxnfile: "$RXN\nmock-rxnfile",
      source: "manual",
      updatedAt: "2026-04-04T00:00:00.000Z",
      expiresAt: "2026-04-04T00:05:00.000Z"
    });

    const { saveStructureRecord } = await import("../src/server/chem/structure-store");

    await expect(
      saveStructureRecord({
        kind: "reaction",
        documentId: "doc-store",
        blockId: "rxn-1",
        sessionId: "session-rxn",
        reactants: ["CCO"],
        products: ["CC(=O)O"],
        conditions: ["air"],
        reactionSmiles: "CCO>>CC(=O)O",
        rxnfile: "$RXN\nmock-rxnfile",
        source: "manual"
      })
    ).resolves.toEqual({
      kind: "reaction",
      documentId: "doc-store",
      blockId: "rxn-1",
      sessionId: "session-rxn",
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"],
      reactionSmiles: "CCO>>CC(=O)O",
      rxnfile: "$RXN\nmock-rxnfile",
      source: "manual",
      updatedAt: "2026-04-04T00:00:00.000Z",
      expiresAt: "2026-04-04T00:05:00.000Z"
    });
  });
});
