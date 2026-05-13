import { describe, expect, it, vi } from "vitest";

import type {
  ChemdReactionIntelligenceArtifactV1,
  ChemdReactionIntelligenceJobInputV1
} from "@chemd/reaction-map";

import type {
  DesktopCommandMap,
  LocalReactionIntelligenceArtifactEntry,
  SaveLocalReactionIntelligenceArtifactResult
} from "./desktop-contracts";
import { buildLocalReactionIntelligenceArtifactInput } from "./desktop-local-store";
import {
  createDesktopReactionIntelligenceJobController,
  toDesktopReactionIntelligenceWorkerResult,
  type DesktopReactionIntelligenceJobControllerDeps,
  type DesktopReactionIntelligenceWorkerResult
} from "./desktop-reaction-intelligence-job-controller";

const timestamp = "2026-05-13T10:00:00.000Z";

const job = (
  reactions: ChemdReactionIntelligenceJobInputV1["reactions"] = [{
    reaction_entity_id: "rxn-a",
    document_id: "doc-a",
    canonical_rxn_smiles: "CCO>>CC=O",
    participant_signature: "CCO to acetaldehyde",
    source_hash: "hash-rxn-a"
  }]
): ChemdReactionIntelligenceJobInputV1 => ({
  schema_version: "chemd-reaction-intelligence-job/v0.1",
  job_id: "job-local-1",
  graph_index_id: "graph-index-local-1",
  source_compile_run_ids: ["compile-local-1"],
  reactions,
  requested_providers: ["rdkit_fingerprint", "tmap_layout"],
  provider_policy: {
    missing_dependency: "skip",
    per_reaction_failure: "warn",
    allow_network: false
  }
});

const artifact = (
  artifactId = "artifact-local-1",
  edgeScore = 0.91
): ChemdReactionIntelligenceArtifactV1 => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: artifactId,
  job_id: "job-local-1",
  graph_index_id: "graph-index-local-1",
  generated_at: timestamp,
  providers: [{
    provider_id: "rdkit-local",
    kind: "rdkit_fingerprint",
    status: "PASS",
    warnings: []
  }],
  reaction_features: [{
    reaction_entity_id: "rxn-a",
    source_hash: "hash-rxn-a",
    canonical_rxn_smiles: "CCO>>CC=O",
    fingerprint_refs: [],
    warnings: []
  }],
  similarity_edges: [{
    edge_id: "edge-local-1",
    from_reaction_entity_id: "rxn-a",
    to_reaction_entity_id: "rxn-b",
    score: edgeScore,
    confidence: "high",
    basis: ["rdkit_fingerprint_tanimoto"],
    provider_ids: ["rdkit-local"],
    source_hashes: ["hash-rxn-a", "hash-rxn-b"],
    warnings: []
  }],
  warnings: []
});

const savedRecord = (
  inputArtifact = artifact()
): SaveLocalReactionIntelligenceArtifactResult => ({
  localId: buildLocalReactionIntelligenceArtifactInput(inputArtifact).localId,
  idempotencyKey: buildLocalReactionIntelligenceArtifactInput(inputArtifact).idempotencyKey,
  createdAt: inputArtifact.generated_at,
  artifactCount: 1
});

const entry = (
  inputArtifact = artifact()
): LocalReactionIntelligenceArtifactEntry => ({
  ...buildLocalReactionIntelligenceArtifactInput(inputArtifact),
  updatedAt: inputArtifact.generated_at
});

const deps = (
  workerResult: DesktopReactionIntelligenceWorkerResult
): DesktopReactionIntelligenceJobControllerDeps => ({
  runWorker: vi.fn(async () => workerResult),
  saveArtifact: vi.fn(async (input) => savedRecord(input.artifact)),
  readLatestArtifact: vi.fn(async () => ({
    state: "ready" as const,
    artifact: workerResult.status === "completed" && workerResult.artifact
      ? workerResult.artifact
      : artifact(),
    entry: entry(workerResult.status === "completed" && workerResult.artifact
      ? workerResult.artifact
      : artifact()),
    error: null
  })),
  now: vi.fn(() => timestamp)
});

