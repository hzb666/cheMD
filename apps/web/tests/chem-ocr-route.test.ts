import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceOcrMock = vi.fn();
const callChemServiceReactionOcrMock = vi.fn();
const callChemServiceNormalizeMock = vi.fn();
const saveStructureRecordMock = vi.fn();
const SESSION_TOKEN = "token-ocr";

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceReactionOcr: (...args: unknown[]) => callChemServiceReactionOcrMock(...args),
  callChemServiceOcr: (...args: unknown[]) => callChemServiceOcrMock(...args),
  callChemServiceNormalize: (...args: unknown[]) => callChemServiceNormalizeMock(...args)
}));

vi.mock("../src/server/chem/structure-store", () => ({
  saveStructureRecord: (...args: unknown[]) => saveStructureRecordMock(...args)
}));

const createImageFormDataRequest = (
  file: File,
  options: {
    blockId?: string;
    moleculeBlockId?: string;
    reactionBlockId?: string;
  } = {}
): Request => {
  const formData = new FormData();
  formData.set("documentId", "doc-ocr");
  formData.set("blockId", options.blockId ?? "mol-ocr");
  if (options.moleculeBlockId) {
    formData.set("moleculeBlockId", options.moleculeBlockId);
  }
  if (options.reactionBlockId) {
    formData.set("reactionBlockId", options.reactionBlockId);
  }
  formData.set("sessionId", "session-ocr");
  formData.set("image", file);

  return new Request("http://localhost/api/chem/ocr", {
    method: "POST",
    headers: {
      "x-chemd-session-token": SESSION_TOKEN,
      cookie: `chemd-session-token=${SESSION_TOKEN}`
    },
    body: formData
  });
};

beforeEach(() => {
  callChemServiceReactionOcrMock.mockReset();
  callChemServiceOcrMock.mockReset();
  callChemServiceNormalizeMock.mockReset();
  saveStructureRecordMock.mockReset();
  vi.resetModules();
});

