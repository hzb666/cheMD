import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceReactionOcrMock = vi.fn();
const saveStructureRecordMock = vi.fn();
const SESSION_TOKEN = "token-rxn-ocr";

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceReactionOcr: (...args: unknown[]) => callChemServiceReactionOcrMock(...args)
}));

vi.mock("../src/server/chem/structure-store", () => ({
  saveStructureRecord: (...args: unknown[]) => saveStructureRecordMock(...args)
}));

const createImageFormDataRequest = (file: File): Request => {
  const formData = new FormData();
  formData.set("documentId", "doc-rxn");
  formData.set("blockId", "rxn-main");
  formData.set("sessionId", "session-rxn");
  formData.set("image", file);

  return new Request("http://localhost/api/chem/reaction/ocr", {
    method: "POST",
    headers: {
      "x-chemd-session-token": SESSION_TOKEN,
      cookie: `chemd-session-token=${SESSION_TOKEN}`
    },
    body: formData
  });
};

describe("POST /api/chem/reaction/ocr", () => {
  beforeEach(() => {
    callChemServiceReactionOcrMock.mockReset();
    saveStructureRecordMock.mockReset();
    vi.resetModules();
  });

  it("rejects placeholder reaction OCR payloads instead of writing them back", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "failed",
      confidence: 0,
      warnings: ["Reaction OCR provider is not enabled; placeholder reaction was not persisted."]
    });

    const { POST } = await import("../src/app/api/chem/reaction/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "reaction.png", { type: "image/png" }))
    );
    const payload = (await response.json()) as {
      status?: string;
      warnings?: string[];
    };

    expect(response.status).toBe(422);
    expect(payload.status).toBe("failed");
    expect(payload.warnings?.[0]).toContain("placeholder");
    expect(saveStructureRecordMock).not.toHaveBeenCalled();
  });

  it("stores normalized reaction OCR output as a reaction draft", async () => {
    callChemServiceReactionOcrMock.mockResolvedValueOnce({
      status: "ok",
      reaction: {
        reactants: [" CCO ", " O=O "],
        products: [" CC(=O)O "],
        conditions: [" air ", " 80 C "]
      },
      confidence: 0.93,
      warnings: ["fallback provider active"]
    });

    const { POST } = await import("../src/app/api/chem/reaction/ocr/route");
    const response = await POST(
      createImageFormDataRequest(new File(["binary"], "reaction.png", { type: "image/png" }))
    );
    const payload = (await response.json()) as {
      blockId?: string;
      action?: string;
      reaction?: {
        reactants: string[];
        products: string[];
        conditions: string[];
      };
      normalized_conditions?: {
        atmosphere?: { raw: string; normalized: string };
        temperature?: { raw: string; value: number; unit: string };
        conditions_text?: { raw: string; normalized: string[] };
      };
      confidence?: number;
      warnings?: string[];
    };

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "ok",
      kind: "reaction",
      blockId: "rxn-main",
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
      confidence: 0.93,
      warnings: ["fallback provider active"]
    });
    expect(saveStructureRecordMock).toHaveBeenCalledWith({
      kind: "reaction",
      documentId: "doc-rxn",
      blockId: "rxn-main",
      sessionId: "session-rxn",
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"],
      source: "ocr",
      confidence: 0.93
    });
  });

  it("requires sessionId for reaction OCR cache isolation", async () => {
    const formData = new FormData();
    formData.set("documentId", "doc-rxn");
    formData.set("blockId", "rxn-main");
    formData.set("image", new File(["binary"], "reaction.png", { type: "image/png" }));

    const { POST } = await import("../src/app/api/chem/reaction/ocr/route");
    const response = await POST(
      new Request("http://localhost/api/chem/reaction/ocr", {
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
    expect(callChemServiceReactionOcrMock).not.toHaveBeenCalled();
  });

  it("rejects reaction OCR writeback requests without a matching session token", async () => {
    const formData = new FormData();
    formData.set("documentId", "doc-rxn");
    formData.set("blockId", "rxn-main");
    formData.set("sessionId", "session-rxn");
    formData.set("image", new File(["binary"], "reaction.png", { type: "image/png" }));

    const { POST } = await import("../src/app/api/chem/reaction/ocr/route");
    const response = await POST(
      new Request("http://localhost/api/chem/reaction/ocr", {
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
    expect(callChemServiceReactionOcrMock).not.toHaveBeenCalled();
  });
});
