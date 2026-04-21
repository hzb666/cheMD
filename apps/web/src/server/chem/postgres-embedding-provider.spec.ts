import { describe, expect, it, vi } from "vitest";

import {
  createHttpEmbeddingProvider,
  createRuntimeEmbeddingProvider,
  parseEmbeddingProviderConfig
} from "./postgres-embedding-provider";

const createJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });

describe("postgres embedding provider", () => {
  it("parses runtime embedding configuration", () => {
    const config = parseEmbeddingProviderConfig({
      CHEMD_EMBEDDING_BASE_URL: " https://embed.example/v1 ",
      CHEMD_EMBEDDING_PATH: " embeddings ",
      CHEMD_EMBEDDING_API_KEY: " secret ",
      CHEMD_EMBEDDING_MODEL: " text-embedding-test ",
      CHEMD_EMBEDDING_DIM: "3",
      CHEMD_EMBEDDING_TIMEOUT_MS: "5000",
      CHEMD_EMBEDDING_DISTANCE_METRIC: "l2"
    });

    expect(config).toEqual({
      baseUrl: "https://embed.example/v1",
      path: "embeddings",
      apiKey: "secret",
      embeddingModel: "text-embedding-test",
      embeddingDim: 3,
      timeoutMs: 5000,
      distanceMetric: "l2"
    });
  });

  it("posts text to a Chemd embedding gateway and validates vectors", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({
      embedding: [0.1, 0.2, 0.3]
    })) as unknown as typeof fetch;

    const provider = createHttpEmbeddingProvider({
      baseUrl: "https://embed.example/api/",
      path: "embed",
      apiKey: "secret",
      embeddingModel: "text-embedding-test",
      embeddingDim: 3,
      timeoutMs: 5000
    }, fetchImpl);

    const embedding = await provider.embed("yield in ethanol");
    const request = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(embedding).toEqual([0.1, 0.2, 0.3]);
    expect(request[0]).toBe("https://embed.example/api/embed");
    expect(request[1].headers.get("Authorization")).toBe("Bearer secret");
    expect(JSON.parse(request[1].body as string)).toEqual({
      input: "yield in ethanol",
      model: "text-embedding-test"
    });
  });

  it("accepts OpenAI-compatible embedding response shape", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({
      data: [{ embedding: [0.4, 0.5] }]
    })) as unknown as typeof fetch;
    const provider = createRuntimeEmbeddingProvider({
      fetchImpl,
      env: {
        CHEMD_EMBEDDING_BASE_URL: "https://embed.example",
        CHEMD_EMBEDDING_MODEL: "text-embedding-test",
        CHEMD_EMBEDDING_DIM: "2"
      }
    });

    await expect(provider.provider.embed("query")).resolves.toEqual([0.4, 0.5]);
    expect(provider.model).toEqual({
      embeddingModel: "text-embedding-test",
      embeddingDim: 2,
      distanceMetric: undefined
    });
  });

  it("rejects missing config and invalid provider responses", async () => {
    expect(() => parseEmbeddingProviderConfig({
      CHEMD_EMBEDDING_MODEL: "text-embedding-test",
      CHEMD_EMBEDDING_DIM: "3"
    })).toThrow("CHEMD_EMBEDDING_BASE_URL is required");

    const fetchImpl = vi.fn(async () => createJsonResponse({
      embedding: [0.1]
    })) as unknown as typeof fetch;
    const provider = createHttpEmbeddingProvider({
      baseUrl: "https://embed.example",
      path: "/embed",
      embeddingModel: "text-embedding-test",
      embeddingDim: 3,
      timeoutMs: 5000
    }, fetchImpl);

    await expect(provider.embed("query")).rejects.toThrow(
      "embedding response dimension does not match CHEMD_EMBEDDING_DIM"
    );
  });
});
