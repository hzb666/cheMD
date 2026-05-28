import { invoke } from "@tauri-apps/api/core";
import type { AgentAuditEvent, AgentRun } from "@chemd/agent-tools";
import type { ChemdEditorDiagnostic, ChemdLanguageCompileOutput, ChemdTextEdit } from "@chemd/language-service";
import { buildEditorGraphRagRecords } from "@chemd/language-service";
import { sampleSource as playgroundSampleSource } from "../../web/src/features/playground/lib/sample-source";
import type {
  CommandMap,
  CommandError,
  LocalStoreStatus,
  ManagedPostgresStatus,
  PostgresStatus,
  RuntimeState,
  WorkspaceFileEntry,
  WorkspaceIngestQueueSummary,
} from "./contracts";
import type {
  ActivityTool,
  DocumentMode,
  InsightDockPanelId,
  LocalSnapshotState,
  LocalSyncState,
  LocalSyncSummary,
  ManagedPostgresOperation,
  PersistBuildInput,
  PersistState,
  PersistSummary,
  PostgresField,
  QuickFixCandidate,
  WorkspaceIngestState,
  WorkspaceState,
  WorkspaceSymbolIndexControllerState,
} from "./types";
import { formatPostgresDisplayValue } from "./features/postgres/status";
import { buildPersistRuntimeGraphRagCommandInput } from "./features/runtime/persistence";
import { isScratchFile } from "./features/workspace/scratch-file";
import { measureDesktopPerformanceAsync } from "./performance-marks";

// ---------------------------------------------------------------------------
// Sample sources
// ---------------------------------------------------------------------------

export const DEFAULT_SAMPLE_SOURCE_NAME = "ethanol-oxidation.chemd";

export const sampleSources: Record<string, string> = {
  [DEFAULT_SAMPLE_SOURCE_NAME]: playgroundSampleSource,
  "suzuki-screen.chemd": `module exp_desktop_suzuki

meta {
  id: "exp-desktop-suzuki"
  title: "Suzuki coupling condition screen"
  date: "2026-05-12"
  primary_reaction: @rxn_screen
  primary_result: @screen_result
}

molecule mol_aryl_bromide {
  smiles: "Cc1ccc(Br)cc1"
}

molecule mol_boronic_acid {
  smiles: "OB(O)c1ccccc1"
}

molecule mol_biaryl_product {
  smiles: "Cc1ccc(-c2ccccc2)cc1"
}

reaction rxn_screen {
  reactants: [@mol_aryl_bromide, @mol_boronic_acid]
  products: [@mol_biaryl_product]
  catalyst: "Pd(PPh3)4"
  base: "K2CO3"
  solvent: "dioxane/water"
}

result screen_result for @rxn_screen {
  status: pending
  yield: 78%
}
`,
  "calibration.chemd": `module exp_desktop_calibration

meta {
  id: "exp-desktop-calibration"
  title: "HPLC calibration record"
  date: "2026-05-12"
  primary_sample: @std_a
  primary_analysis: @calibration
}

sample std_a {
  name: "caffeine standard"
  amount: 2.0 mg
}

analysis calibration for @std_a {
  method: "HPLC-UV"
  target: "caffeine"
  result: "linear fit accepted"
}
`
};

// ---------------------------------------------------------------------------
// Command / runtime helpers
// ---------------------------------------------------------------------------

export const getSampleSource = (file: WorkspaceFileEntry): string =>
  sampleSources[file.name] ?? sampleSources[DEFAULT_SAMPLE_SOURCE_NAME];

export const invokeCommand = async <Command extends keyof CommandMap>(
  command: Command,
  input: CommandMap[Command]["input"]
): Promise<CommandMap[Command]["output"]> =>
  measureDesktopPerformanceAsync(
    "tauri.invoke",
    () => input === undefined ? invoke(command) : invoke(command, input as Record<string, unknown>),
    { command: String(command) }
  );

export const redactSensitiveRuntimeText = (message: string): string =>
  message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/(\/\/[^:\s/]+:)[^@\s/]+(@)/g, "$1[redacted]$2")
    .replace(/\b(?:database_url|password|passwd|pwd)=\S+/gi, (match) => {
      const [key] = match.split("=", 1);
      return `${key}=[redacted]`;
    });

