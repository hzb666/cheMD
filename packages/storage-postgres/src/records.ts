import type {
  BuildExperimentStorageInput,
  CompileArtifactRecord,
  CompileRunRecord,
  ExperimentRecord,
  ExperimentRevisionRecord,
  ExperimentStorageRecords,
  FieldEvidenceRecord,
  JsonRecord,
  RagChunkRecord,
  SemanticEntityRecord,
  SemanticEntityType,
  SemanticRelationRecord
} from "./types";

const DEFAULT_COMPILER_VERSION = "chemd-storage-contract/v0.1";

const toJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : { value };

const buildExperimentRecord = (input: BuildExperimentStorageInput): ExperimentRecord => {
  const document = input.trainingExport.document;
  return {
    experimentId: document.document_id,
    title: document.title,
    experimentDate: document.date,
    tags: document.tags ?? [],
    primaryMoleculeId: document.primary_molecule_id,
    primaryReactionId: document.primary_reaction_id,
    primaryResultId: document.primary_result_id,
    primaryAnalysisId: document.primary_analysis_id,
    primarySampleId: document.primary_sample_id
  };
};

const buildRevisionRecord = (input: BuildExperimentStorageInput): ExperimentRevisionRecord => ({
  revisionId: input.revisionId,
  experimentId: input.trainingExport.document.document_id,
  parentRevisionId: input.parentRevisionId,
  sourceKind: input.sourceKind ?? "chemd",
  rawSource: input.source,
  sourceHash: input.trainingExport.document.source_hash,
  sourceUri: input.sourceUri ?? input.trainingExport.document.source_uri,
  commitSha: input.commitSha,
  createdAt: input.createdAt ?? input.trainingExport.exported_at
});

const buildCompileRunRecord = (input: BuildExperimentStorageInput): CompileRunRecord => {
  const quality = input.trainingExport.quality_layer.parse_quality;
  return {
    compileRunId: input.compileRunId ?? `${input.revisionId}::compile`,
    revisionId: input.revisionId,
    compilerVersion: input.compilerVersion ?? DEFAULT_COMPILER_VERSION,
    status: quality.has_errors ? "error" : quality.diagnostic_counts.warning > 0 ? "warning" : "success",
    schemaVersions: {
      training_export: input.trainingExport.schema_version,
      training_understanding: input.trainingUnderstanding.schema_version,
      rag_export: input.ragExport.schema_version,
      lnf: input.lnf?.schemaVersion
    },
    diagnosticCounts: quality.diagnostic_counts,
    createdAt: input.createdAt ?? input.trainingExport.exported_at
  };
};

const buildCompileArtifactRecord = (
  input: BuildExperimentStorageInput,
  compileRunId: string
): CompileArtifactRecord => ({
  compileRunId,
  trainingExport: input.trainingExport,
  trainingUnderstanding: input.trainingUnderstanding,
  ragExport: input.ragExport,
  lnf: input.lnf
});

const mapEntityGroup = (
  revisionId: string,
  entityType: SemanticEntityType,
  values: unknown[]
): SemanticEntityRecord[] =>
  values.map((value) => {
    const payload = toJsonRecord(value);
    return {
      entityId: String(payload.entity_id),
      revisionId,
      entityType,
      originalId: typeof payload.original_id === "string" ? payload.original_id : undefined,
      payload
    };
  });

const buildSemanticEntityRecords = (input: BuildExperimentStorageInput): SemanticEntityRecord[] => {
  const entities = input.trainingUnderstanding.entities;
  return [
    ...mapEntityGroup(input.revisionId, "molecule", entities.molecules),
    ...mapEntityGroup(input.revisionId, "reaction", entities.reactions),
    ...mapEntityGroup(input.revisionId, "result", entities.results),
    ...mapEntityGroup(input.revisionId, "analysis", entities.analyses),
    ...mapEntityGroup(input.revisionId, "sample", entities.samples),
    ...mapEntityGroup(input.revisionId, "artifact", entities.artifacts),
    ...mapEntityGroup(input.revisionId, "narrative", entities.narrative_blocks)
  ];
};

const buildRelationRecords = (input: BuildExperimentStorageInput): SemanticRelationRecord[] =>
  input.trainingUnderstanding.relations.map((relation) => ({
    ...relation,
    revisionId: input.revisionId
  }));

const buildFieldEvidenceRecords = (input: BuildExperimentStorageInput): FieldEvidenceRecord[] =>
  input.trainingUnderstanding.knowledge_graph.field_evidence.map((evidence) => ({
    ...evidence,
    revisionId: input.revisionId
  }));

const buildRagChunkRecords = (input: BuildExperimentStorageInput): RagChunkRecord[] =>
  input.ragExport.chunks.map((chunk) => ({
    chunkId: chunk.chunk_id,
    revisionId: input.revisionId,
    experimentId: chunk.experiment_id,
    chunkType: chunk.chunk_type,
    sourceEntityIds: chunk.source_entity_ids,
    text: chunk.text,
    metadata: chunk.metadata
  }));

export const buildExperimentStorageRecords = (
  input: BuildExperimentStorageInput
): ExperimentStorageRecords => {
  const compileRun = buildCompileRunRecord(input);
  return {
    experiment: buildExperimentRecord(input),
    revision: buildRevisionRecord(input),
    compileRun,
    compileArtifact: buildCompileArtifactRecord(input, compileRun.compileRunId),
    semanticEntities: buildSemanticEntityRecords(input),
    semanticRelations: buildRelationRecords(input),
    fieldEvidence: buildFieldEvidenceRecords(input),
    ragChunks: buildRagChunkRecords(input)
  };
};
