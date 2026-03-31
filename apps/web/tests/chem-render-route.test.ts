import { beforeEach, describe, expect, it, vi } from "vitest";

const callChemServiceRenderMock = vi.fn();

vi.mock("../src/server/chem/chem-service-client", () => ({
  callChemServiceRender: (...args: unknown[]) => callChemServiceRenderMock(...args)
}));

describe("POST /api/chem/render", () => {
  beforeEach(() => {
    callChemServiceRenderMock.mockReset();
    vi.resetModules();
  });

  it("returns fallback svg when chem service render fails", async () => {
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
