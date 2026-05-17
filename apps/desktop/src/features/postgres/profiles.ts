import type {
  CommandError,
  PostgresProfileSummary,
  PostgresProfilesState,
  SavePostgresProfileInput
} from "../../contracts";

export type PostgresProfileOperation = "list" | "save" | "activate" | "delete" | "bind";

export type PostgresProfileForm = {
  profileId: string | null;
  label: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  sslmode: string;
  timeoutMs: string;
  pool: string;
  setActive: boolean;
};

export type PostgresProfileRow = {
  profileId: string;
  label: string;
  target: string;
  userDatabase: string;
  sslmode: string;
  timeout: string;
  pool: string;
  passwordSaved: boolean;
  active: boolean;
  updatedAt: string;
};

export type PostgresProfileCommandError = {
  operation: PostgresProfileOperation;
  code: string;
  message: string;
  detail: string | null;
};

type SaveInputBuildResult =
  | { ok: true; input: SavePostgresProfileInput }
  | { ok: false; message: string };

export const initialPostgresProfilesState: PostgresProfilesState = {
  activeProfileId: null,
  workspaceProfileBindings: {},
  profiles: []
};

export const createInitialPostgresProfileForm = (): PostgresProfileForm => ({
  profileId: null,
  label: "Remote Postgres",
  host: "103.24.219.156",
  port: "5632",
  database: "postgres",
  user: "postgres",
  password: "",
  sslmode: "require",
  timeoutMs: "5000",
  pool: "",
  setActive: true
});

export const createPostgresProfileFormFromProfile = (
  profile: PostgresProfileSummary
): PostgresProfileForm => ({
  profileId: profile.profileId,
  label: profile.label,
  host: profile.host,
  port: String(profile.port),
  database: profile.database,
  user: profile.user,
  password: "",
  sslmode: profile.sslmode,
  timeoutMs: String(profile.timeoutMs),
  pool: profile.pool ?? "",
  setActive: profile.active
});

export const clearPostgresProfilePassword = (
  form: PostgresProfileForm
): PostgresProfileForm => ({
  ...form,
  password: ""
});

export const buildPostgresProfileSaveInput = (
  form: PostgresProfileForm
): SaveInputBuildResult => {
  const label = form.label.trim();
  const host = form.host.trim();
  const database = form.database.trim();
  const user = form.user.trim();
  const sslmode = form.sslmode.trim();
  const pool = form.pool.trim();
  const port = parsePositiveInteger(form.port, "port");
  const timeoutMs = parseOptionalPositiveInteger(form.timeoutMs, "timeoutMs");

  if (!label) return { ok: false, message: "Postgres profile label is required." };
  if (!host) return { ok: false, message: "Postgres profile host is required." };
  if (!database) return { ok: false, message: "Postgres profile database is required." };
  if (!user) return { ok: false, message: "Postgres profile user is required." };
  if (!port.ok) return { ok: false, message: port.message };
  if (!timeoutMs.ok) return { ok: false, message: timeoutMs.message };

  return {
    ok: true,
    input: {
      profileId: form.profileId ?? undefined,
      label,
      host,
      port: port.value,
      database,
      user,
      password: form.password.trim() || undefined,
      sslmode: sslmode || undefined,
      timeoutMs: timeoutMs.value,
      pool: pool || undefined,
      setActive: form.setActive
    }
  };
};

export const buildPostgresProfileRows = (
  state: PostgresProfilesState
): PostgresProfileRow[] =>
  state.profiles.map((profile) => ({
    profileId: profile.profileId,
    label: profile.label,
    target: `${profile.host}:${profile.port}`,
    userDatabase: `${profile.user}@${profile.database}`,
    sslmode: profile.sslmode,
    timeout: `${profile.timeoutMs}ms`,
    pool: profile.pool ?? "default",
    passwordSaved: profile.passwordSaved,
    active: profile.active || state.activeProfileId === profile.profileId,
    updatedAt: profile.updatedAt
  }));

export const toPostgresProfileCommandError = (
  operation: PostgresProfileOperation,
  error: unknown,
  fallback: string
): PostgresProfileCommandError => {
  const commandError = error as Partial<CommandError> | undefined;
  const rawMessage = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const rawDetail = commandError?.detail ?? null;
  return {
    operation,
    code: typeof commandError?.code === "string" ? commandError.code : "postgres_profile_command_failed",
    message: boundDisplayText(redactPostgresProfileText(rawMessage), fallback),
    detail: rawDetail ? boundDisplayText(redactPostgresProfileText(rawDetail), null) : null
  };
};

export const toPostgresProfileValidationError = (
  operation: PostgresProfileOperation,
  message: string
): PostgresProfileCommandError => ({
  operation,
  code: "postgres_profile_invalid_input",
  message,
  detail: null
});

const parsePositiveInteger = (
  value: string,
  field: string
): { ok: true; value: number } | { ok: false; message: string } => {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, message: `Postgres profile ${field} must be a positive integer.` };
  }
  return { ok: true, value: parsed };
};

const parseOptionalPositiveInteger = (
  value: string,
  field: string
): { ok: true; value?: number } | { ok: false; message: string } => {
  if (!value.trim()) return { ok: true };
  return parsePositiveInteger(value, field);
};

const redactPostgresProfileText = (message: string): string =>
  message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/(\/\/[^:\s/]+:)[^@\s/]+(@)/g, "$1[redacted]$2")
    .replace(/\b(?:database_url|password|passwd|pwd)=\S+/gi, (match) => {
      const [key] = match.split("=", 1);
      return `${key}=[redacted]`;
    });

const boundDisplayText = (message: string, fallback: string | null): string => {
  const firstLine = message.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const safeMessage = firstLine || fallback || "";
  return safeMessage.length <= 160 ? safeMessage : `${safeMessage.slice(0, 157)}...`;
};
