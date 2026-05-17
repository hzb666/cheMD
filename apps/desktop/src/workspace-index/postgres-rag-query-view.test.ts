import { describe, expect, it } from "vitest";

import type {
  PostgresRagQueryResult,
  PostgresRagQueryResultItem,
  RuntimeJsonObject
} from "../contracts";
import {
  buildPostgresRagQueryView,
  sanitizePostgresRagQueryDetail
} from "./postgres-rag-query-view";

const sourceRange = (
  overrides: RuntimeJsonObject = {}
): RuntimeJsonObject => ({
  startLine: 8,
  startColumn: 1,
  endLine: 10,
  endColumn: 20,
  ...overrides
});

const queryItem = (
  overrides: Partial<PostgresRagQueryResultItem> = {}
): PostgresRagQueryResultItem => ({
  chunkId: "chunk-query-1",
  revisionId: "revision-query-1",
  experimentId: "experiment-query-1",
  chunkType: "block",
  sourceEntityIds: ["rxn::query::1"],
  text: "Connected Postgres evidence about solvent selection.",
  metadata: { score: 0.91 },
  distance: 0.12,
  citation: {
    locator: "citation-query-1 L8-L10",
    sourceRange: sourceRange(),
    citation: {
      citationId: "citation-query-1",
      documentUri: "chemd-workspace://workspace/experiments/query.chemd"
    },
    quality: { score: 0.87 },
    sourceUri: "chemd-workspace://workspace/experiments/query.chemd",
    entityId: "rxn::query::1",
    blockId: "rxn-query-1"
  },
  ...overrides
});

const queryResult = (
  overrides: Partial<PostgresRagQueryResult> = {}
): PostgresRagQueryResult => ({
  state: "ready",
  label: "Postgres RAG ready",
  detail: "2 chunks indexed",
  results: [queryItem()],
  blockedCount: 0,
  target: null,
  ...overrides
});

describe("desktop Postgres RAG query view adapter", () => {
  it("maps a ready command result into connected RAG rows", () => {
    const view = buildPostgresRagQueryView(queryResult());

    expect(view.summary).toMatchObject({
      state: "ready",
      label: "Postgres RAG ready",
      detail: "2 chunks indexed",
      blockedCount: 0,
      disabled: false,
      degraded: false,
      adapter: {
        blockedCount: 0,
        reasons: {}
      }
    });
    expect(view.connectedRows).toEqual([
      expect.objectContaining({
        rowId: "citation-query-1",
        citationId: "citation-query-1",
        revisionId: "revision-query-1",
        chunkId: "chunk-query-1",
        sourceRange: sourceRange(),
        documentPath: "chemd-workspace://workspace/experiments/query.chemd",
        documentUri: "chemd-workspace://workspace/experiments/query.chemd",
        sourceUri: "chemd-workspace://workspace/experiments/query.chemd",
        text: "Connected Postgres evidence about solvent selection.",
        score: 0.91,
        distance: 0.12
      })
    ]);
  });

  it("blocks query rows that are missing citation id or source range", () => {
    const view = buildPostgresRagQueryView(queryResult({
      results: [
        queryItem({
          chunkId: "chunk-missing-citation",
          citation: {
            ...queryItem().citation,
            citation: { id: "" }
          }
        }),
        queryItem({
          chunkId: "chunk-missing-range",
          citation: {
            ...queryItem().citation,
            sourceRange: { start: 1, end: 5 }
          }
        })
      ]
    }));

    expect(view.connectedRows).toEqual([]);
    expect(view.summary).toMatchObject({
      blockedCount: 2,
      adapter: {
        blockedCount: 2,
        reasons: {
          missing_citation_id: 1,
          missing_source_range: 1
        },
        items: [
          {
            rowId: "chunk-missing-citation",
            chunkId: "chunk-missing-citation",
            revisionId: "revision-query-1",
            reasons: ["missing_citation_id"]
          },
          {
            rowId: "citation-query-1",
            chunkId: "chunk-missing-range",
            revisionId: "revision-query-1",
            reasons: ["missing_source_range"]
          }
        ]
      }
    });
    expect(view.summary.message).toContain("2 Postgres RAG result(s)");
  });

  it("returns offline and degraded summaries without throwing", () => {
    expect(() =>
      buildPostgresRagQueryView(queryResult({
        state: "offline",
        label: "Postgres offline",
        detail: "database is not running",
        results: [],
        blockedCount: 1
      }))
    ).not.toThrow();

    const degraded = buildPostgresRagQueryView(queryResult({
      state: "degraded",
      label: "Postgres degraded",
      detail: "pgvector extension is unavailable",
      results: [],
      blockedCount: 0
    }));

    expect(degraded.summary).toMatchObject({
      state: "degraded",
      disabled: false,
      degraded: true,
      message: "Postgres RAG is degraded: pgvector extension is unavailable"
    });

    const offline = buildPostgresRagQueryView(queryResult({
      state: "offline",
      label: "Postgres offline",
      detail: "database is not running",
      results: [],
      blockedCount: 1
    }));
    expect(offline.summary).toMatchObject({
      state: "offline",
      blockedCount: 1,
      disabled: true,
      degraded: false,
      message: "Postgres RAG is offline: database is not running"
    });
  });

  it("sanitizes sensitive command detail through helper or injected sanitizer", () => {
    const unsafeDetail = "postgres://chemd:secret-password@127.0.0.1:5432/chemd password=secret";

    expect(sanitizePostgresRagQueryDetail(unsafeDetail)).toBe(
      "postgres://chemd:***@127.0.0.1:5432/chemd password=***"
    );

    const view = buildPostgresRagQueryView(queryResult({
      detail: unsafeDetail,
      results: []
    }), {
      sanitizeDetail: (detail) => sanitizePostgresRagQueryDetail(detail)
    });

    expect(view.summary.detail).not.toContain("secret-password");
    expect(view.summary.message).not.toContain("secret-password");
    expect(view.summary.detail).toContain("***");
  });
});
