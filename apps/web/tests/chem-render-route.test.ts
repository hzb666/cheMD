import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceNormalizeMock = vi.fn();
const callChemServiceRenderMock = vi.fn();

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceNormalize: (...args: unknown[]) => callChemServiceNormalizeMock(...args),
  callChemServiceRender: (...args: unknown[]) => callChemServiceRenderMock(...args)
}));

describe("POST /api/chem/render", () => {
  beforeEach(() => {
    callChemServiceNormalizeMock.mockReset();
    callChemServiceRenderMock.mockReset();
    vi.resetModules();
  });

  it("normalizes molecule payload before requesting render output", async () => {
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
      smiles: " CCO ",
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
