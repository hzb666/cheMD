import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SimilarRagChunkResult } from "../src/server/chem/postgres-rag";

const searchSimilarRagChunksWithRuntimeMock = vi.fn();

vi.mock("../src/server/chem/postgres-rag-search-service", () => ({
  searchSimilarRagChunksWithRuntime: (...args: unknown[]) =>
    searchSimilarRagChunksWithRuntimeMock(...args)
}));

const SESSION_TOKEN = "postgres-route-session";

const createRequest = (body: unknown, authorized = true): Request =>
  new Request("http://localhost/api/chem/postgres/rag/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorized
        ? {
            "x-chemd-session-token": SESSION_TOKEN,
            cookie: `chemd-session-token=${SESSION_TOKEN}`
          }
        : {})
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });

const results: SimilarRagChunkResult[] = [{
  chunkId: "chunk-reaction",
  revisionId: "rev-1",
  experimentId: "exp-1",
  chunkType: "reaction_summary",
  sourceEntityIds: ["rxn-1"],
  text: "reaction uses ethanol and THF",
  metadata: { date: "2026-04-22", reaction_ids: ["rxn-1"] },
  distance: 0.12
}];

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

describe("POST /api/chem/postgres/rag/search", () => {
  beforeEach(() => {
    searchSimilarRagChunksWithRuntimeMock.mockReset();
    vi.resetModules();
  });

  it("requires a matching session token", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3]
    }, false));

    expect(response.status).toBe(403);
    expect(searchSimilarRagChunksWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("searches RAG chunks with accepted model, vector, and filters", async () => {
    searchSimilarRagChunksWithRuntimeMock.mockResolvedValueOnce(results);

    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest({
      embeddingModel: " test-embedding-3 ",
      embeddingDim: 3,
      distanceMetric: "cosine",
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
      experimentId: " exp-1 ",
      revisionId: " rev-1 ",
      chunkTypes: ["reaction_summary", "condition_variation"]
    }));

    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(searchSimilarRagChunksWithRuntimeMock).toHaveBeenCalledWith({
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
      experimentId: "exp-1",
      revisionId: "rev-1",
      chunkTypes: ["reaction_summary", "condition_variation"],
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3,
        distanceMetric: "cosine"
      }
    });
    expect(body).toMatchObject({
      model: {
        embeddingModel: "test-embedding-3",
        embeddingDim: 3,
        distanceMetric: "cosine"
      },
      count: 1,
      results
    });
  });

  it("rejects invalid json bodies", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest("{"));

    expect(response.status).toBe(400);
    expect(searchSimilarRagChunksWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("requires embedding model and dimension", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest({
      embedding: [0.1, 0.2, 0.3],
      embeddingDim: 3
    }));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      message: "embeddingModel and embeddingDim are required"
    });
  });

  it("requires a finite embedding vector matching the declared dimension", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, Number.NaN]
    }));

    expect(response.status).toBe(400);
    expect(searchSimilarRagChunksWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("validates metric, limit, and chunk type values", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");

    const metricResponse = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3],
      distanceMetric: "dot"
    }));
    const limitResponse = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3],
      limit: 0
    }));
    const chunkTypeResponse = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3],
      chunkTypes: ["procedure"]
    }));
    const maxLimitResponse = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3],
      limit: 101
    }));
    const maxDimResponse = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 4097,
      embedding: []
    }));

    expect(metricResponse.status).toBe(400);
    expect(limitResponse.status).toBe(400);
    expect(chunkTypeResponse.status).toBe(400);
    expect(maxLimitResponse.status).toBe(400);
    expect(maxDimResponse.status).toBe(400);
    expect(searchSimilarRagChunksWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("maps missing postgres config to a server configuration error", async () => {
    searchSimilarRagChunksWithRuntimeMock.mockRejectedValueOnce(
      new Error("CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3]
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_CONFIG"
    });
  });

  it("maps pgvector search failures to upstream failures", async () => {
    searchSimilarRagChunksWithRuntimeMock.mockRejectedValueOnce(
      new Error("search failed")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/search/route");
    const response = await POST(createRequest({
      embeddingModel: "test-embedding-3",
      embeddingDim: 3,
      embedding: [0.1, 0.2, 0.3]
    }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_RAG_SEARCH",
      message: "postgres rag search failed"
    });
  });
});
