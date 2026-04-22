import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";
import type { JsonRecord } from "@chemd/storage-postgres";

import {
  PostgresTrainingExportArtifactError,
  PostgresTrainingExportFilterError,
  type ExportPostgresTrainingInput
} from "./postgres-training-export-model";

interface RowsResult<Row> {
  rows: Row[];
}

export const readRows = <Row>(result: unknown): Row[] => {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray((result as { rows?: unknown }).rows)
  ) {
    throw new TypeError("Postgres query result must include rows");
  }
  return (result as RowsResult<Row>).rows;
};

export const parseJsonValue = (value: unknown): unknown =>
  typeof value === "string" ? JSON.parse(value) as unknown : value;

export const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
};

export const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const requireDateString = (value: unknown, field: string): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return requireString(value, field);
};

export const readNumber = (value: unknown, field: string): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new TypeError(`${field} must be a number`);
  }
  return numeric;
};

export const readOptionalNumber = (
  value: unknown,
  field: string
): number | undefined =>
  value === null || value === undefined ? undefined : readNumber(value, field);

export const requireBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw new TypeError(`${field} must be a boolean`);
  }
  return value;
};

export const readStringArray = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${field} must be a string array`);
  }
  return value;
};

export const readJsonRecord = (value: unknown, field: string): JsonRecord => {
  const parsed = parseJsonValue(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${field} must be a JSON object`);
  }
  return parsed as JsonRecord;
};

export const readJsonRecordArray = (
  value: unknown,
  field: string
): JsonRecord[] => {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${field} must be a JSON array`);
  }
  return parsed as JsonRecord[];
};

const isTrainingExport = (value: unknown): value is ChemdTrainingExportV2 =>
  typeof value === "object" &&
  value !== null &&
  (value as { schema_version?: unknown }).schema_version === "chemd-training-export/v0.2";

export const requireTrainingExport = (
  revisionId: string,
  value: unknown
): ChemdTrainingExportV2 => {
  const parsed = parseJsonValue(value);
  if (!isTrainingExport(parsed)) {
    throw new PostgresTrainingExportArtifactError(revisionId);
  }
  return parsed;
};

export const readFilter = (
  input: ExportPostgresTrainingInput
): { column: "r.revision_id" | "r.experiment_id"; value: string } => {
  if (input.revisionId && input.experimentId) {
    throw new PostgresTrainingExportFilterError("provide exactly one of revisionId or experimentId");
  }
  if (input.revisionId) {
    return { column: "r.revision_id", value: input.revisionId };
  }
  if (input.experimentId) {
    return { column: "r.experiment_id", value: input.experimentId };
  }
  throw new PostgresTrainingExportFilterError("revisionId or experimentId is required");
};
