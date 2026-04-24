import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchRagChunksByQueryResult } from "../src/server/chem/postgres-rag-query-service";

const searchRagChunksByQueryMock = vi.fn();

vi.mock("../src/server/chem/postgres-rag-query-service", () => ({
  searchRagChunksByQuery: (...args: unknown[]) =>
    searchRagChunksByQueryMock(...args)
}));

const SESSION_TOKEN = "postgres-route-session";

const createRequest = (body: unknown, authorized = true): Request =>
  new Request("http://localhost/api/chem/postgres/rag/query", {
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

const createResult = (): SearchRagChunksByQueryResult => ({
  query: "ethanol yield",
  model: {
    embeddingModel: "text-embedding-test",
    embeddingDim: 3,
    distanceMetric: "cosine"
  },
  results: [{
    chunkId: "chunk-result",
    revisionId: "rev-1",
    experimentId: "exp-1",
    chunkType: "result_notes",
    sourceEntityIds: ["res-1"],
    text: "result reports 80 percent yield",
    metadata: { date: "2026-04-22", result_ids: ["res-1"] },
    distance: 0.08
  }]
});

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

describe("POST /api/chem/postgres/rag/query", () => {
  beforeEach(() => {
    searchRagChunksByQueryMock.mockReset();
    vi.resetModules();
  });

  it("requires a matching session token", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const response = await POST(createRequest({
      query: "ethanol yield"
    }, false));

    expect(response.status).toBe(403);
    expect(searchRagChunksByQueryMock).not.toHaveBeenCalled();
  });

  it("searches RAG chunks from query text with accepted filters", async () => {
    searchRagChunksByQueryMock.mockResolvedValueOnce(createResult());

    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const response = await POST(createRequest({
      query: " ethanol yield ",
      limit: 4,
      experimentId: " exp-1 ",
      revisionId: " rev-1 ",
      chunkTypes: ["result_notes", "condition_variation_attempt"]
    }));

    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(searchRagChunksByQueryMock).toHaveBeenCalledWith({
      query: "ethanol yield",
      limit: 4,
      experimentId: "exp-1",
      revisionId: "rev-1",
      chunkTypes: ["result_notes", "condition_variation_attempt"]
    });
    expect(body).toMatchObject({
      query: "ethanol yield",
      model: {
        embeddingModel: "text-embedding-test",
        embeddingDim: 3,
        distanceMetric: "cosine"
      },
      count: 1,
      results: createResult().results
    });
  });

  it("rejects invalid json and missing query", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const invalidJsonResponse = await POST(createRequest("{"));
    const missingQueryResponse = await POST(createRequest({
      query: " "
    }));

    expect(invalidJsonResponse.status).toBe(400);
    expect(missingQueryResponse.status).toBe(400);
    expect(await readJson(missingQueryResponse)).toMatchObject({
      message: "query is required"
    });
    expect(searchRagChunksByQueryMock).not.toHaveBeenCalled();
  });

  it("validates limit and chunk types", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const limitResponse = await POST(createRequest({
      query: "ethanol yield",
      limit: 0
    }));
    const chunkTypeResponse = await POST(createRequest({
      query: "ethanol yield",
      chunkTypes: ["procedure"]
    }));
    const maxLimitResponse = await POST(createRequest({
      query: "ethanol yield",
      limit: 101
    }));

    expect(limitResponse.status).toBe(400);
    expect(chunkTypeResponse.status).toBe(400);
    expect(maxLimitResponse.status).toBe(400);
    expect(searchRagChunksByQueryMock).not.toHaveBeenCalled();
  });

  it("maps missing embedding config to server configuration error", async () => {
    searchRagChunksByQueryMock.mockRejectedValueOnce(
      new Error("CHEMD_EMBEDDING_BASE_URL is required")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const response = await POST(createRequest({
      query: "ethanol yield"
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_EMBEDDING_CONFIG"
    });
  });

  it("maps missing postgres config to server configuration error", async () => {
    searchRagChunksByQueryMock.mockRejectedValueOnce(
      new Error("CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const response = await POST(createRequest({
      query: "ethanol yield"
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_CONFIG"
    });
  });

  it("maps provider or pgvector failures to upstream failures", async () => {
    searchRagChunksByQueryMock.mockRejectedValueOnce(
      new Error("embedding provider request failed (502)")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/query/route");
    const response = await POST(createRequest({
      query: "ethanol yield"
    }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_RAG_QUERY",
      message: "postgres rag query failed"
    });
  });
});
