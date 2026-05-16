import { describe, expect, it } from "vitest";

import type { ManagedPostgresStatus, PostgresStatus } from "../../contracts";
import {
  buildExternalPostgresReadiness,
  buildManagedPostgresReadiness,
  formatPostgresDisplayValue
} from "./status";

const basePostgresStatus = (patch: Partial<PostgresStatus> = {}): PostgresStatus => ({
  state: "placeholder",
  label: "Postgres not configured",
  detail: "Set CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL to enable database checks",
  configured: false,
  source: null,
  host: null,
  database: null,
  user: null,
  ssl: "not configured",
  vectorInstalled: null,
  schemaReady: null,
  migrationState: "unknown",
  migrationReason: "No Postgres target is configured; Offline Core remains available",
  coreTablesFound: null,
  timeoutMs: 0,
  pool: null,
  ...patch
});

const baseManagedStatus = (patch: Partial<ManagedPostgresStatus> = {}): ManagedPostgresStatus => ({
  state: "placeholder",
  label: "Managed Postgres unchecked",
  detail: "Refresh managed Postgres status",
  available: false,
  reason: "Set CHEMD_MANAGED_POSTGRES_BIN_DIR",
  configured: false,
  source: null,
  dataDir: null,
  host: null,
  port: null,
  database: null,
  user: null,
  pid: null,
  startedAt: null,
  migrationState: "not_initialized",
  ...patch
});

describe("desktop Postgres status display mapping", () => {
  it("formats nullable Postgres readiness values without treating unknown as failed", () => {
    expect(formatPostgresDisplayValue(null)).toBe("unknown");
    expect(formatPostgresDisplayValue(true)).toBe("yes");
    expect(formatPostgresDisplayValue(false)).toBe("no");

    const readiness = buildExternalPostgresReadiness(basePostgresStatus());

    expect(readiness).toEqual([
      expect.objectContaining({ id: "pgvector", state: "unknown", tone: "muted" }),
      expect.objectContaining({ id: "coreSchema", state: "unknown", tone: "muted" }),
      expect.objectContaining({ id: "migration", state: "unknown", tone: "muted" })
    ]);
  });

  it("shows ready external pgvector, schema, and migration state separately", () => {
    const readiness = buildExternalPostgresReadiness(basePostgresStatus({
      state: "ready",
      configured: true,
      vectorInstalled: true,
      schemaReady: true,
      migrationState: "ready",
      migrationReason: "pgvector installed and all shared schema tables are present",
      coreTablesFound: 11
    }));

    expect(readiness.map((item) => [item.id, item.value, item.state])).toEqual([
      ["pgvector", "yes", "ready"],
      ["coreSchema", "yes", "ready"],
      ["migration", "ready", "ready"]
    ]);
  });

  it("maps partial external shared schema to failed without requiring DB access", () => {
    const readiness = buildExternalPostgresReadiness(basePostgresStatus({
      state: "degraded",
      configured: true,
      vectorInstalled: true,
      schemaReady: false,
      migrationState: "failed",
      migrationReason: "Shared schema is incomplete: 3/11 core tables found",
      coreTablesFound: 3
    }));

    expect(readiness).toContainEqual(expect.objectContaining({
      id: "coreSchema",
      state: "failed",
      reason: "3/11 shared schema tables found"
    }));
    expect(readiness).toContainEqual(expect.objectContaining({
      id: "migration",
      state: "failed",
      reason: "Shared schema is incomplete: 3/11 core tables found"
    }));
  });

  it("uses managed migration state but leaves runtime pgvector/schema unknown until probed", () => {
    const readiness = buildManagedPostgresReadiness(baseManagedStatus({
      available: true,
      configured: true,
      migrationState: "pending",
      detail: "Managed Postgres config is available"
    }), basePostgresStatus());

    expect(readiness).toEqual([
      expect.objectContaining({ id: "pgvector", state: "unknown" }),
      expect.objectContaining({ id: "coreSchema", state: "unknown" }),
      expect.objectContaining({ id: "migration", state: "pending" })
    ]);
  });
});
