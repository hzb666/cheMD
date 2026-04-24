import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BackfillRagChunkEmbeddingsResult } from "../src/server/chem/postgres-rag-backfill-service";

const backfillMock = vi.fn();

vi.mock("../src/server/chem/postgres-rag-backfill-service", () => ({
  backfillRagChunkEmbeddingsWithRuntime: (...args: unknown[]) =>
    backfillMock(...args)
}));

const SESSION_TOKEN = "postgres-route-session";

const createRequest = (body: unknown, authorized = true): Request =>
  new Request("http://localhost/api/chem/postgres/rag/backfill", {
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

const createResult = (): BackfillRagChunkEmbeddingsResult => ({
  model: {
    embeddingModel: "text-embedding-test",
    embeddingDim: 3,
    distanceMetric: "cosine"
  },
  selected: 2,
  embedded: 1,
  skippedExisting: 1,
  embeddings: [{
    chunkId: "chunk-1",
    revisionId: "rev-1",
    embeddingModel: "text-embedding-test",
    embedding: [0.1, 0.2, 0.3]
  }]
});

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

describe("POST /api/chem/postgres/rag/backfill", () => {
  beforeEach(() => {
    backfillMock.mockReset();
    vi.resetModules();
  });

  it("requires a matching session token", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const response = await POST(createRequest({
      limit: 1
    }, false));

    expect(response.status).toBe(403);
    expect(backfillMock).not.toHaveBeenCalled();
  });

  it("starts an embedding backfill with accepted filters", async () => {
    backfillMock.mockResolvedValueOnce(createResult());

    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const response = await POST(createRequest({
      revisionId: " rev-1 ",
      experimentId: " exp-1 ",
      chunkTypes: ["result_notes", "artifact_notes"],
      limit: 2,
      overwriteExisting: true
    }));

    const body = await readJson(response);

    expect(response.status).toBe(202);
    expect(backfillMock).toHaveBeenCalledWith({
      revisionId: "rev-1",
      experimentId: "exp-1",
      chunkTypes: ["result_notes", "artifact_notes"],
      limit: 2,
      overwriteExisting: true
    });
    expect(body).toMatchObject({
      selected: 2,
      embedded: 1,
      skippedExisting: 1,
      embeddings: {
        count: 1,
        chunkIds: ["chunk-1"]
      }
    });
  });

  it("rejects invalid json and unbounded selection", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const invalidJsonResponse = await POST(createRequest("{"));
    const unboundedResponse = await POST(createRequest({}));

    expect(invalidJsonResponse.status).toBe(400);
    expect(unboundedResponse.status).toBe(400);
    expect(await readJson(unboundedResponse)).toMatchObject({
      message: "revisionId, experimentId, or limit is required"
    });
    expect(backfillMock).not.toHaveBeenCalled();
  });

  it("validates limit, overwriteExisting, and chunk types", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const limitResponse = await POST(createRequest({ limit: 0 }));
    const overwriteResponse = await POST(createRequest({
      limit: 1,
      overwriteExisting: "true"
    }));
    const chunkTypeResponse = await POST(createRequest({
      limit: 1,
      chunkTypes: ["procedure"]
    }));
    const maxLimitResponse = await POST(createRequest({ limit: 101 }));

    expect(limitResponse.status).toBe(400);
    expect(overwriteResponse.status).toBe(400);
    expect(chunkTypeResponse.status).toBe(400);
    expect(maxLimitResponse.status).toBe(400);
    expect(backfillMock).not.toHaveBeenCalled();
  });

  it("maps missing embedding config to server configuration error", async () => {
    backfillMock.mockRejectedValueOnce(
      new Error("CHEMD_EMBEDDING_BASE_URL is required")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const response = await POST(createRequest({
      limit: 1
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_EMBEDDING_CONFIG"
    });
  });

  it("maps missing postgres config to server configuration error", async () => {
    backfillMock.mockRejectedValueOnce(
      new Error("CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required")
    );

    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const response = await POST(createRequest({
      limit: 1
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_CONFIG"
    });
  });

  it("maps provider or pgvector failures to upstream failures", async () => {
    backfillMock.mockRejectedValueOnce(new Error("embedding provider failed"));

    const { POST } = await import("../src/app/api/chem/postgres/rag/backfill/route");
    const response = await POST(createRequest({
      limit: 1
    }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_RAG_BACKFILL",
      message: "postgres rag backfill failed"
    });
  });
});
