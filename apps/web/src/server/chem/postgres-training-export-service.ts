import {
  createPostgresRuntimeClient,
  type PostgresRuntimeClient
} from "./postgres-client";
import {
  type ExportPostgresTrainingInput,
  type ExportPostgresTrainingResult,
  type ExportPostgresTrainingWithRuntimeInput
} from "./postgres-training-export-model";
import {
  normalizeTrainingExportLimit,
  readCorrectionPatterns,
  readExperimentPatternMemories,
  readTrainingRevisions
} from "./postgres-training-export-readers";

export type {
  ExportPostgresTrainingInput,
  ExportPostgresTrainingResult,
  ExportPostgresTrainingWithRuntimeInput,
  PostgresCorrectionPatternExport,
  PostgresExperimentPatternMemoryExport,
  PostgresTrainingRevisionExport
} from "./postgres-training-export-model";
export {
  DEFAULT_TRAINING_EXPORT_LIMIT,
  MAX_TRAINING_EXPORT_LIMIT,
  PostgresTrainingExportArtifactError,
  PostgresTrainingExportFilterError
} from "./postgres-training-export-model";

export const exportPostgresTraining = async (
  input: ExportPostgresTrainingInput
): Promise<ExportPostgresTrainingResult> => {
  const revisions = await readTrainingRevisions(input.client, input);
  const revisionIds = revisions.map((revision) => revision.revisionId);
  const includeCorrectionPatterns = input.includeCorrectionPatterns === true;
  const includeExperimentPatternMemory = input.includeExperimentPatternMemory === true;

  return {
    filters: {
      experimentId: input.experimentId,
      revisionId: input.revisionId,
      limit: normalizeTrainingExportLimit(input.limit),
      includeCorrectionPatterns,
      includeExperimentPatternMemory
    },
    count: revisions.length,
    revisions,
    ...(includeCorrectionPatterns
      ? { correctionPatterns: await readCorrectionPatterns(input.client, revisionIds) }
      : {}),
    ...(includeExperimentPatternMemory
      ? { experimentPatternMemories: await readExperimentPatternMemories(input.client, revisionIds) }
      : {})
  };
};

export const exportPostgresTrainingWithRuntime = async (
  input: ExportPostgresTrainingWithRuntimeInput
): Promise<ExportPostgresTrainingResult> => {
  const { runtime, ...exportInput } = input;
  const client: PostgresRuntimeClient = createPostgresRuntimeClient(runtime);
  try {
    return await exportPostgresTraining({
      ...exportInput,
      client
    });
  } finally {
    await client.close();
  }
};
