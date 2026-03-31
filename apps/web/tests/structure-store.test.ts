import { describe, expect, it } from "vitest";

import {
  deleteStructureRecord,
  getStructureRecord,
  upsertStructureRecord,
} from "../src/server/chem/structure-store";

describe("structure-store", () => {
  it("stores and retrieves a record", () => {
    upsertStructureRecord({
      documentId: "doc-1",
      blockId: "mol-001",
      kind: "molecule",
      smiles: "CCO",
      source: "ocr",
      confidence: 0.95,
    });

    const record = getStructureRecord("doc-1", "mol-001");
    expect(record).toBeDefined();
    expect(record!.smiles).toBe("CCO");
    expect(record!.source).toBe("ocr");
    expect(record!.confidence).toBe(0.95);
    expect(record!.updatedAt).toBeTruthy();
    expect(record!.expiresAt).toBeTruthy();
  });

  it("returns undefined for unknown keys", () => {
    const record = getStructureRecord("doc-unknown", "mol-unknown");
    expect(record).toBeUndefined();
  });

  it("overwrites an existing record on upsert", () => {
    upsertStructureRecord({
      documentId: "doc-2",
      blockId: "mol-002",
      kind: "molecule",
      smiles: "CCO",
      source: "manual",
    });

    upsertStructureRecord({
      documentId: "doc-2",
      blockId: "mol-002",
      kind: "molecule",
      smiles: "c1ccccc1",
      source: "ketcher",
    });

    const record = getStructureRecord("doc-2", "mol-002");
    expect(record!.smiles).toBe("c1ccccc1");
    expect(record!.source).toBe("ketcher");
  });

  it("deletes a record", () => {
    upsertStructureRecord({
      documentId: "doc-3",
      blockId: "mol-003",
      kind: "molecule",
      smiles: "C",
      source: "manual",
    });

    deleteStructureRecord("doc-3", "mol-003");
    expect(getStructureRecord("doc-3", "mol-003")).toBeUndefined();
  });

  it("stores molfile when provided", () => {
    upsertStructureRecord({
      documentId: "doc-4",
      blockId: "mol-004",
      kind: "molecule",
      smiles: "CCO",
      molfile: "mock-molfile-content",
      source: "ocr",
    });

    const record = getStructureRecord("doc-4", "mol-004");
    expect(record!.molfile).toBe("mock-molfile-content");
  });
});