export const getCommandErrorMessage = (error: unknown, fallback: string): string => {
  const commandError = error as Partial<CommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = redactSensitiveRuntimeText(message.split(/\r?\n/, 1)[0].trim());
  if (!firstLine) return fallback;
  return firstLine.length <= 140 ? firstLine : `${firstLine.slice(0, 137)}...`;
};

export const getCommandErrorCode = (error: unknown): string | null => {
  const commandError = error as Partial<CommandError> | undefined;
  return typeof commandError?.code === "string" ? commandError.code : null;
};

export const getDisplayableError = (error: unknown): string => {
  return getCommandErrorMessage(error, "Unknown desktop command failure");
};

export const createEditorSourceHash = (source: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const getSidecarErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<CommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return firstLine || "chem-service command failed";
};

export const getPostgresErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<CommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Postgres status unavailable");
};

export const activityDockPanel: Record<ActivityTool, InsightDockPanelId> = {
  files: "outline",
  search: "rag",
  graph: "graph",
  agent: "agent",
  settings: "settings"
};

// ---------------------------------------------------------------------------
// Postgres / status utilities
// ---------------------------------------------------------------------------

export const statusToneByState: Record<RuntimeState, string> = { ready: "success", placeholder: "pending", degraded: "warning", offline: "danger" };

export const workspaceStateLabel: Record<WorkspaceState, string> = { empty: "Empty", opening: "Opening", open: "Open", error: "Fallback" };

export const initialManagedPostgresStatus: ManagedPostgresStatus = {
  state: "placeholder",
  label: "Managed Postgres unchecked",
  detail: "Refresh managed Postgres status to inspect bundled binaries and local configuration.",
  available: false,
  reason: "Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries",
  configured: false,
  source: null,
  dataDir: null,
  host: null,
  port: null,
  database: null,
  user: null,
  pid: null,
  startedAt: null,
  migrationState: "not_initialized"
};

export const initialLocalStoreStatus: LocalStoreStatus = {
  state: "placeholder",
  label: "Local Store unchecked",
  detail: "Refresh the offline JSON outbox status before saving local snapshots.",
  available: false,
  storagePath: null,
  outboxPendingCount: 0,
  outboxFailedCount: 0,
  lastSavedAt: null,
  lastSyncedAt: null
};

export const agentStatusLabel: Record<AgentRun["status"], string> = {
  created: "Created",
  running: "Running",
  waiting_for_approval: "Awaiting approval",
  applying_patch: "Applying patch",
  validating: "Validating",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  canceled: "Canceled"
};

export const auditEventLabel: Record<AgentAuditEvent["type"], string> = {
  run_created: "Run",
  status_transitioned: "Status",
  tool_call_appended: "Tool",
  evidence_attached: "Evidence",
  patch_proposed: "Patch",
  patch_approved: "Approve",
  patch_rejected: "Reject",
  patch_applied: "Apply",
  decision_blocked: "Blocked"
};

export const formatPostgresValue = formatPostgresDisplayValue;

export const getPostgresBadgeDetail = (status: PostgresStatus): string => {
  if (!status.configured) return "Postgres is not configured";
  return [
    status.source ? `source ${status.source}` : null,
    status.host ? `host ${status.host}` : null,
    status.database ? `database ${status.database}` : null,
    status.user ? `user ${status.user}` : null
  ].filter(Boolean).join(" / ") || "Postgres is configured; inspect the runtime panel for details";
};

const isManagedPostgresSource = (source: string | null): boolean =>
  source?.startsWith("managed postgres:") ?? false;

export const getActivePostgresTarget = (
  status: PostgresStatus,
  managedStatus: ManagedPostgresStatus
): "External" | "Managed" | "None" => {
  if (status.configured && !isManagedPostgresSource(status.source)) return "External";
  if (status.configured && isManagedPostgresSource(status.source)) return "Managed";
  return managedStatus.configured ? "Managed" : "None";
};

