import { afterEach, describe, expect, it, vi } from "vitest";

describe("chem-service client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("converts timed out service calls into typed ChemServiceError values", async () => {
    vi.stubEnv("CHEM_SERVICE_TIMEOUT_MS", "1");
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
      if (init?.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Response("{}");
    });

    const { callChemServiceNormalize } = await import("../src/server/chem/chem-service-client");

    await expect(callChemServiceNormalize({ smiles: "CCO" })).rejects.toMatchObject({
      status: 504,
      code: "E_CHEM_SERVICE_TIMEOUT",
      message: "chem-service request timed out"
    });
  });
});