describe("desktop reaction intelligence job controller", () => {
  it("starts idle and skips when no runnable job exists", async () => {
    const controllerDeps = deps({ status: "completed", artifact: artifact() });
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    expect(controller.getState().status).toBe("idle");
    const result = await controller.run({ job: null, workspaceId: "workspace-a" });

    expect(result.status).toBe("skipped");
    expect(result.message).toContain("No runnable");
    expect(controllerDeps.runWorker).not.toHaveBeenCalled();
    expect(controller.getState()).toBe(result);
  });

  it("skips jobs without reactions instead of inventing reaction data", async () => {
    const controllerDeps = deps({ status: "completed", artifact: artifact() });
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({ job: job([]) });

    expect(result.status).toBe("skipped");
    expect(controllerDeps.runWorker).not.toHaveBeenCalled();
  });

  it("saves a completed artifact and returns the latest local artifact first", async () => {
    const produced = artifact("artifact-produced", 0.88);
    const latest = artifact("artifact-latest", 0.97);
    const controllerDeps = deps({ status: "completed", artifact: produced });
    vi.mocked(controllerDeps.readLatestArtifact).mockResolvedValue({
      state: "ready",
      artifact: latest,
      entry: entry(latest),
      error: null
    });
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({
      job: job(),
      workspaceId: "workspace-a",
      sourceHash: "source-hash-a"
    });

    expect(result.status).toBe("completed");
    expect(result.artifactSummary).toMatchObject({
      artifactId: "artifact-latest",
      similarityEdgeCount: 1
    });
    expect(result.savedRecord).toMatchObject({ artifactCount: 1 });
    expect(result.latestArtifact?.state).toBe("ready");
    expect(controllerDeps.saveArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: produced })
    );
    expect(controllerDeps.readLatestArtifact).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      sourceHash: "source-hash-a",
      graphIndexId: "graph-index-local-1"
    });
  });

  it("returns failed when the worker reports a failure", async () => {
    const controllerDeps = deps({
      status: "failed",
      error: new Error("worker crashed with token=secret"),
      logTail: ["DATABASE_URL=postgres://user:secret@localhost:5432/chemd"]
    });
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({ job: job() });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("token=[redacted]");
    expect(result.logTail[0]).toContain("DATABASE_URL=[redacted]");
    expect(controllerDeps.saveArtifact).not.toHaveBeenCalled();
    expect(controllerDeps.readLatestArtifact).not.toHaveBeenCalled();
  });

  it("keeps worker skips as skipped state", async () => {
    const controllerDeps = deps({
      status: "skipped",
      reason: "rdkit_not_installed",
      logTail: ["provider skipped"]
    });
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({ job: job() });

    expect(result.status).toBe("skipped");
    expect(result.message).toBe("rdkit_not_installed");
    expect(result.logTail).toEqual(["provider skipped"]);
    expect(controllerDeps.saveArtifact).not.toHaveBeenCalled();
  });

  it("skips completed worker results that contain no artifact", async () => {
    const controllerDeps = deps({
      status: "completed",
      artifact: null,
      message: "no reactions survived filtering"
    });
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({ job: job() });

    expect(result.status).toBe("skipped");
    expect(result.message).toBe("no reactions survived filtering");
    expect(controllerDeps.saveArtifact).not.toHaveBeenCalled();
  });

  it("returns save_failed when local artifact persistence fails", async () => {
    const controllerDeps = deps({ status: "completed", artifact: artifact() });
    vi.mocked(controllerDeps.saveArtifact).mockRejectedValue(
      new Error("save failed with postgres://user:secret@localhost:5432/chemd")
    );
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({ job: job() });

    expect(result.status).toBe("save_failed");
    expect(result.error).toContain("[redacted database url]");
    expect(result.artifactSummary?.artifactId).toBe("artifact-local-1");
    expect(controllerDeps.readLatestArtifact).not.toHaveBeenCalled();
  });

  it("keeps save success when refreshing the latest artifact fails", async () => {
    const controllerDeps = deps({ status: "completed", artifact: artifact() });
    vi.mocked(controllerDeps.readLatestArtifact).mockRejectedValue(
      new Error("latest read failed")
    );
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const result = await controller.run({ job: job() });

    expect(result.status).toBe("completed");
    expect(result.message).toContain("refresh failed");
    expect(result.latestArtifact).toEqual({
      state: "failed",
      artifact: null,
      entry: null,
      error: "latest read failed"
    });
    expect(result.savedRecord).toMatchObject({ artifactCount: 1 });
  });

  it("guards concurrent runs while preserving the active running state", async () => {
    let resolveWorker: (value: DesktopReactionIntelligenceWorkerResult) => void = () => undefined;
    const workerPromise = new Promise<DesktopReactionIntelligenceWorkerResult>((resolve) => {
      resolveWorker = resolve;
    });
    const controllerDeps = deps({ status: "completed", artifact: artifact() });
    vi.mocked(controllerDeps.runWorker).mockReturnValue(workerPromise);
    const controller = createDesktopReactionIntelligenceJobController(controllerDeps);

    const firstRun = controller.run({ job: job(), graphIndexId: "graph-index-local-1" });
    const guarded = await controller.run({ job: job(), graphIndexId: "graph-index-local-1" });

    expect(guarded.status).toBe("skipped");
    expect(guarded.message).toContain("already running");
    expect(controller.getState().status).toBe("running");
    expect(controllerDeps.runWorker).toHaveBeenCalledTimes(1);

    resolveWorker({ status: "completed", artifact: artifact() });
    const completed = await firstRun;

    expect(completed.status).toBe("completed");
    expect(controller.getState()).toBe(completed);
  });

  it("maps Tauri worker command output into controller worker results", () => {
    const commandInput: DesktopCommandMap["run_reaction_intelligence_worker"]["input"] = {
      jobJson: job(),
      timeoutMs: 2_500
    };
    const mapped = toDesktopReactionIntelligenceWorkerResult({
      status: "completed",
      message: "done",
      reason: null,
      detail: null,
      artifactJson: artifact(),
      exitCode: 0,
      stdoutTail: ["stdout"],
      stderrTail: ["stderr"]
    });

    expect(commandInput.timeoutMs).toBe(2_500);
    expect(mapped).toMatchObject({
      status: "completed",
      artifact: expect.objectContaining({ artifact_id: "artifact-local-1" }),
      logTail: ["stdout", "stderr"]
    });
  });
});
