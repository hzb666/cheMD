import { describe, expect, it } from "vitest";

import type { TrainingMemoryRecords } from "@chemd/storage-postgres";

import type { PostgresQueryClient } from "./postgres-storage";
import { writeTrainingMemoryRecords } from "./postgres-training-memory-storage";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const semanticDiffId = "semantic-diff::rev-before::rev-after";
const eventId = `event::${semanticDiffId}::condition::catalyst`;
const patternId = `correction::${eventId}`;
const experimentPatternId = `experiment-pattern::${semanticDiffId}`;
const datasetProjectionId = `dataset::${semanticDiffId}::training-task-dataset`;

const createClient = (): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      return { rows: [], rowCount: 1 };
    }
  };
};

const createRecords = (): TrainingMemoryRecords => ({
  semanticDiff: {
    semanticDiffId,
    beforeRevisionId: "rev-before",
    afterRevisionId: "rev-after",
    diff: { changed_variables: [] },
    quality: { quality_tier: "silver" }
  },
  trainingExperienceEvents: [{
    eventId,
    semanticDiffId,
    eventType: "condition_updated",
    reactionFamily: "cross_coupling",
    beforeValue: { field: "catalyst", value: "Pd(PPh3)4" },
    afterValue: { field: "catalyst", value: "Pd(dppf)Cl2" },
    evidence: { semantic_diff_id: semanticDiffId },
    trainingUses: ["condition_recommendation"],
    quality: { tier: "silver" }
  }],
  correctionPatterns: [{
    patternId,
    reactionFamily: "cross_coupling",
    sourceField: "catalyst",
    oldRole: "Pd(PPh3)4",
    newRole: "Pd(dppf)Cl2",
    evidencePhrasePattern: "catalyst: Pd(PPh3)4 -> Pd(dppf)Cl2",
    supportCount: 1,
    confidence: 0.7,
    promotedToRule: false,
    trainingUses: ["condition_recommendation"],
    qualityTier: "silver"
  }],
  experimentPatternMemories: [{
    experimentPatternId,
    patternScope: "revision_pair",
    reactionFamily: "cross_coupling",
    canonicalRoles: {},
    canonicalPhaseRoles: {},
    commonFieldCorrections: [],
    commonDiagnostics: [],
    controlledVariables: [],
    highValueVariables: [],
    outcomeDeltaPatterns: [],
    failureModePatterns: [],
    evidenceEventIds: [eventId],
    supportCount: 1,
    confidence: 0.8,
    trainingUses: ["condition_recommendation"],
    promotionTargets: ["training_dataset"],
    qualityTier: "silver"
  }],
  datasetProjections: [{
    datasetProjectionId,
    sourceKind: "training_memory_loop",
    sourceIds: [semanticDiffId, eventId],
    datasetType: "training_task_dataset",
    schemaVersion: "chemd-training-task-dataset/v0.1",
    payload: {} as TrainingMemoryRecords["datasetProjections"][number]["payload"],
    quality: { projection: "mvp" }
  }]
});

const normalizedSql = (call: QueryCall): string =>
  call.sql.replace(/\s+/g, " ").trim();

describe("postgres training memory storage", () => {
  it("reconciles stale rows and updates derived fields on conflict", async () => {
    const client = createClient();

    await writeTrainingMemoryRecords(client, createRecords());

    const statements = client.calls.map(normalizedSql);
    const correctionUpsert = statements.find((sql) =>
      sql.includes("INSERT INTO chemd_correction_patterns")
    );
    const memoryUpsert = statements.find((sql) =>
      sql.includes("INSERT INTO chemd_experiment_pattern_memory")
    );
    const projectionUpsert = statements.find((sql) =>
      sql.includes("INSERT INTO chemd_dataset_projections")
    );

    expect(statements[0]).toBe("BEGIN");
    expect(statements).toContain("COMMIT");
    expect(statements.some((sql) =>
      sql.includes("DELETE FROM chemd_correction_patterns")
    )).toBe(true);
    expect(statements.some((sql) =>
      sql.includes("DELETE FROM chemd_training_experience_events")
    )).toBe(true);
    expect(correctionUpsert).toContain("source_field = EXCLUDED.source_field");
    expect(correctionUpsert).toContain("evidence_phrase_pattern = EXCLUDED.evidence_phrase_pattern");
    expect(memoryUpsert).toContain("canonical_roles = EXCLUDED.canonical_roles");
    expect(memoryUpsert).toContain("evidence_event_ids = EXCLUDED.evidence_event_ids");
    expect(projectionUpsert).toContain("source_ids = EXCLUDED.source_ids");
  });
});
