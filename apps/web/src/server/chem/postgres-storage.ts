import { compileChemd, type CompileOptions } from "@chemd/compiler";
import {
  buildExperimentStorageRecords,
  getStoragePostgresSchemaSql,
  type BuildExperimentStorageInput,
  type ExperimentStorageRecords,
  type FieldEvidenceRecord,
  type RagChunkRecord,
  type SemanticEntityRecord,
  type SemanticRelationRecord
} from "@chemd/storage-postgres";

export interface PostgresQueryClient {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
}

export interface SaveCompiledExperimentInput {
  client: PostgresQueryClient;
  source: string;
  revisionId: string;
  sourceKind?: BuildExperimentStorageInput["sourceKind"];
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  compileOptions?: CompileOptions;
}

export const installChemdStorageSchema = async (client: PostgresQueryClient): Promise<void> => {
  await client.query(getStoragePostgresSchemaSql());
};

const jsonParam = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

const withTransaction = async <T>(
  client: PostgresQueryClient,
  operation: () => Promise<T>
): Promise<T> => {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const upsertExperiment = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
): Promise<void> => {
  const experiment = records.experiment;
  await client.query(
    `INSERT INTO chemd_experiments (
      experiment_id, title, experiment_date, tags, primary_molecule_id,
      primary_reaction_id, primary_result_id, primary_analysis_id, primary_sample_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (experiment_id) DO UPDATE SET
      title = EXCLUDED.title,
      experiment_date = EXCLUDED.experiment_date,
      tags = EXCLUDED.tags,
      primary_molecule_id = EXCLUDED.primary_molecule_id,
      primary_reaction_id = EXCLUDED.primary_reaction_id,
      primary_result_id = EXCLUDED.primary_result_id,
      primary_analysis_id = EXCLUDED.primary_analysis_id,
      primary_sample_id = EXCLUDED.primary_sample_id,
      updated_at = now()`,
    [
      experiment.experimentId,
      experiment.title,
      experiment.experimentDate,
      experiment.tags,
      experiment.primaryMoleculeId,
      experiment.primaryReactionId,
      experiment.primaryResultId,
      experiment.primaryAnalysisId,
      experiment.primarySampleId
    ]
  );
};

const insertRevision = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
): Promise<void> => {
  const revision = records.revision;
  await client.query(
    `INSERT INTO chemd_experiment_revisions (
      revision_id, experiment_id, parent_revision_id, source_kind,
      raw_source, source_hash, source_uri, commit_sha, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (revision_id) DO NOTHING`,
    [
      revision.revisionId,
      revision.experimentId,
      revision.parentRevisionId,
      revision.sourceKind,
      revision.rawSource,
      revision.sourceHash,
      revision.sourceUri,
      revision.commitSha,
      revision.createdAt
    ]
  );
};

const insertCompileRun = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
): Promise<void> => {
  const compileRun = records.compileRun;
  await client.query(
    `INSERT INTO chemd_compile_runs (
      compile_run_id, revision_id, compiler_version, status,
      schema_versions, diagnostic_counts, created_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)
    ON CONFLICT (compile_run_id) DO NOTHING`,
    [
      compileRun.compileRunId,
      compileRun.revisionId,
      compileRun.compilerVersion,
      compileRun.status,
      jsonParam(compileRun.schemaVersions),
      jsonParam(compileRun.diagnosticCounts),
      compileRun.createdAt
    ]
  );
};

const insertCompileArtifact = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
): Promise<void> => {
  const artifact = records.compileArtifact;
  await client.query(
    `INSERT INTO chemd_compile_artifacts (
      compile_run_id, training_export, training_understanding, rag_export, lnf
    ) VALUES ($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb)
    ON CONFLICT (compile_run_id) DO UPDATE SET
      training_export = EXCLUDED.training_export,
      training_understanding = EXCLUDED.training_understanding,
      rag_export = EXCLUDED.rag_export,
      lnf = EXCLUDED.lnf`,
    [
      artifact.compileRunId,
      jsonParam(artifact.trainingExport),
      jsonParam(artifact.trainingUnderstanding),
      jsonParam(artifact.ragExport),
      jsonParam(artifact.lnf)
    ]
  );
};

