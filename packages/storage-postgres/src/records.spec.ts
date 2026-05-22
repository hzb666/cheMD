import { describe, expect, it } from "vitest";

import { compileChemd } from "@chemd/compiler";

import {
  buildExperimentStorageRecords,
  getStoragePostgresSchemaSql,
  storagePostgresMigrations
} from ".";

const source = `---
id: exp-storage
title: Storage mapping
date: 2026-04-22
primary_result: res-main
---

:::chemd #mol-a
kind: molecule
name: ethanol
smiles: CCO
:::

:::chemd #mol-product
kind: molecule
name: product
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactant: @mol-a | 1 mmol | 1 eq | limiting=true
product: @mol-product
solvent: THF
temperature: 25 C
yield: 81%
:::

:::result #res-main
reaction: @rxn-main
status: success
yield: 81%
:::

:::sample #sample-main
ref: res-main
name: final product
artifacts: spec-main
:::

:::artifact #spec-main
kind: nmr_spectrum
ref: res-main
path: data/spec-main.pdf
:::
`;

describe("PostgreSQL storage records", () => {
  it("maps compiled Chemd outputs into revision-scoped storage records", () => {
    const compiled = compileChemd(source);
    const records = buildExperimentStorageRecords({
      revisionId: "rev-1",
      source,
      commitSha: "abc123",
      createdAt: "2026-04-22T00:00:00.000Z",
      trainingExport: compiled.trainingExport,
      trainingUnderstanding: compiled.trainingUnderstanding,
      ragExport: compiled.ragExport,
      lnf: compiled.lnf
    });

    expect(records.experiment).toMatchObject({
      experimentId: "exp-storage",
      title: "Storage mapping",
      primaryResultId: "res-main"
    });
    expect(records.revision).toMatchObject({
      revisionId: "rev-1",
      experimentId: "exp-storage",
      sourceKind: "chemd",
      commitSha: "abc123"
    });
    expect(records.compileRun.status).toBe("success");
    expect(records.compileRun.diagnosticCounts.error).toBe(0);
    expect(records.compileArtifact.trainingExport.schema_version).toBe("chemd-training-export/v0.2");
    expect(records.compileArtifact.trainingUnderstanding.schema_version).toBe(
      "chemd-training-understanding/v0.1"
    );
  });

  it("extracts semantic facts, field evidence, and RAG chunks", () => {
    const compiled = compileChemd(source);
    const records = buildExperimentStorageRecords({
      revisionId: "rev-1",
      source,
      trainingExport: compiled.trainingExport,
      trainingUnderstanding: compiled.trainingUnderstanding,
      ragExport: compiled.ragExport
    });

    expect(records.semanticEntities.some((entity) => entity.entityType === "reaction")).toBe(true);
    expect(records.semanticEntities.some((entity) => entity.entityType === "artifact")).toBe(true);
    expect(records.semanticRelations.some((relation) =>
      relation.relation_type === "result_describes_reaction"
    )).toBe(true);
    expect(records.fieldEvidence.some((evidence) => evidence.field === "yield_percent")).toBe(true);
    expect(records.ragChunks.length).toBeGreaterThan(0);
    expect(records.ragChunks[0]).toMatchObject({
      revisionId: "rev-1",
      experimentId: "exp-storage"
    });
  });
});

describe("PostgreSQL storage schema", () => {
  it("exports a versioned SQL migration with pgvector and training memory tables", () => {
    const sql = getStoragePostgresSchemaSql();

    expect(storagePostgresMigrations[0]?.id).toBe("0001_chemd_storage_core");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_rag_chunk_embeddings");
    expect(sql).toContain("PRIMARY KEY (revision_id, chunk_id)");
    expect(sql).toContain("PRIMARY KEY (revision_id, chunk_id, embedding_model)");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_training_experience_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_experiment_pattern_memory");
    expect(sql).toContain("chemd_training_events_condition_pattern_idx");
    expect(sql).toContain("chemd_training_events_semantic_diff_idx");
  });
});
