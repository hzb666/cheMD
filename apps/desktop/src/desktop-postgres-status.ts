import type {
  ManagedPostgresMigrationState,
  ManagedPostgresStatus,
  PostgresMigrationReadiness,
  PostgresStatus
} from "./desktop-contracts";

export type PostgresReadinessId = "pgvector" | "coreSchema" | "migration";
export type PostgresReadinessTone = "success" | "warning" | "danger" | "muted";

export interface PostgresReadinessItem {
  id: PostgresReadinessId;
  label: string;
  state: PostgresMigrationReadiness;
  value: string;
  reason: string;
  tone: PostgresReadinessTone;
}

const EXPECTED_CORE_TABLE_COUNT = 11;

export const formatPostgresDisplayValue = (value: string | number | boolean | null): string => {
  if (value === null) return "unknown";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
};

export const readinessTone = (state: PostgresMigrationReadiness): PostgresReadinessTone => {
  if (state === "ready") return "success";
  if (state === "failed") return "danger";
  if (state === "pending") return "warning";
  return "muted";
};

const boolReadiness = ({
  id,
  label,
  value,
  falseState = "pending",
  readyReason,
  pendingReason,
  unknownReason
}: {
  id: PostgresReadinessId;
  label: string;
  value: boolean | null;
  falseState?: Exclude<PostgresMigrationReadiness, "ready" | "unknown">;
  readyReason: string;
  pendingReason: string;
  unknownReason: string;
}): PostgresReadinessItem => {
  const state = value === true ? "ready" : value === false ? falseState : "unknown";
  const reason = value === true ? readyReason : value === false ? pendingReason : unknownReason;
  return {
    id,
    label,
    state,
    value: formatPostgresDisplayValue(value),
    reason,
    tone: readinessTone(state)
  };
};

const normalizeManagedMigrationState = (
  status: ManagedPostgresStatus
): { state: PostgresMigrationReadiness; reason: string } => {
  if (!status.available) {
    return {
      state: "unknown",
      reason: status.reason ?? "Managed PostgreSQL binaries are unavailable"
    };
  }
  if (!status.configured) {
    return {
      state: "unknown",
      reason: "Managed Postgres is not initialized"
    };
  }
  const stateMap: Record<ManagedPostgresMigrationState, PostgresMigrationReadiness> = {
    not_initialized: "pending",
    pending: "pending",
    applied: "ready",
    failed: "failed"
  };
  const state = stateMap[status.migrationState];
  return {
    state,
    reason: state === "ready" ? "Managed migration state is applied" : status.detail
  };
};

export const buildExternalPostgresReadiness = (status: PostgresStatus): PostgresReadinessItem[] => {
  const unavailableReason = status.configured
    ? "Refresh external Postgres readiness to inspect this signal"
    : "Select an external Postgres target to inspect this signal";
  const schemaFalseState = status.migrationState === "failed" ? "failed" : "pending";
  return [
    boolReadiness({
      id: "pgvector",
      label: "pgvector installed",
      value: status.vectorInstalled,
      falseState: status.migrationState === "failed" ? "failed" : "pending",
      readyReason: "pgvector extension is installed",
      pendingReason: "Install pgvector before Graph/RAG persistence",
      unknownReason: unavailableReason
    }),
    boolReadiness({
      id: "coreSchema",
      label: "Core schema ready",
      value: status.schemaReady,
      falseState: schemaFalseState,
      readyReason: "All shared Graph/RAG tables are present",
      pendingReason: `${status.coreTablesFound ?? 0}/${EXPECTED_CORE_TABLE_COUNT} shared schema tables found`,
      unknownReason: unavailableReason
    }),
    {
      id: "migration",
      label: "Migration state",
      state: status.migrationState,
      value: status.migrationState,
      reason: status.migrationReason,
      tone: readinessTone(status.migrationState)
    }
  ];
};

export const buildManagedPostgresReadiness = (
  status: ManagedPostgresStatus,
  runtimeStatus: PostgresStatus
): PostgresReadinessItem[] => {
  const hasRuntimeProbe = runtimeStatus.configured && runtimeStatus.source?.startsWith("managed postgres:");
  const migration = normalizeManagedMigrationState(status);
  const unknownReason = hasRuntimeProbe
    ? "Managed runtime readiness has not reported this signal"
    : "Start managed Postgres and refresh runtime readiness to inspect this signal";
  const schemaFalseState = runtimeStatus.migrationState === "failed" ? "failed" : "pending";
  return [
    boolReadiness({
      id: "pgvector",
      label: "pgvector installed",
      value: hasRuntimeProbe ? runtimeStatus.vectorInstalled : null,
      falseState: runtimeStatus.migrationState === "failed" ? "failed" : "pending",
      readyReason: "Managed runtime reports pgvector installed",
      pendingReason: "Managed runtime needs pgvector before Graph/RAG persistence",
      unknownReason
    }),
    boolReadiness({
      id: "coreSchema",
      label: "Core schema ready",
      value: hasRuntimeProbe ? runtimeStatus.schemaReady : null,
      falseState: schemaFalseState,
      readyReason: "Managed runtime reports the shared schema is ready",
      pendingReason: `${runtimeStatus.coreTablesFound ?? 0}/${EXPECTED_CORE_TABLE_COUNT} shared schema tables found`,
      unknownReason
    }),
    {
      id: "migration",
      label: "Migration state",
      state: migration.state,
      value: migration.state,
      reason: migration.reason,
      tone: readinessTone(migration.state)
    }
  ];
};
