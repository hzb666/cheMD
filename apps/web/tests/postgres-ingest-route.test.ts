import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersistChemdExperimentResult } from "../src/server/chem/postgres-ingest-service";

const persistChemdExperimentWithRuntimeMock = vi.fn();

vi.mock("../src/server/chem/postgres-ingest-service", () => ({
  persistChemdExperimentWithRuntime: (...args: unknown[]) =>
    persistChemdExperimentWithRuntimeMock(...args)
}));

const SESSION_TOKEN = "postgres-route-session";

const createRequest = (body: unknown, authorized = true): Request =>
  new Request("http://localhost/api/chem/postgres/ingest", {
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

const createResult = (): PersistChemdExperimentResult => ({
  records: {
    experiment: {
      experimentId: "exp-postgres-route",
      title: "Postgres Route",
      experimentDate: "2026-04-22",
      tags: []
    },
    revision: {
      revisionId: "rev-route-1",
      experimentId: "exp-postgres-route",
      sourceKind: "chemd",
      rawSource: "source",
      createdAt: "2026-04-22T00:00:00.000Z"
    },
    compileRun: {
      compileRunId: "run-route-1",
      revisionId: "rev-route-1",
      compilerVersion: "test",
      status: "success",
      schemaVersions: {},
      diagnosticCounts: {
        info: 0,
        warning: 0,
        error: 0
      },
      createdAt: "2026-04-22T00:00:00.000Z"
    },
    compileArtifact: {
      compileRunId: "run-route-1",
      trainingExport: {} as PersistChemdExperimentResult["records"]["compileArtifact"]["trainingExport"],
      trainingUnderstanding: {} as PersistChemdExperimentResult["records"]["compileArtifact"]["trainingUnderstanding"],
      ragExport: {} as PersistChemdExperimentResult["records"]["compileArtifact"]["ragExport"]
    },
    semanticEntities: [{
      entityId: "mol-a",
      revisionId: "rev-route-1",
      entityType: "molecule",
      payload: {}
    }],
    semanticRelations: [{
      revisionId: "rev-route-1",
      relation_id: "rel-a",
      relation_type: "document_primary",
      from_entity_id: "exp-postgres-route",
      to_entity_id: "mol-a"
    }],
    fieldEvidence: [{
      revisionId: "rev-route-1",
      subject_entity_id: "res-main",
      field: "yield",
      value: "80%",
      value_node_id: "value-yield",
      evidence_entity_ids: [],
      source_relation_ids: []
    }],
    ragChunks: [{
      chunkId: "chunk-a",
      revisionId: "rev-route-1",
      experimentId: "exp-postgres-route",
      chunkType: "reaction_summary",
      sourceEntityIds: [],
      text: "chunk a",
      metadata: { date: "2026-04-22" }
    }, {
      chunkId: "chunk-b",
      revisionId: "rev-route-1",
      experimentId: "exp-postgres-route",
      chunkType: "result_notes",
      sourceEntityIds: [],
      text: "chunk b",
      metadata: { date: "2026-04-22" }
    }]
  },
  embeddings: [],
  schemaInstalled: true
});

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

describe("POST /api/chem/postgres/ingest", () => {
  beforeEach(() => {
    persistChemdExperimentWithRuntimeMock.mockReset();
    vi.resetModules();
  });

  it("requires a matching session token", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");
    const response = await POST(createRequest({
      source: "molecule mol-a {\n}",
      revisionId: "rev-route-1"
    }, false));

    expect(response.status).toBe(403);
    expect(persistChemdExperimentWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("persists accepted input through the runtime ingest service", async () => {
    persistChemdExperimentWithRuntimeMock.mockResolvedValueOnce(createResult());

    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");
    const response = await POST(createRequest({
      source: "  molecule mol-a {\n  name: \"ethanol\"\n}  ",
      revisionId: " rev-route-1 ",
      sourceKind: "chemd",
      sourceUri: " file:///exp.chemd ",
      parentRevisionId: " rev-parent ",
      commitSha: " abc123 ",
      createdAt: " 2026-04-22T00:00:00.000Z ",
      compileRunId: " run-route-1 ",
      compilerVersion: " test ",
      installSchema: true
    }));

    const body = await readJson(response);

    expect(response.status).toBe(201);
    expect(persistChemdExperimentWithRuntimeMock).toHaveBeenCalledWith({
      source: "  molecule mol-a {\n  name: \"ethanol\"\n}  ",
      revisionId: "rev-route-1",
      sourceKind: "chemd",
      sourceUri: "file:///exp.chemd",
      parentRevisionId: "rev-parent",
      commitSha: "abc123",
      createdAt: "2026-04-22T00:00:00.000Z",
      compileRunId: "run-route-1",
      compilerVersion: "test",
      installSchema: true
    });
    expect(body).toMatchObject({
      experimentId: "exp-postgres-route",
      revisionId: "rev-route-1",
      compileRunId: "run-route-1",
      schemaInstalled: true,
      embeddings: { count: 0 },
      records: {
        semanticEntities: 1,
        semanticRelations: 1,
        fieldEvidence: 1,
        ragChunks: 2
      }
    });
  });

  it("rejects invalid json bodies", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");
    const response = await POST(createRequest("{"));

    expect(response.status).toBe(400);
    expect(persistChemdExperimentWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("requires source and revisionId", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");
    const response = await POST(createRequest({
      source: "   "
    }));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({
      message: "source and revisionId are required"
    });
  });

  it("validates sourceKind and installSchema", async () => {
    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");

    const sourceKindResponse = await POST(createRequest({
      source: "molecule mol-a {\n}",
      revisionId: "rev-route-1",
      sourceKind: "spreadsheet"
    }));
    const installSchemaResponse = await POST(createRequest({
      source: "molecule mol-a {\n}",
      revisionId: "rev-route-1",
      installSchema: "true"
    }));

    expect(sourceKindResponse.status).toBe(400);
    expect(installSchemaResponse.status).toBe(400);
    expect(persistChemdExperimentWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("maps missing postgres config to a server configuration error", async () => {
    persistChemdExperimentWithRuntimeMock.mockRejectedValueOnce(
      new Error("CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required")
    );

    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");
    const response = await POST(createRequest({
      source: "molecule mol-a {\n}",
      revisionId: "rev-route-1"
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_CONFIG"
    });
  });

  it("maps persistence failures to upstream failures", async () => {
    persistChemdExperimentWithRuntimeMock.mockRejectedValueOnce(
      new Error("insert failed")
    );

    const { POST } = await import("../src/app/api/chem/postgres/ingest/route");
    const response = await POST(createRequest({
      source: "molecule mol-a {\n}",
      revisionId: "rev-route-1"
    }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_INGEST",
      message: "postgres ingest failed"
    });
  });
});
