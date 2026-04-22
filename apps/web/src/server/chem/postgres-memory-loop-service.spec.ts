import { describe, expect, it } from "vitest";

import { compileChemd } from "@chemd/compiler";
import type { ChemdTrainingUnderstandingV1 } from "@chemd/exporter-training";

import type { PostgresQueryClient } from "./postgres-storage";
import {
  runTrainingMemoryLoop,
  TrainingMemoryLoopNotFoundError
} from "./postgres-memory-loop-service";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

interface RevisionFixture {
  parentRevisionId?: string;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
}

const createSource = (input: {
  catalyst: string;
  yieldPercent: string;
}): string => `---
id: exp-memory-service
title: Memory Service
date: 2026-04-22
primary_reaction: rxn-main
primary_result: res-main
tags:
  - suzuki
---

:::chemd #aryl
kind: molecule
name: aryl bromide
smiles: Brc1ccccc1
:::

:::chemd #boron
kind: molecule
name: phenylboronic acid
smiles: OB(O)c1ccccc1
:::

:::chemd #product
kind: molecule
name: biphenyl
smiles: c1ccc(-c2ccccc2)cc1
:::

:::chemd #rxn-main
kind: reaction
name: Suzuki coupling
reactants: @aryl | @boron
products: @product
solvent: dioxane
catalyst: ${input.catalyst}
temperature: 80 C
yield: ${input.yieldPercent}
:::

:::result #res-main
reaction: @rxn-main
status: success
yield: ${input.yieldPercent}
:::
`;

const compileUnderstanding = (source: string): ChemdTrainingUnderstandingV1 =>
  compileChemd(source, { strictChemdKind: true }).trainingUnderstanding;

const createClient = (
  revisions: Record<string, RevisionFixture>
): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (sql.includes("FROM chemd_experiment_revisions")) {
        const revisionId = String(values?.[0] ?? "");
        const revision = revisions[revisionId];
        return {
          rows: revision
            ? [{
                revision_id: revisionId,
                parent_revision_id: revision.parentRevisionId,
                training_understanding: revision.trainingUnderstanding
              }]
            : []
        };
      }
      if (sql.includes("RETURNING pattern_id")) {
        return {
          rows: [{ pattern_id: "correction::aggregate::abc" }]
        };
      }
      return { rows: [], rowCount: 1 };
    }
  };
};

const normalizedSql = (call: QueryCall): string =>
  call.sql.replace(/\s+/g, " ").trim();

describe("postgres memory loop service", () => {
  it("builds and writes memory records using the parent revision by default", async () => {
    const before = compileUnderstanding(createSource({
      catalyst: "Pd(PPh3)4",
      yieldPercent: "35%"
    }));
    const after = compileUnderstanding(createSource({
      catalyst: "Pd(dppf)Cl2",
      yieldPercent: "72%"
    }));
    const client = createClient({
      "rev-before": { trainingUnderstanding: before },
      "rev-after": { parentRevisionId: "rev-before", trainingUnderstanding: after }
    });

    const result = await runTrainingMemoryLoop({
      client,
      afterRevisionId: "rev-after"
    });

    const statements = client.calls.map(normalizedSql);
    expect(result.beforeRevisionId).toBe("rev-before");
    expect(result.records.semanticDiff.semanticDiffId).toBe("semantic-diff::rev-before::rev-after");
    expect(result.correctionPatternAggregation.recomputed).toBe(1);
    expect(result.correctionPatternAggregation.deleted).toBe(1);
    expect(statements).toContain("BEGIN");
    expect(statements).toContain("COMMIT");
    expect(statements.some((sql) =>
      sql.includes("c.status IN ('success', 'warning')")
    )).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO chemd_semantic_diffs"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO chemd_training_experience_events"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO chemd_correction_patterns"))).toBe(true);
    expect(statements.some((sql) => sql.includes("COUNT(DISTINCT event_id)::integer AS support_count"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO chemd_experiment_pattern_memory"))).toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO chemd_dataset_projections"))).toBe(true);
  });

  it("fails when the requested after revision is missing", async () => {
    const client = createClient({});

    await expect(runTrainingMemoryLoop({
      client,
      afterRevisionId: "missing-rev"
    })).rejects.toBeInstanceOf(TrainingMemoryLoopNotFoundError);

    expect(client.calls.map(normalizedSql)).not.toContain("BEGIN");
  });
});