export const getPostgresTargetMessage = (
  status: PostgresStatus,
  managedStatus: ManagedPostgresStatus
): string => {
  const target = getActivePostgresTarget(status, managedStatus);
  if (target === "External") {
    return managedStatus.configured
      ? "External Postgres has priority; Managed Postgres remains available as a local fallback."
      : "External Postgres is selected from the current runtime configuration.";
  }
  if (target === "Managed") {
    if (!status.configured) {
      return "Managed Postgres is configured locally; start it and refresh runtime readiness.";
    }
    return "No external Postgres source is selected; the runtime is using Managed Postgres configuration.";
  }
  return "No Postgres target is configured. Initialize Managed Postgres or set an external Postgres URL.";
};

export const getExternalConfigured = (status: PostgresStatus): boolean =>
  status.configured && !isManagedPostgresSource(status.source);

export const getExternalPostgresFields = (status: PostgresStatus): PostgresField[] => {
  if (!getExternalConfigured(status)) {
    return [
      ["State", "placeholder"],
      ["Configured", "no"],
      ["Source", "not selected"],
      ["Host", "unknown"],
      ["Database", "unknown"],
      ["User", "unknown"],
      ["SSL", "not configured"],
      ["pgvector", "unknown"],
      ["Schema", "unknown"],
      ["Timeout", "not configured"],
      ["Detail", "Set CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL to select External Postgres."]
    ];
  }
  return [
    ["State", status.state],
    ["Configured", "yes"],
    ["Source", formatPostgresValue(status.source)],
    ["Host", formatPostgresValue(status.host)],
    ["Database", formatPostgresValue(status.database)],
    ["User", formatPostgresValue(status.user)],
    ["SSL", status.ssl],
    ["pgvector", formatPostgresValue(status.vectorInstalled)],
    ["Schema", formatPostgresValue(status.schemaReady)],
    ["Timeout", `${status.timeoutMs}ms`],
    ["Detail", status.detail]
  ];
};

export const getManagedPostgresFields = (status: ManagedPostgresStatus): PostgresField[] => [
  ["Available", formatPostgresValue(status.available)],
  ["Configured", formatPostgresValue(status.configured)],
  ["Data dir", formatPostgresValue(status.dataDir)],
  ["Host", formatPostgresValue(status.host)],
  ["Port", formatPostgresValue(status.port)],
  ["Database", formatPostgresValue(status.database)],
  ["User", formatPostgresValue(status.user)],
  ["PID", formatPostgresValue(status.pid)],
  ["Migration", status.migrationState],
  ["Detail", status.detail]
];

export const getLocalStoreFields = (status: LocalStoreStatus): PostgresField[] => [
  ["Available", formatPostgresValue(status.available)],
  ["Pending", formatPostgresValue(status.outboxPendingCount)],
  ["Failed", formatPostgresValue(status.outboxFailedCount)],
  ["Last saved", formatLocalTimestamp(status.lastSavedAt)],
  ["Last synced", formatLocalTimestamp(status.lastSyncedAt)],
  ["Storage path", formatPostgresValue(status.storagePath)]
];

export const getManagedPostgresControlState = (
  status: ManagedPostgresStatus,
  loading: boolean,
  operation: ManagedPostgresOperation | null
) => {
  const busy = loading || operation !== null;
  return {
    canInit: !busy && status.available && !status.configured,
    canStart: !busy && status.available && status.configured && status.pid === null,
    canStop: !busy && status.available && status.pid !== null,
    canMigrate: !busy && status.available && status.configured && status.pid !== null,
    canRefresh: !busy
  };
};

// ---------------------------------------------------------------------------
// Text operations
// ---------------------------------------------------------------------------

export const getLineStarts = (source: string): number[] => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
};

export const getOffset = (source: string, line: number, column: number): number => {
  const lineStart = getLineStarts(source)[Math.max(0, line - 1)] ?? source.length;
  return Math.min(source.length, lineStart + Math.max(0, column - 1));
};

export const applyTextEdits = (source: string, edits: readonly ChemdTextEdit[]): string =>
  [...edits]
    .sort((left, right) =>
      getOffset(source, right.range.startLine, right.range.startColumn)
      - getOffset(source, left.range.startLine, left.range.startColumn)
    )
    .reduce((next, edit) => {
      const start = getOffset(next, edit.range.startLine, edit.range.startColumn);
      const end = getOffset(next, edit.range.endLine, edit.range.endColumn);
      return `${next.slice(0, start)}${edit.replacement}${next.slice(end)}`;
    }, source);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const formatRange = (range: ChemdTextEdit["range"]): string =>
  `L${range.startLine}:C${range.startColumn}-L${range.endLine}:C${range.endColumn}`;

