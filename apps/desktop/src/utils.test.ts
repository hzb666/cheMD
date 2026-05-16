import { describe, expect, it } from "vitest";

import { createScratchFile } from "./features/workspace/scratch-file";
import {
  getLocalSnapshotDisabledReason,
  getPersistDisabledReason,
} from "./utils";

const readyPostgresStatus = {
  state: "ready",
  label: "Ready",
  detail: "Postgres ready",
  configured: true,
  source: "env",
  host: "localhost",
  database: "chemd",
  user: "chemd",
  ssl: "disable",
  vectorInstalled: true,
  schemaReady: true,
  migrationState: "ready",
  migrationReason: "ready",
  coreTablesFound: 1,
  timeoutMs: 1000,
  pool: null,
} as const;

describe("desktop disabled reasons", () => {
  it("requires untitled tabs to become workspace files before persistence", () => {
    const file = createScratchFile(1);

    expect(getPersistDisabledReason({
      mode: "workspace",
      file,
      postgresStatus: readyPostgresStatus,
      compileStatus: "ok",
    })).toBe("Save the untitled tab as a workspace file before persisting Graph/RAG records.");
    expect(getLocalSnapshotDisabledReason({
      mode: "workspace",
      file,
      compileStatus: "ok",
    })).toBe("Save the untitled tab as a workspace file before saving an offline snapshot.");
  });
});
