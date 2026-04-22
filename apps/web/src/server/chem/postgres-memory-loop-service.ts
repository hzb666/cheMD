import {
  buildTrainingMemoryRecords,
  type TrainingMemoryRecords
} from "@chemd/storage-postgres";
import type { ChemdTrainingUnderstandingV1 } from "@chemd/exporter-training";

import {
  createPostgresRuntimeClient,
  type CreatePostgresRuntimeClientOptions,
  type PostgresRuntimeClient
} from "./postgres-client";
import {
  recomputeCorrectionPatterns,
  type RecomputeCorrectionPatternsResult
} from "./postgres-correction-pattern-aggregation";
import type { PostgresQueryClient } from "./postgres-storage";
import { writeTrainingMemoryRecords } from "./postgres-training-memory-storage";

export class TrainingMemoryLoopNotFoundError extends Error {
  constructor(readonly revisionId: string) {
    super(`revision not found: ${revisionId}`);
    this.name = "TrainingMemoryLoopNotFoundError";
  }
}

export class TrainingMemoryLoopArtifactError extends Error {
  constructor(readonly revisionId: string) {
    super(`revision has no valid training understanding artifact: ${revisionId}`);
    this.name = "TrainingMemoryLoopArtifactError";
  }
}

export interface RunTrainingMemoryLoopInput {
  client: PostgresQueryClient;
  afterRevisionId: string;
  beforeRevisionId?: string;
}

export interface RunTrainingMemoryLoopWithRuntimeInput
  extends Omit<RunTrainingMemoryLoopInput, "client"> {
  runtime?: CreatePostgresRuntimeClientOptions;
}

export interface RunTrainingMemoryLoopResult {
  beforeRevisionId?: string;
  afterRevisionId: string;
  records: TrainingMemoryRecords;
  correctionPatternAggregation: RecomputeCorrectionPatternsResult;
}

interface RowsResult<Row> {
  rows: Row[];
}

interface RevisionArtifactRow {
  revision_id: unknown;
  parent_revision_id: unknown;
  training_understanding: unknown;
}

interface RevisionArtifact {
  revisionId: string;
  parentRevisionId?: string;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
}

const readRows = <Row>(result: unknown): Row[] => {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray((result as { rows?: unknown }).rows)
  ) {
    throw new TypeError("Postgres query result must include rows");
  }
  return (result as RowsResult<Row>).rows;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const parseJsonValue = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  return JSON.parse(value) as unknown;
};

const isTrainingUnderstanding = (
  value: unknown
): value is ChemdTrainingUnderstandingV1 =>
  typeof value === "object" &&
  value !== null &&
  (value as { schema_version?: unknown }).schema_version === "chemd-training-understanding/v0.1";

const requireTrainingUnderstanding = (
  revisionId: string,
  value: unknown
): ChemdTrainingUnderstandingV1 => {
  const parsed = parseJsonValue(value);
  if (!isTrainingUnderstanding(parsed)) {
    throw new TrainingMemoryLoopArtifactError(revisionId);
  }
  return parsed;
};

const mapRevisionArtifact = (row: RevisionArtifactRow): RevisionArtifact => {
  const revisionId = requireString(row.revision_id, "revision_id");
  return {
    revisionId,
    parentRevisionId: readOptionalString(row.parent_revision_id),
    trainingUnderstanding: requireTrainingUnderstanding(revisionId, row.training_understanding)
  };
};

const readRevisionArtifact = async (
  client: PostgresQueryClient,
  revisionId: string
): Promise<RevisionArtifact> => {
  const result = await client.query(
    `SELECT
      r.revision_id,
      r.parent_revision_id,
      a.training_understanding
    FROM chemd_experiment_revisions r
    JOIN chemd_compile_runs c ON c.revision_id = r.revision_id
    JOIN chemd_compile_artifacts a ON a.compile_run_id = c.compile_run_id
    WHERE r.revision_id = $1
      AND c.status IN ('success', 'warning')
    ORDER BY c.created_at DESC, c.compile_run_id DESC
    LIMIT 1`,
    [revisionId]
  );
  const row = readRows<RevisionArtifactRow>(result)[0];
  if (!row) {
    throw new TrainingMemoryLoopNotFoundError(revisionId);
  }
  return mapRevisionArtifact(row);
};

export const runTrainingMemoryLoop = async (
  input: RunTrainingMemoryLoopInput
): Promise<RunTrainingMemoryLoopResult> => {
  const after = await readRevisionArtifact(input.client, input.afterRevisionId);
  const beforeId = input.beforeRevisionId ?? after.parentRevisionId;
  const before = beforeId
    ? await readRevisionArtifact(input.client, beforeId)
    : undefined;
  const records = buildTrainingMemoryRecords({
    beforeRevisionId: before?.revisionId,
    afterRevisionId: after.revisionId,
    beforeUnderstanding: before?.trainingUnderstanding,
    afterUnderstanding: after.trainingUnderstanding
  });

  await writeTrainingMemoryRecords(input.client, records);
  const correctionPatternAggregation = await recomputeCorrectionPatterns(input.client);

  return {
    beforeRevisionId: before?.revisionId,
    afterRevisionId: after.revisionId,
    records,
    correctionPatternAggregation
  };
};

export const runTrainingMemoryLoopWithRuntime = async (
  input: RunTrainingMemoryLoopWithRuntimeInput
): Promise<RunTrainingMemoryLoopResult> => {
  const { runtime, ...loopInput } = input;
  const client: PostgresRuntimeClient = createPostgresRuntimeClient(runtime);
  try {
    return await runTrainingMemoryLoop({
      ...loopInput,
      client
    });
  } finally {
    await client.close();
  }
};