export const formatSidecarStartedAt = (startedAt: string | null): string => {
  if (!startedAt) {
    return "not running";
  }
  const numericTimestamp = Number(startedAt);
  const date = Number.isFinite(numericTimestamp)
    ? new Date(numericTimestamp)
    : new Date(startedAt);
  return Number.isNaN(date.getTime()) ? startedAt : date.toLocaleString();
};

// ---------------------------------------------------------------------------
// Initial state constants
// ---------------------------------------------------------------------------

export const initialPersistState: PersistState = {
  state: "idle",
  message: "Graph/RAG payload is ready for a configured Postgres runtime.",
  summary: null
};

export const initialLocalSnapshotState: LocalSnapshotState = {
  state: "idle",
  message: "Local Store is an offline cache/outbox. It does not mean Postgres sync has succeeded.",
  summary: null
};

export const initialLocalSyncState: LocalSyncState = {
  state: "idle",
  message: "Sync Pending shares only pending outbox entries after Postgres readiness checks pass.",
  summary: null
};

export const initialWorkspaceIngestState: WorkspaceIngestState = {
  state: "idle",
  message: "Scan/Ingest reads workspace files and saves eligible Graph/RAG snapshots to the Local Store outbox.",
  items: [],
  summary: null
};

export const initialWorkspaceSymbolIndexState: WorkspaceSymbolIndexControllerState = {
  state: "idle",
  message: "Open a local workspace to build cross-document reference suggestions.",
  index: null,
  summary: null
};

// ---------------------------------------------------------------------------
// Persist / sync utilities
// ---------------------------------------------------------------------------

export const getPersistErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<CommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Persist graph failed");
};

export const getLocalStoreErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<CommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Local Store command failed");
};

export const getLocalOutboxErrorText = (error: string | undefined): string => {
  const safeError = redactSensitiveRuntimeText((error ?? "No entry error reported").split(/\r?\n/, 1)[0].trim());
  return safeError.length <= 120 ? safeError : `${safeError.slice(0, 117)}...`;
};

export const summarizeGraphSnapshotId = (graphSnapshotId: string): string =>
  graphSnapshotId.length <= 38
    ? graphSnapshotId
    : `${graphSnapshotId.slice(0, 16)}...${graphSnapshotId.slice(-16)}`;

export const formatPersistCounts = (counts: PersistSummary["counts"]): string =>
  `${counts.snapshots} snapshot / ${counts.nodes} nodes / ${counts.edges} edges / ${counts.citations} citations / ${counts.agentRuns} agent runs / ${counts.agentToolCalls} tools / ${counts.patchProposals} patches`;

export const summarizeLocalId = (value: string): string =>
  value.length <= 34 ? value : `${value.slice(0, 14)}...${value.slice(-14)}`;

export const formatLocalSyncCounts = (summary: LocalSyncSummary): string =>
  `${summary.syncedCount} synced / ${summary.failedCount} failed / ${summary.skippedCount} skipped`;

export const formatWorkspaceIngestCounts = (summary: WorkspaceIngestQueueSummary): string =>
  `${summary.totalCount} total / ${summary.pendingCount} pending / ${summary.skippedCount} skipped / ${summary.failedCount} failed / ${summary.retryableCount} retryable`;

export const formatLocalTimestamp = (value: string | null): string => {
  if (!value) return "never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const getPersistDisabledReason = ({
  mode,
  file,
  postgresStatus,
  compileStatus
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  postgresStatus: PostgresStatus;
  compileStatus: ChemdLanguageCompileOutput["status"];
}): string | null => {
  if (mode !== "workspace") return "Open a local workspace file before persisting Graph/RAG records.";
  if (file.kind !== "file") return "Select a file before persisting Graph/RAG records.";
  if (isScratchFile(file)) return "Save the untitled tab as a workspace file before persisting Graph/RAG records.";
  if (!postgresStatus.configured) return "Configure Postgres before persisting Graph/RAG records.";
  if (postgresStatus.state !== "ready") return "Postgres must be reachable before persisting Graph/RAG records.";
  if (postgresStatus.vectorInstalled !== true) return "Install pgvector before persisting Graph/RAG records.";
  if (postgresStatus.schemaReady !== true) return "Run PostgreSQL migrations before persisting Graph/RAG records.";
  if (compileStatus === "failed") return "Resolve the compile failure before persisting Graph/RAG records.";
  return null;
};

