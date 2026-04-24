import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExportPostgresTrainingResult } from "./postgres-training-export-service";

const exportPostgresTrainingWithRuntimeMock = vi.fn();

vi.mock("./postgres-training-export-service", async () => {
  const actual = await vi.importActual<typeof import("./postgres-training-export-service")>(
    "./postgres-training-export-service"
  );
  return {
    ...actual,
    exportPostgresTrainingWithRuntime: (...args: unknown[]) =>
      exportPostgresTrainingWithRuntimeMock(...args)
  };
});

const SESSION_TOKEN = "postgres-route-session";

const createRequest = (body: unknown, authorized = true): Request =>
  new Request("http://localhost/api/chem/postgres/training/export", {
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

const createResult = (): ExportPostgresTrainingResult => ({
  filters: {
    experimentId: "exp-export",
    limit: 2,
    includeCorrectionPatterns: true,
    includeExperimentPatternMemory: true
  },
  count: 1,
  revisions: [{
    revisionId: "rev-1",
    experimentId: "exp-export",
    createdAt: "2026-04-22T00:00:00.000Z",
    compileRunId: "run-1",
    compileCreatedAt: "2026-04-22T00:01:00.000Z",
    trainingExport: {
      schema_version: "chemd-training-export/v0.2"
    } as ExportPostgresTrainingResult["revisions"][number]["trainingExport"]
  }],
  correctionPatterns: [{
    patternId: "correction::aggregate::abc",
    supportCount: 2,
    promotedToRule: false,
    trainingUses: ["condition_recommendation"],
    updatedAt: "2026-04-22T00:02:00.000Z"
  }],
  experimentPatternMemories: []
});

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

describe("POST /api/chem/postgres/training/export", () => {
  beforeEach(() => {
    exportPostgresTrainingWithRuntimeMock.mockReset();
    vi.resetModules();
  });

  it("requires a matching session token", async () => {
    const { POST } = await import("../../app/api/chem/postgres/training/export/route");
    const response = await POST(createRequest({
      revisionId: "rev-1"
    }, false));

    expect(response.status).toBe(403);
    expect(exportPostgresTrainingWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("exports training records with accepted bounded filters", async () => {
    exportPostgresTrainingWithRuntimeMock.mockResolvedValueOnce(createResult());

    const { POST } = await import("../../app/api/chem/postgres/training/export/route");
    const response = await POST(createRequest({
      experimentId: " exp-export ",
      limit: 2,
      includeCorrectionPatterns: true,
      includeExperimentPatternMemory: true
    }));

    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(exportPostgresTrainingWithRuntimeMock).toHaveBeenCalledWith({
      experimentId: "exp-export",
      revisionId: undefined,
      limit: 2,
      includeCorrectionPatterns: true,
      includeExperimentPatternMemory: true
    });
    expect(body).toMatchObject({
      count: 1,
      revisions: [{ revisionId: "rev-1" }],
      correctionPatterns: [{ patternId: "correction::aggregate::abc" }]
    });
  });

  it("rejects unbounded and ambiguous export requests", async () => {
    const { POST } = await import("../../app/api/chem/postgres/training/export/route");
    const unboundedResponse = await POST(createRequest({}));
    const ambiguousResponse = await POST(createRequest({
      experimentId: "exp-export",
      revisionId: "rev-1"
    }));

    expect(unboundedResponse.status).toBe(400);
    expect(await readJson(unboundedResponse)).toMatchObject({
      message: "revisionId or experimentId is required"
    });
    expect(ambiguousResponse.status).toBe(400);
    expect(exportPostgresTrainingWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("validates limit and export options", async () => {
    const { POST } = await import("../../app/api/chem/postgres/training/export/route");
    const limitResponse = await POST(createRequest({
      revisionId: "rev-1",
      limit: 101
    }));
    const optionResponse = await POST(createRequest({
      revisionId: "rev-1",
      includeCorrectionPatterns: "yes"
    }));

    expect(limitResponse.status).toBe(400);
    expect(optionResponse.status).toBe(400);
    expect(exportPostgresTrainingWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("maps missing postgres config to a server configuration error", async () => {
    exportPostgresTrainingWithRuntimeMock.mockRejectedValueOnce(
      new Error("CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required")
    );

    const { POST } = await import("../../app/api/chem/postgres/training/export/route");
    const response = await POST(createRequest({
      revisionId: "rev-1"
    }));

    expect(response.status).toBe(500);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_CONFIG"
    });
  });

  it("maps export failures to upstream failures", async () => {
    exportPostgresTrainingWithRuntimeMock.mockRejectedValueOnce(
      new Error("select failed")
    );

    const { POST } = await import("../../app/api/chem/postgres/training/export/route");
    const response = await POST(createRequest({
      revisionId: "rev-1"
    }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_TRAINING_EXPORT",
      message: "postgres training export failed"
    });
  });
});
