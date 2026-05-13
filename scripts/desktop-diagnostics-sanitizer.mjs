const SENSITIVE_NAME_PATTERN =
  /(?:api[_-]?key|auth|credential|database[_-]?url|db[_-]?url|passwd|password|secret|token|url)$/iu;

const SELECTED_ENV_KEYS = [
  "CHEMD_POSTGRES_DATABASE_URL",
  "DATABASE_URL",
  "CHEMD_DESKTOP_TAURI_COMMAND_RUNNER",
  "CHEMD_DESKTOP_TAURI_COMMAND_RUNNER_ARGS",
  "CHEMD_MANAGED_POSTGRES_BIN_DIR",
  "CHEMD_MANAGED_POSTGRES_RESOURCE_DIR",
  "CHEMD_MANAGED_POSTGRES_HOME",
  "CHEMD_DESKTOP_OFFLINE_SMOKE_DIR"
];

const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

const redactUrlPassword = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.password) {
      parsed.password = "[REDACTED]";
    }
    if (parsed.username && /token|key|secret|password/iu.test(parsed.username)) {
      parsed.username = "[REDACTED]";
    }
    return parsed.toString();
  } catch {
    return value.replace(
      /([?&](?:password|token|api_key|apikey|secret)=)[^&\s]+/giu,
      "$1[REDACTED]"
    );
  }
};

export const redactDiagnosticsValue = (name, value) => {
  if (value === null || value === undefined) {
    return value;
  }
  if (SENSITIVE_NAME_PATTERN.test(String(name))) {
    return "[REDACTED]";
  }
  if (typeof value !== "string") {
    return value;
  }
  return redactUrlPassword(value);
};

export const sanitizeDiagnosticValue = (value, key = "") => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDiagnosticValue(entry, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeDiagnosticValue(entryValue, entryKey)
      ])
    );
  }
  return redactDiagnosticsValue(key, value);
};

export const summarizeEnvSignals = (env) =>
  SELECTED_ENV_KEYS.map((name) => {
    const value = safeTrim(env[name]);
    return {
      name,
      status: value ? "configured" : "skip",
      value: value ? "[REDACTED]" : null
    };
  });
