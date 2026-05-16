import { describe, expect, it } from "vitest";

import type { PostgresProfileSummary, PostgresProfilesState } from "../../contracts";
import {
  buildPostgresProfileRows,
  buildPostgresProfileSaveInput,
  clearPostgresProfilePassword,
  createInitialPostgresProfileForm,
  createPostgresProfileFormFromProfile,
  toPostgresProfileCommandError
} from "./profiles";

const profile = (overrides: Partial<PostgresProfileSummary> = {}): PostgresProfileSummary => ({
  profileId: "remote-postgres",
  label: "Remote Postgres",
  host: "103.24.219.156",
  port: 5632,
  database: "postgres",
  user: "postgres",
  sslmode: "require",
  timeoutMs: 5000,
  pool: null,
  passwordSaved: true,
  active: true,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
  ...overrides
});

describe("desktop Postgres profile UI state", () => {
  it("starts with remote defaults and an empty password field", () => {
    const form = createInitialPostgresProfileForm();

    expect(form.host).toBe("103.24.219.156");
    expect(form.port).toBe("5632");
    expect(form.database).toBe("postgres");
    expect(form.user).toBe("postgres");
    expect(form.sslmode).toBe("require");
    expect(form.password).toBe("");
    expect(form.setActive).toBe(true);
  });

  it("builds trimmed save input without inventing a password", () => {
    const result = buildPostgresProfileSaveInput({
      ...createInitialPostgresProfileForm(),
      label: " Lab DB ",
      password: "",
      pool: " 4 "
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      label: "Lab DB",
      host: "103.24.219.156",
      port: 5632,
      database: "postgres",
      user: "postgres",
      password: undefined,
      sslmode: "require",
      timeoutMs: 5000,
      pool: "4",
      setActive: true
    });
  });

  it("clears password after save and never copies saved secrets into edit state", () => {
    const savedProfile = profile({ passwordSaved: true });
    const editForm = createPostgresProfileFormFromProfile(savedProfile);
    const cleared = clearPostgresProfilePassword({ ...editForm, password: "secret" });

    expect(editForm.password).toBe("");
    expect(cleared.password).toBe("");
    expect(editForm.profileId).toBe("remote-postgres");
  });

  it("rejects invalid numeric fields before invoking desktop commands", () => {
    const portResult = buildPostgresProfileSaveInput({
      ...createInitialPostgresProfileForm(),
      port: "abc"
    });
    const timeoutResult = buildPostgresProfileSaveInput({
      ...createInitialPostgresProfileForm(),
      timeoutMs: "0"
    });

    expect(portResult).toEqual({
      ok: false,
      message: "Postgres profile port must be a positive integer."
    });
    expect(timeoutResult).toEqual({
      ok: false,
      message: "Postgres profile timeoutMs must be a positive integer."
    });
  });

  it("builds rows that expose active and passwordSaved without password values", () => {
    const state: PostgresProfilesState = {
      activeProfileId: "backup",
      profiles: [
        profile({ profileId: "remote-postgres", active: false }),
        profile({
          profileId: "backup",
          label: "Backup",
          active: false,
          passwordSaved: false,
          pool: "8"
        })
      ]
    };

    expect(buildPostgresProfileRows(state)).toEqual([
      expect.objectContaining({
        profileId: "remote-postgres",
        target: "103.24.219.156:5632",
        userDatabase: "postgres@postgres",
        passwordSaved: true,
        active: false,
        pool: "default"
      }),
      expect.objectContaining({
        profileId: "backup",
        label: "Backup",
        passwordSaved: false,
        active: true,
        pool: "8"
      })
    ]);
  });

  it("redacts structured command errors for profile failures", () => {
    const error = toPostgresProfileCommandError("save", {
      code: "postgres_profile_secret_storage_failed",
      message: "password=hunter2 failed for postgresql://postgres:hunter2@db/postgres",
      detail: "database_url=postgresql://postgres:hunter2@db/postgres"
    }, "Profile save failed");

    expect(error).toEqual({
      operation: "save",
      code: "postgres_profile_secret_storage_failed",
      message: "password=[redacted] failed for postgres://[redacted]",
      detail: "database_url=[redacted]"
    });
  });
});