export const getLocalSnapshotDisabledReason = ({
  mode,
  file,
  compileStatus
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  compileStatus: ChemdLanguageCompileOutput["status"];
}): string | null => {
  if (mode !== "workspace") return "Open a local workspace file before saving an offline snapshot.";
  if (file.kind !== "file") return "Select a file before saving an offline snapshot.";
  if (isScratchFile(file)) return "Save the untitled tab as a workspace file before saving an offline snapshot.";
  if (compileStatus === "failed") return "Resolve the compile failure before saving an offline snapshot.";
  return null;
};

export const getLocalSyncDisabledReason = ({
  localStoreStatus,
  postgresStatus
}: {
  localStoreStatus: LocalStoreStatus;
  postgresStatus: PostgresStatus;
}): string | null => {
  if (!localStoreStatus.available) return "Local Store must be available before syncing pending outbox entries.";
  if (localStoreStatus.outboxPendingCount <= 0) return "No pending Local Store entries to sync.";
  if (!postgresStatus.configured) return "Configure Postgres before syncing pending outbox entries.";
  if (postgresStatus.state !== "ready") return "Postgres must be reachable before syncing pending outbox entries.";
  if (postgresStatus.vectorInstalled !== true) return "Install pgvector before syncing pending outbox entries.";
  if (postgresStatus.schemaReady !== true) return "Run PostgreSQL migrations before syncing pending outbox entries.";
  return null;
};

export const getWorkspaceIngestDisabledReason = ({
  mode,
  workspaceState,
  files
}: {
  mode: DocumentMode;
  workspaceState: WorkspaceState;
  files: WorkspaceFileEntry[];
}): string | null => {
  if (mode !== "workspace" || workspaceState !== "open") return "Open a local workspace before scanning workspace ingest.";
  if (!files.some((file) => {
    const path = file.path.toLowerCase();
    return file.kind === "file"
      && (path.endsWith(".chemd") || path.endsWith(".chemd.md") || file.chemdKind === "document");
  })) {
    return "No Chemd documents are visible in the current workspace.";
  }
  return null;
};

export const buildPersistCommandInput = ({
  source,
  workspace,
  file,
  compileOutput,
  agentRun
}: PersistBuildInput): CommandMap["persist_runtime_graph_rag"]["input"] => {
  const sourceHash = createEditorSourceHash(source);
  const documentHash = createEditorSourceHash(`${workspace.workspaceId}:${file.path}`);
  const revisionId = `desktop:${documentHash}:fnv1a:${sourceHash}`;
  const experimentId = `desktop:${workspace.workspaceId}:${documentHash}`;
  const records = buildEditorGraphRagRecords({
    source,
    documentUri: file.path,
    experimentId,
    revisionId,
    createdAt: new Date().toISOString(),
    compileOutput
  });
  const input = buildPersistRuntimeGraphRagCommandInput({
    records,
    source,
    workspace: {
      workspaceId: workspace.workspaceId,
      rootPath: workspace.rootPath,
      displayName: workspace.displayName
    },
    document: {
      path: file.path,
      documentId: file.id,
      documentUri: file.path,
      name: file.name,
      revisionId,
      experimentId
    },
    agentRun
  });
  return input as unknown as CommandMap["persist_runtime_graph_rag"]["input"];
};

export const getDiagnosticStats = (diagnostics: readonly { severity: string }[]) => {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const d of diagnostics) {
    if (d.severity === "error") errors += 1;
    else if (d.severity === "warning") warnings += 1;
    else infos += 1;
  }
  return { errors, warnings, infos };
};

export const getQuickFixCandidates = (diagnostics: readonly ChemdEditorDiagnostic[]): QuickFixCandidate[] =>
  diagnostics.flatMap((diagnostic) =>
    diagnostic.quickFixes.map((quickFix) => ({ diagnostic, quickFix })),
  );