const insertSemanticEntity = async (
  client: PostgresQueryClient,
  entity: SemanticEntityRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_semantic_entities (
      revision_id, entity_id, entity_type, original_id, payload
    ) VALUES ($1,$2,$3,$4,$5::jsonb)
    ON CONFLICT (revision_id, entity_id) DO UPDATE SET
      entity_type = EXCLUDED.entity_type,
      original_id = EXCLUDED.original_id,
      payload = EXCLUDED.payload`,
    [entity.revisionId, entity.entityId, entity.entityType, entity.originalId, jsonParam(entity.payload)]
  );
};

const insertSemanticRelation = async (
  client: PostgresQueryClient,
  relation: SemanticRelationRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_semantic_relations (
      revision_id, relation_id, relation_type, from_entity_id, to_entity_id, role, confidence
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (revision_id, relation_id) DO NOTHING`,
    [
      relation.revisionId,
      relation.relation_id,
      relation.relation_type,
      relation.from_entity_id,
      relation.to_entity_id,
      relation.role,
      relation.confidence
    ]
  );
};

const insertFieldEvidence = async (
  client: PostgresQueryClient,
  evidence: FieldEvidenceRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_field_evidence (
      revision_id, subject_entity_id, field, value, raw_value, value_node_id,
      raw_value_node_id, normalized, evidence_entity_ids, source_relation_ids
    ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)`,
    [
      evidence.revisionId,
      evidence.subject_entity_id,
      evidence.field,
      jsonParam(evidence.value),
      evidence.raw_value,
      evidence.value_node_id,
      evidence.raw_value_node_id,
      evidence.normalized,
      evidence.evidence_entity_ids,
      evidence.source_relation_ids
    ]
  );
};

const insertRagChunk = async (
  client: PostgresQueryClient,
  chunk: RagChunkRecord
): Promise<void> => {
  await client.query(
    `INSERT INTO chemd_rag_chunks (
      chunk_id, revision_id, experiment_id, chunk_type, source_entity_ids, text, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    ON CONFLICT (chunk_id) DO UPDATE SET
      text = EXCLUDED.text,
      metadata = EXCLUDED.metadata`,
    [
      chunk.chunkId,
      chunk.revisionId,
      chunk.experimentId,
      chunk.chunkType,
      chunk.sourceEntityIds,
      chunk.text,
      jsonParam(chunk.metadata)
    ]
  );
};

const insertRecordGroups = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
): Promise<void> => {
  for (const entity of records.semanticEntities) {
    await insertSemanticEntity(client, entity);
  }
  for (const relation of records.semanticRelations) {
    await insertSemanticRelation(client, relation);
  }
  for (const evidence of records.fieldEvidence) {
    await insertFieldEvidence(client, evidence);
  }
  for (const chunk of records.ragChunks) {
    await insertRagChunk(client, chunk);
  }
};

export const writeExperimentStorageRecords = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
): Promise<void> => {
  await withTransaction(client, async () => {
    await upsertExperiment(client, records);
    await insertRevision(client, records);
    await insertCompileRun(client, records);
    await insertCompileArtifact(client, records);
    await insertRecordGroups(client, records);
  });
};

export const saveCompiledExperiment = async (
  input: SaveCompiledExperimentInput
): Promise<ExperimentStorageRecords> => {
  const compiled = compileChemd(input.source, {
    strictChemdKind: true,
    ...input.compileOptions
  });
  const records = buildExperimentStorageRecords({
    revisionId: input.revisionId,
    source: input.source,
    sourceKind: input.sourceKind,
    sourceUri: input.sourceUri,
    parentRevisionId: input.parentRevisionId,
    commitSha: input.commitSha,
    createdAt: input.createdAt,
    compileRunId: input.compileRunId,
    compilerVersion: input.compilerVersion,
    trainingExport: compiled.trainingExport,
    trainingUnderstanding: compiled.trainingUnderstanding,
    ragExport: compiled.ragExport,
    lnf: compiled.lnf
  });

  await writeExperimentStorageRecords(input.client, records);
  return records;
};
