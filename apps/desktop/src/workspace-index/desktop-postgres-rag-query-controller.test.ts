import { describe, expect, it } from "vitest";
import type { EditorGraphRagSourceRange } from "@chemd/language-service";

import type {
  PostgresRagQueryResult,
  PostgresRagQueryResultItem,
  PostgresStatus,
  RuntimeJsonObject
} from "../desktop-contracts";
import type { DesktopWorkspaceRagResult } from "./desktop-rag-citation-gate";
import {
  buildDesktopPostgresRagQueryControllerState,
  buildDesktopPostgresRagQueryReadiness
} from "./desktop-postgres-rag-query-controller";

const range = (startLine: number, endLine = startLine): EditorGraphRagSourceRange => ({
  startLine,
  startColumn: 1,
  endLine,
  endColumn: 20
});

const sourceRangeJson = (
  overrides: RuntimeJsonObject = {}
): RuntimeJsonObject => ({
  startLine: 8,
  startColumn: 1,
  endLine: 10,
  endColumn: 20,
  ...overrides
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

const baseInput = (
  patch: Partial<Parameters<typeof buildDesktopPostgresRagQueryReadiness>[0]> = {}
): Parameters<typeof buildDesktopPostgresRagQueryReadiness>[0] => ({
  mode: "workspace",
  query: "solvent selection",
  postgresStatus: postgresStatus(),
  embedding: {
    providerAvailable: true,
    vector: [0.1, 0.2, 0.3],
    model: "text-embedding-3-small"
  },
  runnerAvailable: true,
  ...patch
});

const localResult = (
  patch: Partial<DesktopWorkspaceRagResult> = {}
): DesktopWorkspaceRagResult => ({
  id: "rag-citation-local-1",
  citationId: "citation-local-1",
  revisionId: "revision-local-1",
  chunkId: "chunk-local-1",
  sourceRange: range(3),
  documentPath: "experiments/local.chemd.md",
  documentUri: "chemd-workspace://workspace/experiments/local.chemd.md",
  label: "Local evidence about reaction yield.",
  detail: "experiments/local.chemd.md citation-local-1 L3",
  locator: "citation-local-1 L3",
  ...patch
});

const queryItem = (
  patch: Partial<PostgresRagQueryResultItem> = {}
): PostgresRagQueryResultItem => ({
  chunkId: "chunk-connected-1",
  revisionId: "revision-connected-1",
  experimentId: "experiment-connected-1",
  chunkType: "block",
  sourceEntityIds: ["rxn::connected::1"],
  text: "Connected Postgres evidence about solvent selection.",
  metadata: { score: 0.91 },
  distance: 0.12,
  citation: {
    locator: "citation-connected-1 L8-L10",
    sourceRange: sourceRangeJson(),
    citation: {
      citationId: "citation-connected-1",
      documentUri: "chemd-workspace://workspace/experiments/connected.chemd.md"
    },
    quality: { score: 0.87 },
    sourceUri: "chemd-workspace://workspace/experiments/connected.chemd.md",
    entityId: "rxn::connected::1",
    blockId: "rxn-connected-1"
  },
  ...patch
});

const queryResult = (
  patch: Partial<PostgresRagQueryResult> = {}
): PostgresRagQueryResult => ({
  state: "ready",
  label: "Postgres RAG ready",
  detail: "1 chunk matched",
  results: [queryItem()],
  blockedCount: 0,
  target: null,
  ...patch
});

describe("desktop Postgres RAG query controller", () => {
  it.each([
    ["not_workspace_mode", baseInput({ mode: "sample" })],
    ["empty_query", baseInput({ query: "   " })],
    ["postgres_not_configured", baseInput({
      postgresStatus: postgresStatus({ configured: false })
    })],
    ["postgres_not_ready", baseInput({
      postgresStatus: postgresStatus({ state: "degraded" })
    })],
    ["pgvector_not_ready", baseInput({
      postgresStatus: postgresStatus({ vectorInstalled: false })
    })],
    ["schema_not_ready", baseInput({
      postgresStatus: postgresStatus({
        schemaReady: false,
        migrationState: "pending"
      })
    })],
    ["embedding_unavailable", baseInput({
      embedding: { providerAvailable: false, vector: null, model: null }
    })],
    ["runner_unavailable", baseInput({ runnerAvailable: false })]
  ] as const)("reports %s as a disabled reason", (reason, input) => {
    const readiness = buildDesktopPostgresRagQueryReadiness(input);

    expect(readiness.disabled).toBe(true);
    expect(readiness.disabledReasons).toContain(reason);
    expect(readiness.message).toBeTruthy();
  });

  it("builds a query request only when every readiness gate is satisfied", () => {
    const state = buildDesktopPostgresRagQueryControllerState({
      ...baseInput({ query: "  solvent evidence  " }),
      workspaceId: "workspace-1",
      documentId: "document-1",
      revisionId: "revision-1",
      limit: 6
    });

    expect(state).toMatchObject({
      state: "ready",
      disabled: false,
      degraded: false,
      query: "solvent evidence"
    });
    expect(state.request).toEqual({
      query: "solvent evidence",
      embedding: [0.1, 0.2, 0.3],
      embeddingModel: "text-embedding-3-small",
      workspaceId: "workspace-1",
      documentId: "document-1",
      revisionId: "revision-1",
      limit: 6
    });
  });

  it("can be ready to run before a query embedding vector exists", () => {
    const state = buildDesktopPostgresRagQueryControllerState(baseInput({
      embedding: {
        providerAvailable: true,
        vector: null,
        model: "text-embedding-3-small"
      }
    }));

    expect(state).toMatchObject({
      state: "ready",
      disabled: false,
      degraded: false
    });
    expect(state.request).toBeNull();
    expect(state.message).toBe("Connected RAG query is ready.");
  });

  it("merges ready connected command results with local citation-backed results", () => {
    const state = buildDesktopPostgresRagQueryControllerState({
      ...baseInput(),
      localResults: [localResult()],
      commandResult: queryResult()
    });

    expect(state.commandView?.summary).toMatchObject({
      state: "ready",
      disabled: false,
      degraded: false
    });
    expect(state.merged.results.map((result) => [
      result.source,
      result.citationId
    ])).toEqual([
      ["connected", "citation-connected-1"],
      ["local", "citation-local-1"]
    ]);
  });

  it("keeps connected rows without citation id or source range out of merged results", () => {
    const state = buildDesktopPostgresRagQueryControllerState({
      ...baseInput(),
      localResults: [localResult()],
      commandResult: queryResult({
        results: [
          queryItem({
            chunkId: "chunk-missing-citation",
            citation: {
              ...queryItem().citation,
              citation: { citationId: "" }
            }
          }),
          queryItem({
            chunkId: "chunk-missing-range",
            citation: {
              ...queryItem().citation,
              sourceRange: { start: 1, end: 5 }
            }
          }),
          queryItem()
        ]
      })
    });

    expect(state.state).toBe("degraded");
    expect(state.commandView?.connectedRows).toHaveLength(1);
    expect(state.commandView?.summary.adapter).toMatchObject({
      blockedCount: 2,
      reasons: {
        missing_citation_id: 1,
        missing_source_range: 1
      }
    });
    expect(state.merged.results.map((result) => result.chunkId)).toEqual([
      "chunk-connected-1",
      "chunk-local-1"
    ]);
  });

  it("treats offline command results as degraded runtime state, not product failure", () => {
    const state = buildDesktopPostgresRagQueryControllerState({
      ...baseInput(),
      localResults: [localResult()],
      commandResult: queryResult({
        state: "offline",
        label: "Postgres RAG offline",
        detail: "database connection timed out",
        results: [],
        blockedCount: 0
      })
    });

    expect(state).toMatchObject({
      state: "degraded",
      disabled: false,
      degraded: true
    });
    expect(state.message).toBe("Postgres RAG is offline: database connection timed out");
    expect(state.merged.results).toEqual([
      expect.objectContaining({
        source: "local",
        citationId: "citation-local-1"
      })
    ]);
  });
});
