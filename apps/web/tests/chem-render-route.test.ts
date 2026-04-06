import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceNormalizeMock = vi.fn();
const callChemServiceRenderMock = vi.fn();
const resolveChemicalNotationMock = vi.fn();

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceNormalize: (...args: unknown[]) => callChemServiceNormalizeMock(...args),
  callChemServiceRender: (...args: unknown[]) => callChemServiceRenderMock(...args)
}));

vi.mock("../src/server/chem/cas-resolver", () => ({
  resolveChemicalNotation: (...args: unknown[]) => resolveChemicalNotationMock(...args),
  isCasResolutionError: (error: unknown) =>
    typeof error === "object"
    && error !== null
    && typeof (error as { status?: unknown }).status === "number"
    && typeof (error as { code?: unknown }).code === "string"
}));

describe("POST /api/chem/render", () => {
  beforeEach(() => {
    callChemServiceNormalizeMock.mockReset();
    callChemServiceRenderMock.mockReset();
    resolveChemicalNotationMock.mockReset();
    vi.resetModules();
  });

  it("normalizes molecule payload before requesting render output", async () => {
    resolveChemicalNotationMock.mockResolvedValueOnce("CCO");
    callChemServiceNormalizeMock.mockResolvedValueOnce({
      canonicalSmiles: "CCO",
      normalizedMolfile: "normalized-molfile",
      warnings: ["normalize ok"]
    });
    callChemServiceRenderMock.mockResolvedValueOnce({
      svg: "<svg>normalized</svg>",
      warnings: ["render ok"]
    });

    const { POST } = await import("../src/app/api/chem/render/route");

    const response = await POST(
      new Request("http://localhost/api/chem/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "molecule",
          smiles: " CCO ",
          molfile: "legacy-molfile"
        })
      })
    );
    const payload = (await response.json()) as {
      svg?: string;
      warnings?: string[];
      canonicalSmiles?: string;
      normalizedMolfile?: string;
    };

    expect(callChemServiceNormalizeMock).toHaveBeenCalledWith({
      smiles: "CCO",
      molfile: "legacy-molfile"
    });
    expect(callChemServiceRenderMock).toHaveBeenCalledWith({
      kind: "molecule",
      smiles: "CCO",
      molfile: "normalized-molfile",
      renderOptions: undefined
    });
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      svg: "<svg>normalized</svg>",
      canonicalSmiles: "CCO",
      normalizedMolfile: "normalized-molfile",
      warnings: ["normalize ok", "render ok"]
    });
  });

  it("resolves CAS input before calling chem-service", async () => {
    resolveChemicalNotationMock.mockResolvedValueOnce("CCO");
    callChemServiceNormalizeMock.mockResolvedValueOnce({
      canonicalSmiles: "CCO",
      normalizedMolfile: undefined,
      warnings: []
    });
    callChemServiceRenderMock.mockResolvedValueOnce({
      svg: "<svg>normalized</svg>",
      warnings: []
    });

    const { POST } = await import("../src/app/api/chem/render/route");

    const response = await POST(
      new Request("http://localhost/api/chem/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "molecule",
          smiles: "64-17-5"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(resolveChemicalNotationMock).toHaveBeenCalledWith("64-17-5");
    expect(callChemServiceNormalizeMock).toHaveBeenCalledWith({
      smiles: "CCO",
      molfile: undefined
    });
  });

  it("returns 400 for invalid CAS-like input", async () => {
    resolveChemicalNotationMock.mockRejectedValueOnce(
      Object.assign(new Error('CAS "64-17-6" has an invalid checksum.'), {
        status: 400,
        code: "INVALID_CAS"
      })
    );
    const { POST } = await import("../src/app/api/chem/render/route");

    const response = await POST(
      new Request("http://localhost/api/chem/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "molecule",
          smiles: "64-17-6"
        })
      })
    );
    const payload = (await response.json()) as { message?: string };

    expect(response.status).toBe(400);
    expect(payload.message).toContain("invalid checksum");
    expect(callChemServiceNormalizeMock).not.toHaveBeenCalled();
  });

  it("returns fallback svg when chem service render fails", async () => {
    callChemServiceNormalizeMock.mockResolvedValueOnce({
      canonicalSmiles: "CCO",
      normalizedMolfile: undefined,
      warnings: ["normalize ok"]
    });
    callChemServiceRenderMock.mockRejectedValueOnce(new Error("service down"));
    const { POST } = await import("../src/app/api/chem/render/route");

    const response = await POST(
      new Request("http://localhost/api/chem/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "molecule",
          smiles: "CCO"
        })
      })
    );
    const payload = (await response.json()) as { svg?: string; warnings?: string[] };

    expect(response.status).toBe(200);
    expect(payload.svg).toContain("<svg");
    expect(payload.svg).toContain("CCO");
    expect(payload.warnings?.[0]).toContain("fallback renderer used");
  });

  it("escapes untrusted smiles text in fallback svg output", async () => {
    callChemServiceNormalizeMock.mockRejectedValueOnce(new Error("normalize down"));
    callChemServiceRenderMock.mockRejectedValueOnce(new Error("service down"));
    const { POST } = await import("../src/app/api/chem/render/route");

    const response = await POST(
      new Request("http://localhost/api/chem/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind: "molecule",
          smiles: `<script>alert("xss")</script>`
        })
      })
    );
    const payload = (await response.json()) as { svg?: string };

    expect(response.status).toBe(200);
    expect(payload.svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(payload.svg).not.toContain("<script>");
  });
});
