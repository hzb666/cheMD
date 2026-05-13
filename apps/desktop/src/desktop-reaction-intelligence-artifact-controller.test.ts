import { describe, expect, it } from "vitest";

import type { ChemdReactionIntelligenceArtifactV1 } from "@chemd/reaction-map";

import type { LocalReactionIntelligenceArtifactEntry } from "./desktop-contracts";
import { buildLocalReactionIntelligenceArtifactInput } from "./desktop-local-store";
import {
  buildListLocalReactionIntelligenceArtifactsInput,
  readLatestLocalReactionIntelligenceArtifact,
  selectLatestLocalReactionIntelligenceArtifactEntry
} from "./desktop-reaction-intelligence-artifact-controller";

const artifact = (
  artifactId: string,
  generatedAt: string
): ChemdReactionIntelligenceArtifactV1 => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: artifactId,
  job_id: `job-${artifactId}`,
  graph_index_id: "graph-index-local-1",
  generated_at: generatedAt,
  providers: [{
    provider_id: "rdkit-local",
    kind: "rdkit_fingerprint",
    status: "PASS",
    warnings: []
  }],
  reaction_features: [],
  similarity_edges: [{
    edge_id: `edge-${artifactId}`,
    from_reaction_entity_id: "rxn-a",
    to_reaction_entity_id: "rxn-b",
    score: 0.91,
    confidence: "high",
    basis: ["rdkit_fingerprint_tanimoto"],
    provider_ids: ["rdkit-local"],
    source_hashes: ["hash-a", "hash-b"],
    warnings: []
  }],
  warnings: []
});

const entry = (
  artifactId: string,
  createdAt: string,
  updatedAt = createdAt
): LocalReactionIntelligenceArtifactEntry => ({
  ...buildLocalReactionIntelligenceArtifactInput(artifact(artifactId, createdAt)),
  updatedAt
});

describe("desktop reaction intelligence artifact controller", () => {
  it("builds a latest-artifact command input with optional graph index filtering", () => {
    expect(buildListLocalReactionIntelligenceArtifactsInput()).toEqual({ limit: 1 });
    expect(buildListLocalReactionIntelligenceArtifactsInput(" graph-index-local-1 ")).toEqual({
      graphIndexId: "graph-index-local-1",
      limit: 1
    });
  });

  it("selects the newest local artifact entry by update time", () => {
    const older = entry("artifact-old", "2026-05-13T08:00:00.000Z");
    const newer = entry(
      "artifact-new",
      "2026-05-13T07:00:00.000Z",
      "2026-05-13T09:00:00.000Z"
    );

    expect(selectLatestLocalReactionIntelligenceArtifactEntry([older, newer])).toBe(newer);
  });

  it("returns null artifact state for empty local artifact lists", async () => {
    const result = await readLatestLocalReactionIntelligenceArtifact({
      listArtifacts: async () => []
    });

    expect(result).toEqual({
      state: "empty",
      artifact: null,
      entry: null,
      error: null
    });
  });

  it("degrades to null artifact state when the desktop command fails", async () => {
    const result = await readLatestLocalReactionIntelligenceArtifact({
      listArtifacts: () => Promise.reject({
        code: "command_missing",
        message: "DATABASE_URL=postgres://user:secret@localhost:5432/chemd unavailable"
      })
    });

    expect(result.state).toBe("failed");
    expect(result.artifact).toBeNull();
    expect(result.entry).toBeNull();
    expect(result.error).toContain("DATABASE_URL=[redacted]");
    expect(result.error).not.toContain("secret@localhost");
  });

  it("passes through the stored artifact object without reshaping it", async () => {
    const latest = entry("artifact-latest", "2026-05-13T09:00:00.000Z");
    const result = await readLatestLocalReactionIntelligenceArtifact({
      listArtifacts: async () => [latest]
    });

    expect(result.state).toBe("ready");
    expect(result.artifact).toBe(latest.artifact);
    expect(result.entry).toBe(latest);
  });
});
