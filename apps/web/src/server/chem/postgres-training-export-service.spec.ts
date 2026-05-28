import { describe, expect, it } from "vitest";

import type { ChemdTrainingExportV3 } from "@chemd/exporter-training";

import type { PostgresQueryClient } from "./postgres-storage";
import {
  exportPostgresTraining,
  PostgresTrainingExportFilterError
} from "./postgres-training-export-service";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const trainingExport = {
  schema_version: "chemd-training-export/v0.3",
  document: {
    document_id: "exp-export",
    title: "Export",
    date: "2026-04-22"
  }
} as ChemdTrainingExportV3;

const createClient = (): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (sql.includes("latest_revision_artifacts")) {
        return {
          rows: [{
            revision_id: "rev-1",
            experiment_id: "exp-export",
            parent_revision_id: "rev-0",
            commit_sha: "abc123",
            created_at: "2026-04-22T00:00:00.000Z",
            compile_run_id: "run-1",
            compile_created_at: "2026-04-22T00:01:00.000Z",
            training_export: trainingExport
          }]
        };
      }
      if (sql.includes("FROM chemd_correction_patterns")) {
        return {
          rows: [{
            pattern_id: "correction::aggregate::abc",
            reaction_family: "cross_coupling",
            source_field: "catalyst",
            old_role: "Pd(PPh3)4",
            new_role: "Pd(dppf)Cl2",
            evidence_phrase_pattern: "catalyst: Pd(PPh3)4 -> Pd(dppf)Cl2",
            support_count: 3,
            confidence: 0.8,
            promoted_to_rule: false,
            training_uses: ["condition_recommendation"],
            quality_tier: "silver",
            updated_at: "2026-04-22T00:02:00.000Z"
          }]
        };
      }
      if (sql.includes("FROM chemd_experiment_pattern_memory")) {
        return {
          rows: [{
            experiment_pattern_id: "experiment-pattern::semantic-diff::rev-0::rev-1",
            pattern_scope: "revision_pair",
            reaction_family: "cross_coupling",
            mechanism_family: null,
            step_sequence_signature: "reaction_setup",
            canonical_roles: {},
            canonical_phase_roles: {},
            common_field_corrections: [],
            common_diagnostics: [],
            controlled_variables: [],
            high_value_variables: [],
            outcome_delta_patterns: [],
            failure_mode_patterns: [],
            evidence_event_ids: ["event-1"],
            support_count: 1,
            confidence: 0.75,
            training_uses: ["condition_recommendation"],
            promotion_targets: ["training_dataset"],
            quality_tier: "silver",
            updated_at: "2026-04-22T00:03:00.000Z"
          }]
        };
      }
      return { rows: [] };
    }
  };
};

const normalizedSql = (call: QueryCall): string =>
  call.sql.replace(/\s+/g, " ").trim();

describe("postgres training export service", () => {
  it("exports bounded training records and optional memory payloads", async () => {
    const client = createClient();

    const result = await exportPostgresTraining({
      client,
      experimentId: "exp-export",
      limit: 2,
      includeCorrectionPatterns: true,
      includeExperimentPatternMemory: true
    });

    const statements = client.calls.map(normalizedSql);
    expect(result).toMatchObject({
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
        commitSha: "abc123",
        compileRunId: "run-1",
        trainingExport
      }],
      correctionPatterns: [{
        patternId: "correction::aggregate::abc",
        supportCount: 3
      }],
      experimentPatternMemories: [{
        experimentPatternId: "experiment-pattern::semantic-diff::rev-0::rev-1",
        evidenceEventIds: ["event-1"]
      }]
    });
    expect(client.calls[0].values).toEqual(["exp-export", 2]);
    expect(statements[0]).toContain("r.experiment_id = $1");
    expect(statements[0]).toContain("c.status IN ('success', 'warning')");
    expect(statements[1]).toContain("d.after_revision_id = ANY($1::text[])");
    expect(statements[1]).toContain("e.event_type = 'condition_updated'");
    expect(statements[1]).toContain("COALESCE(NULLIF(p.reaction_family, ''), 'unknown')");
    expect(statements[1]).toContain("COALESCE(NULLIF(e.before_value->>'value', ''), 'missing')");
  });

  it("returns an empty bounded result without optional table reads", async () => {
    const calls: QueryCall[] = [];
    const client: PostgresQueryClient & { calls: QueryCall[] } = {
      calls,
      async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
        calls.push({ sql, values });
        return { rows: [] };
      }
    };

    const result = await exportPostgresTraining({
      client,
      revisionId: "missing-rev",
      includeCorrectionPatterns: true
    });

    expect(result).toMatchObject({
      count: 0,
      revisions: [],
      correctionPatterns: []
    });
    expect(client.calls).toHaveLength(1);
  });

  it("rejects unbounded or ambiguous filters", async () => {
    const client = createClient();

    await expect(exportPostgresTraining({ client })).rejects.toBeInstanceOf(
      PostgresTrainingExportFilterError
    );
    await expect(exportPostgresTraining({
      client,
      revisionId: "rev-1",
      experimentId: "exp-export"
    })).rejects.toBeInstanceOf(PostgresTrainingExportFilterError);
  });

  it("rejects invalid direct service limits before querying", async () => {
    const client = createClient();
    const baseInput = {
      client,
      revisionId: "rev-1"
    };

    await expect(exportPostgresTraining({
      ...baseInput,
      limit: 0
    })).rejects.toBeInstanceOf(PostgresTrainingExportFilterError);
    await expect(exportPostgresTraining({
      ...baseInput,
      limit: 101
    })).rejects.toBeInstanceOf(PostgresTrainingExportFilterError);
    await expect(exportPostgresTraining({
      ...baseInput,
      limit: 1.5
    })).rejects.toBeInstanceOf(PostgresTrainingExportFilterError);
    expect(client.calls).toHaveLength(0);
  });
});
