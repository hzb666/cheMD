import { describe, expect, it } from "vitest";
import type { EditorGraphRagSourceRange } from "@chemd/language-service";

import type {
  CreateEmbeddingVectorsResult,
  EmbeddingProviderStatus,
  PostgresStatus
} from "../contracts";
import type { WorkspaceRagResult } from "./rag-citation-gate";
import {
  buildPostgresRagBackfillEmbeddingPlan,
  buildPostgresRagBackfillReadiness,
  buildPostgresRagBackfillRequest,
  formatPostgresRagBackfillCompletionMessage
} from "./postgres-rag-backfill-controller";

const range = (startLine: number): EditorGraphRagSourceRange => ({
  startLine,
  startColumn: 1,
  endLine: startLine,
  endColumn: 20
});

const postgresStatus = (patch: Partial<PostgresStatus> = {}): PostgresStatus => ({
  state: "ready",
  label: "Postgres ready",
  detail: "pgvector installed and schema ready",
  configured: true,
  source: "external postgres: test",
  host: "127.0.0.1",
  database: "chemd",
  user: "chemd",
  ssl: "disable",
  vectorInstalled: true,
  schemaReady: true,
  migrationState: "ready",
  migrationReason: "all shared schema tables are present",
  coreTablesFound: 11,
  timeoutMs: 1000,
  pool: null,
  ...patch
});

const embeddingStatus = (
  patch: Partial<EmbeddingProviderStatus> = {}
): EmbeddingProviderStatus => ({
  state: "ready",
  configured: true,
  providerKind: "http_env",
  model: "text-embedding-3-small",
  embeddingDim: 3,
  distanceMetric: "cosine",
  baseUrlHost: "localhost",
  timeoutMs: 1000,
  apiKeyConfigured: true,
  detail: "Embedding provider ready",
  ...patch
});

const localResult = (
  patch: Partial<WorkspaceRagResult> = {}
): WorkspaceRagResult => ({
  id: "rag-citation-local-1",
  citationId: "citation-local-1",
  revisionId: "revision-local-1",
  chunkId: "chunk-local-1",
  sourceRange: range(3),
  documentPath: "experiments/local.chemd.md",
  documentUri: "chemd-workspace://workspace/experiments/local.chemd.md",
  text: "Local evidence about reaction yield.",
  label: "Local evidence about reaction yield.",
  detail: "experiments/local.chemd.md citation-local-1 L3",
  locator: "citation-local-1 L3",
  ...patch
});

const embeddingResult = (
  patch: Partial<CreateEmbeddingVectorsResult> = {}
): CreateEmbeddingVectorsResult => ({
  state: "ready",
  label: "Embeddings ready",
  detail: "1 embedding generated",
  providerKind: "http_env",
  model: "text-embedding-3-small",
  dimension: 3,
  items: [
    {
      id: "rag-citation-local-1",
      state: "ready",
      label: "Embedding ready",
      detail: "Embedding generated",
      embedding: [0.1, 0.2, 0.3],
      dimension: 3
    }
  ],
  ...patch
});

describe("desktop Postgres RAG backfill controller helpers", () => {
  it("reports readiness blockers before backfill can run", () => {
    const readiness = buildPostgresRagBackfillReadiness({
      mode: "sample",
      postgresStatus: postgresStatus({ configured: false, vectorInstalled: false }),
      embeddingStatus: embeddingStatus({ state: "offline", configured: false, model: null }),
      localResults: [],
      runnerAvailable: false
    });

    expect(readiness.disabled).toBe(true);
    expect(readiness.disabledReasons).toEqual([
      "not_workspace_mode",
      "postgres_not_configured",
      "pgvector_not_ready",
      "embedding_unavailable",
      "embedding_model_missing",
      "local_rag_empty",
      "runner_unavailable"
    ]);
  });

  it("plans only unique local chunks with full text for embedding", () => {
    const plan = buildPostgresRagBackfillEmbeddingPlan([
      localResult(),
      localResult({
        id: "duplicate",
        citationId: "citation-local-duplicate"
      }),
      localResult({
        id: "blank",
        revisionId: "revision-blank",
        chunkId: "chunk-blank",
        text: "  "
      })
    ]);

    expect(plan.embeddingItems).toEqual([
      {
        id: "rag-citation-local-1",
        text: "Local evidence about reaction yield."
      }
    ]);
    expect(plan.skippedDuplicateCount).toBe(1);
    expect(plan.skippedBlankTextCount).toBe(1);
  });

  it("builds a Postgres backfill request from ready embedding items", () => {
    const plan = buildPostgresRagBackfillEmbeddingPlan([localResult()]);
    const result = buildPostgresRagBackfillRequest({
      plan,
      embeddingResult: embeddingResult(),
      embeddingModel: "text-embedding-3-small",
      fallbackEmbeddingDim: 3,
      distanceMetric: "cosine"
    });

    expect(result.request).toEqual({
      embeddingModel: "text-embedding-3-small",
      embeddingDim: 3,
      distanceMetric: "cosine",
      items: [
        {
          revisionId: "revision-local-1",
          chunkId: "chunk-local-1",
          embedding: [0.1, 0.2, 0.3]
        }
      ]
    });
    expect(result.readyItemCount).toBe(1);
    expect(result.skippedEmbeddingCount).toBe(0);
  });

  it("keeps degraded batch embedding results usable when some items are ready", () => {
    const plan = buildPostgresRagBackfillEmbeddingPlan([
      localResult(),
      localResult({
        id: "rag-citation-local-2",
        citationId: "citation-local-2",
        revisionId: "revision-local-2",
        chunkId: "chunk-local-2"
      })
    ]);
    const result = buildPostgresRagBackfillRequest({
      plan,
      embeddingResult: embeddingResult({
        state: "degraded",
        items: [
          {
            id: "rag-citation-local-1",
            state: "ready",
            label: "Embedding ready",
            detail: "Embedding generated",
            embedding: [0.1, 0.2, 0.3],
            dimension: 3
          },
          {
            id: "rag-citation-local-2",
            state: "offline",
            label: "Embedding failed",
            detail: "Provider unavailable"
          }
        ]
      }),
      embeddingModel: "text-embedding-3-small",
      fallbackEmbeddingDim: 3
    });

    expect(result.request?.items).toHaveLength(1);
    expect(result.readyItemCount).toBe(1);
    expect(result.skippedEmbeddingCount).toBe(1);
  });

  it("summarizes skipped chunks in completion copy", () => {
    expect(formatPostgresRagBackfillCompletionMessage({
      detail: "1 embedding written",
      fallback: "Backfill completed",
      skippedDuplicateCount: 1,
      skippedBlankTextCount: 0,
      skippedEmbeddingCount: 2
    })).toBe("1 embedding written 3 chunks skipped.");
  });
});
