import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RunTrainingMemoryLoopResult } from "./postgres-memory-loop-service";

const runTrainingMemoryLoopWithRuntimeMock = vi.fn();

class MockTrainingMemoryLoopNotFoundError extends Error {}
class MockTrainingMemoryLoopArtifactError extends Error {}

vi.mock("./postgres-memory-loop-service", () => {
  return {
    TrainingMemoryLoopArtifactError: MockTrainingMemoryLoopArtifactError,
    TrainingMemoryLoopNotFoundError: MockTrainingMemoryLoopNotFoundError,
    runTrainingMemoryLoopWithRuntime: (...args: unknown[]) =>
      runTrainingMemoryLoopWithRuntimeMock(...args)
  };
});

const SESSION_TOKEN = "postgres-route-session";

const createRequest = (body: unknown, authorized = true): Request =>
  new Request("http://localhost/api/chem/postgres/memory/loop", {
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

const createResult = (): RunTrainingMemoryLoopResult => ({
  beforeRevisionId: "rev-before",
  afterRevisionId: "rev-after",
  records: {
    semanticDiff: {
      semanticDiffId: "diff-1",
      afterRevisionId: "rev-after",
      diff: {},
      quality: {}
    },
    trainingExperienceEvents: [{ eventId: "event-1" }],
    correctionPatterns: [],
    experimentPatternMemories: [],
    datasetProjections: []
  } as unknown as RunTrainingMemoryLoopResult["records"],
  correctionPatternAggregation: {
    recomputed: 0,
    deleted: 0,
    patternIds: []
  }
});

const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  await response.json() as Record<string, unknown>;

describe("POST /api/chem/postgres/memory/loop", () => {
  beforeEach(() => {
    runTrainingMemoryLoopWithRuntimeMock.mockReset();
    vi.resetModules();
  });

  it("requires a matching session token", async () => {
    const { POST } = await import("../../app/api/chem/postgres/memory/loop/route");
    const response = await POST(createRequest({
      afterRevisionId: "rev-after"
    }, false));

    expect(response.status).toBe(403);
    expect(runTrainingMemoryLoopWithRuntimeMock).not.toHaveBeenCalled();
  });

  it("runs the memory loop for accepted revisions", async () => {
    runTrainingMemoryLoopWithRuntimeMock.mockResolvedValueOnce(createResult());

    const { POST } = await import("../../app/api/chem/postgres/memory/loop/route");
    const response = await POST(createRequest({
      beforeRevisionId: " rev-before ",
      afterRevisionId: " rev-after "
    }));
    const body = await readJson(response);

    expect(response.status).toBe(201);
    expect(runTrainingMemoryLoopWithRuntimeMock).toHaveBeenCalledWith({
      beforeRevisionId: "rev-before",
      afterRevisionId: "rev-after"
    });
    expect(body).toMatchObject({
      beforeRevisionId: "rev-before",
      afterRevisionId: "rev-after",
      semanticDiffId: "diff-1",
      records: {
        trainingExperienceEvents: 1
      }
    });
  });

  it("masks unexpected runtime errors", async () => {
    runTrainingMemoryLoopWithRuntimeMock.mockRejectedValueOnce(new Error("select * from secret"));

    const { POST } = await import("../../app/api/chem/postgres/memory/loop/route");
    const response = await POST(createRequest({
      afterRevisionId: "rev-after"
    }));

    expect(response.status).toBe(502);
    expect(await readJson(response)).toMatchObject({
      code: "E_POSTGRES_MEMORY_LOOP",
      message: "postgres memory loop failed"
    });
  });
});