describe("POST /api/chem/ocr validation", () => {
  it("rejects placeholder OCR structures instead of writing them back", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "failed",
      warnings: ["RxnScribe did not return a usable reaction result."]
    });
    callChemServiceOcrMock.mockResolvedValueOnce({
      status: "ok",
      structure: {
        smiles: "CCO",
        molfile: "MOLFILE_PLACEHOLDER"
      },
      confidence: 0,
      warnings: ["MolScribe is not enabled; returned placeholder structure."]
    });

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "molecule.png", { type: "image/png" }))
    );
    const payload = (await response.json()) as {
      status?: string;
      message?: string;
      warnings?: string[];
    };

    expect(response.status).toBe(422);
    expect(payload.status).toBe("failed");
    expect(payload.warnings?.[0]).toContain("placeholder");
    expect(callChemServiceNormalizeMock).not.toHaveBeenCalled();
    expect(saveStructureRecordMock).not.toHaveBeenCalled();
  });

  it("requires sessionId for structure cache isolation", async () => {
    const formData = new FormData();
    formData.set("documentId", "doc-ocr");
    formData.set("blockId", "mol-ocr");
    formData.set("image", new File(["binary"], "molecule.png", { type: "image/png" }));

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      new Request("http://localhost/api/chem/ocr", {
        method: "POST",
        headers: {
          "x-chemd-session-token": SESSION_TOKEN,
          cookie: `chemd-session-token=${SESSION_TOKEN}`
        },
        body: formData
      })
    );
    const payload = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(payload.message).toContain("sessionId");
    expect(callChemServiceOcrMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported upload mime types before calling chem service", async () => {
    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["plain-text"], "note.txt", { type: "text/plain" }))
    );
    const payload = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(payload.message).toContain("image");
    expect(callChemServiceOcrMock).not.toHaveBeenCalled();
  });

  it("rejects oversized uploads before calling chem service", async () => {
    const { POST } = await import("../src/app/api/chem/ocr/route");
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "huge.png", {
      type: "image/png"
    });
    const response = await POST(createImageFormDataRequest(oversized));
    const payload = (await response.json()) as { message?: string };

    expect(response.status).toBe(413);
    expect(payload.message).toContain("too large");
    expect(callChemServiceOcrMock).not.toHaveBeenCalled();
  });

  it("rejects OCR writeback requests without a matching session token", async () => {
    const formData = new FormData();
    formData.set("documentId", "doc-ocr");
    formData.set("blockId", "mol-ocr");
    formData.set("sessionId", "session-ocr");
    formData.set("image", new File(["binary"], "molecule.png", { type: "image/png" }));

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      new Request("http://localhost/api/chem/ocr", {
        method: "POST",
        headers: {
          cookie: "chemd-session-token=expected-token"
        },
        body: formData
      })
    );
    const payload = (await response.json()) as { message?: string };

    expect(response.status).toBe(403);
    expect(payload.message).toContain("session token");
    expect(callChemServiceOcrMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/chem/ocr reaction writeback", () => {
  it("prefers RxnScribe and writes back a reaction when a usable reaction payload exists", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "ok",
      reaction: {
        reactants: [" CCO ", " O=O "],
        products: [" CC(=O)O "],
        conditions: [" air ", " 80 C "]
      },
      confidence: 0.91,
      warnings: ["rxnscribe"]
    });

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "reaction.png", { type: "image/png" }))
    );
    const payload = (await response.json()) as {
      status?: string;
      kind?: string;
      reaction?: {
        reactants: string[];
        products: string[];
        conditions: string[];
      };
      normalized_conditions?: {
        atmosphere?: { raw: string; normalized: string };
        temperature?: { raw: string; value: number; unit: string };
      };
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "ok",
      kind: "reaction",
      blockId: "mol-ocr",
      action: "update_existing",
      reaction: {
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air", "80 C"]
      },
      normalized_conditions: {
        conditions_text: {
          raw: "air | 80 C",
          normalized: ["air", "80 C"]
        },
        atmosphere: {
          raw: "air",
          normalized: "air"
        },
        temperature: {
          raw: "80 C",
          value: 80,
          unit: "C"
        }
      },
      confidence: 0.91,
      warnings: ["rxnscribe"]
    });
    expect(callChemServiceOcrMock).not.toHaveBeenCalled();
    expect(callChemServiceNormalizeMock).not.toHaveBeenCalled();
    expect(saveStructureRecordMock).toHaveBeenCalledWith({
      kind: "reaction",
      documentId: "doc-ocr",
      blockId: "mol-ocr",
      sessionId: "session-ocr",
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"],
      source: "ocr",
      confidence: 0.91
    });
  });

  it("uses the reaction-specific block id when reaction OCR succeeds", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "ok",
      reaction: {
        reactants: ["CCO"],
        products: ["CC(=O)O"],
        conditions: []
      },
      confidence: 0.8,
      warnings: []
    });

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "reaction.png", { type: "image/png" }), {
        blockId: "chem-fallback",
        moleculeBlockId: "chem-mol-target",
        reactionBlockId: "chem-rxn-target"
      })
    );
    const payload = (await response.json()) as { blockId?: string };

    expect(response.status).toBe(200);
    expect(payload.blockId).toBe("chem-rxn-target");
    expect(saveStructureRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reaction",
        blockId: "chem-rxn-target"
      })
    );
  });

  it("uses the fallback block id when reaction OCR succeeds but only a molecule target was provided", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "ok",
      reaction: {
        reactants: ["CCO"],
        products: ["CC(=O)O"],
        conditions: []
      },
      confidence: 0.8,
      warnings: []
    });

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "reaction.png", { type: "image/png" }), {
        blockId: "chem-fallback",
        moleculeBlockId: "chem-mol-target"
      })
    );
    const payload = (await response.json()) as { blockId?: string };

    expect(response.status).toBe(200);
    expect(payload.blockId).toBe("chem-fallback");
    expect(saveStructureRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reaction",
        blockId: "chem-fallback"
      })
    );
  });

});

describe("POST /api/chem/ocr molecule fallback", () => {
  it("falls back to molecule OCR when RxnScribe does not return a usable reaction", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "failed",
      warnings: ["RxnScribe did not return a usable reaction result."]
    });
    callChemServiceOcrMock.mockResolvedValueOnce({
      status: "ok",
      structure: {
        smiles: "CCO",
        molfile: "mock-molfile"
      },
      confidence: 0.67,
      warnings: ["molscribe"]
    });
    callChemServiceNormalizeMock.mockResolvedValueOnce({
      canonicalSmiles: "CCO",
      normalizedMolfile: "normalized-molfile",
      warnings: ["normalized"]
    });

    const { POST } = await import("../src/app/api/chem/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "molecule.png", { type: "image/png" }))
    );
    const payload = (await response.json()) as {
      status?: string;
      kind?: string;
      structure?: {
        smiles: string;
        molfile?: string;
      };
      warnings?: string[];
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "ok",
      kind: "molecule",
      blockId: "mol-ocr",
      action: "update_existing",
      structure: {
        smiles: "CCO",
        molfile: "normalized-molfile"
      },
      confidence: 0.67,
      warnings: [
        "reaction ocr fallback",
        "RxnScribe did not return a usable reaction result.",
        "molscribe",
        "normalized"
      ]
    });
    expect(callChemServiceReactionOcrMock).toHaveBeenCalledTimes(1);
    expect(callChemServiceOcrMock).toHaveBeenCalledTimes(1);
  });
});
