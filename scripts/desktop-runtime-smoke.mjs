#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  formatLoadedEnvFiles,
  loadPostgresEnv,
  loadRuntimeModules,
  normalizePostgresDatabaseUrl,
  REPO_ROOT,
  runPostgresSmoke,
  withPostgresRuntimeClient
} from "./postgres-tools.mjs";

const execFile = promisify(execFileCallback);
const DESKTOP_APP_DIR = path.join("apps", "desktop");
const DESKTOP_PACKAGE_PATH = path.join(DESKTOP_APP_DIR, "package.json");
const TAURI_CONFIG_PATH = path.join(DESKTOP_APP_DIR, "src-tauri", "tauri.conf.json");
const DESKTOP_DIST_INDEX_PATH = path.join(DESKTOP_APP_DIR, "dist", "index.html");
const MANAGED_POSTGRES_DIR = "postgres";
const MANAGED_POSTGRES_DATABASE = "chemd_desktop";
const MANAGED_POSTGRES_USER = "chemd_desktop";
const MANAGED_POSTGRES_OWNER = "chemd-desktop-managed-postgres-smoke/v1";
const LOCAL_STORE_SNAPSHOT_FILE = "runtime-snapshot.json";
const LOCAL_STORE_OUTBOX_FILE = "outbox.json";
const RUNTIME_CREATED_AT = "2026-05-12T00:00:00.000Z";
const RUNTIME_SOURCE = "---\nid: exp-desktop-runtime-smoke\ntitle: Desktop runtime smoke\ndate: 2026-05-12\n---\n\n:::chemd #rxn-runtime-smoke\nkind: reaction\nreactants: aldehyde\nproducts: alcohol\nyield: 72%\n:::\n";
const TAURI_COMMAND_RUNNER_ENV = "CHEMD_DESKTOP_TAURI_COMMAND_RUNNER";
const TAURI_COMMAND_RUNNER_ARGS_ENV = "CHEMD_DESKTOP_TAURI_COMMAND_RUNNER_ARGS";

const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

const readJsonFile = ({ rootDir, relativePath, readTextFile }) =>
  JSON.parse(readTextFile(path.resolve(rootDir, relativePath), "utf8"));

const addCheck = (checks, name, status, detail) => {
  checks.push({ name, status, detail });
};

const checkDesktopPackage = ({ checks, rootDir, fileExists, readTextFile }) => {
  if (!fileExists(path.resolve(rootDir, DESKTOP_PACKAGE_PATH))) {
    addCheck(checks, "desktop package", "fail", `${DESKTOP_PACKAGE_PATH} missing`);
    return false;
  }

  const packageJson = readJsonFile({ rootDir, relativePath: DESKTOP_PACKAGE_PATH, readTextFile });
  const missingScripts = ["build", "typecheck", "tauri:build"].filter((scriptName) => !packageJson.scripts?.[scriptName]);
  addCheck(
    checks,
    "desktop scripts",
    missingScripts.length === 0 ? "pass" : "fail",
    missingScripts.length === 0 ? "build/typecheck/tauri:build available" : `missing ${missingScripts.join(", ")}`
  );
  return true;
};

const checkTauriConfig = ({ checks, rootDir, fileExists, readTextFile }) => {
  if (!fileExists(path.resolve(rootDir, TAURI_CONFIG_PATH))) {
    addCheck(checks, "tauri config", "fail", `${TAURI_CONFIG_PATH} missing`);
    return;
  }

  const tauriConfig = readJsonFile({ rootDir, relativePath: TAURI_CONFIG_PATH, readTextFile });
  const frontendDist = tauriConfig.build?.frontendDist;
  addCheck(
    checks,
    "tauri frontendDist",
    typeof frontendDist === "string" && frontendDist.length > 0 ? "pass" : "fail",
    frontendDist || "missing"
  );
};

const checkDesktopDistArtifact = ({ checks, rootDir, fileExists }) => {
  const hasDistIndex = fileExists(path.resolve(rootDir, DESKTOP_DIST_INDEX_PATH));
  addCheck(
    checks,
    "desktop dist artifact",
    hasDistIndex ? "pass" : "warn",
    hasDistIndex ? DESKTOP_DIST_INDEX_PATH : `${DESKTOP_DIST_INDEX_PATH} missing; run desktop build before packaging`
  );
};

export const getPostgresDatabaseUrl = (env) =>
  normalizePostgresDatabaseUrl(
    env.CHEMD_POSTGRES_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || ""
  );

export const summarizePostgresTarget = (databaseUrl) => {
  try {
    const parsed = new URL(databaseUrl);
    return [
      `host=${parsed.hostname || "(unknown)"}`,
      `port=${parsed.port || "(default)"}`,
      `database=${parsed.pathname.replace(/^\//u, "") || "(default)"}`,
      `user=${parsed.username || "(none)"}`,
      `password=${parsed.password ? "[REDACTED]" : "(none)"}`
    ].join(", ");
  } catch {
    return "configured=true, url=[REDACTED]";
  }
};

export const managedPostgresCandidateDirs = ({ rootDir = REPO_ROOT, env = process.env } = {}) => {
  const candidates = [];
  const devBinDir = safeTrim(env.CHEMD_MANAGED_POSTGRES_BIN_DIR);
  const resourceDir = safeTrim(env.CHEMD_MANAGED_POSTGRES_RESOURCE_DIR);
  if (devBinDir) {
    candidates.push({ dir: devBinDir, source: "CHEMD_MANAGED_POSTGRES_BIN_DIR" });
  }
  if (resourceDir) {
    candidates.push({ dir: path.join(resourceDir, "postgres", "bin"), source: "bundled PostgreSQL binaries" });
    candidates.push({ dir: path.join(resourceDir, "postgres"), source: "bundled PostgreSQL binaries" });
  }
  for (const relativePath of [
    path.join("apps", "desktop", "src-tauri", "resources", "postgres", "bin"),
    path.join("apps", "desktop", "src-tauri", "resources", "postgres"),
    path.join("apps", "desktop", "src-tauri", "target", "release", "resources", "postgres", "bin"),
    path.join("apps", "desktop", "src-tauri", "target", "release", "resources", "postgres"),
    path.join("apps", "desktop", "src-tauri", "target", "debug", "resources", "postgres", "bin"),
    path.join("apps", "desktop", "src-tauri", "target", "debug", "resources", "postgres")
  ]) {
    candidates.push({ dir: path.resolve(rootDir, relativePath), source: "bundled PostgreSQL binaries" });
  }
  return candidates;
};

const executableInDir = ({ dir, name, fileExists }) => {
  const plain = path.join(dir, name);
  if (fileExists(plain)) {
    return plain;
  }
  if (process.platform === "win32") {
    const exe = path.join(dir, `${name}.exe`);
    if (fileExists(exe)) {
      return exe;
    }
  }
  return "";
};

export const discoverManagedPostgresBinaries = ({
  rootDir = REPO_ROOT,
  env = process.env,
  fileExists = existsSync
} = {}) => {
  const candidates = managedPostgresCandidateDirs({ rootDir, env });
  if (candidates.length === 0) {
    return { available: false, reason: "Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries" };
  }

  for (const candidate of candidates) {
    const initdb = executableInDir({ dir: candidate.dir, name: "initdb", fileExists });
    const psql = executableInDir({ dir: candidate.dir, name: "psql", fileExists });
    const postgres = executableInDir({ dir: candidate.dir, name: "postgres", fileExists });
    const pgCtl = executableInDir({ dir: candidate.dir, name: "pg_ctl", fileExists });
    if (initdb && psql && (postgres || pgCtl)) {
      return { available: true, binaries: { initdb, psql, postgres, pgCtl, source: candidate.source } };
    }
  }

  return {
    available: false,
    reason: "PostgreSQL binaries are missing initdb, psql, and postgres or pg_ctl"
  };
};

const randomManagedPassword = () => `chemd_${randomBytes(12).toString("hex")}`;

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });

const managedDatabaseUrl = (config, database = config.database) =>
  `postgres://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(database)}`;

const summarizeManagedTarget = (config, source) => [
  `source=${source}`,
  `host=${config.host}`,
  `port=${config.port}`,
  `database=${config.database}`,
  `user=${config.user}`,
  "password=[REDACTED]"
].join(", ");

const readManagedConfig = ({ configFile, fileExists, readTextFile }) => {
  if (!fileExists(configFile)) {
    return undefined;
  }
  return JSON.parse(readTextFile(configFile, "utf8"));
};

const createManagedConfig = async ({ configFile, fileExists, readTextFile, writeTextFile, getPort }) => {
  const existing = readManagedConfig({ configFile, fileExists, readTextFile });
  if (existing) {
    return existing;
  }
  const config = {
    host: "127.0.0.1",
    port: await getPort(),
    database: MANAGED_POSTGRES_DATABASE,
    user: MANAGED_POSTGRES_USER,
    password: randomManagedPassword(),
    createdAt: new Date().toISOString()
  };
  writeTextFile(configFile, `${JSON.stringify(config, null, 2)}\n`);
  return config;
};

const runInitdb = async ({ binaries, paths, config, runCommand, writeTextFile, removeFile }) => {
  const pwfile = path.join(paths.runDir, "postgres.pw");
  writeTextFile(pwfile, config.password);
  try {
    await runCommand(binaries.initdb, [
      "-D", paths.dataDir,
      "-U", config.user,
      "--encoding=UTF8",
      "--auth-host=scram-sha-256",
      "--auth-local=trust",
      "--pwfile", pwfile
    ]);
  } finally {
    removeFile(pwfile);
  }
};

const waitForManagedPostgres = async ({ env, runtimeModules, attempts = 40 }) => {
  const { createPostgresRuntimeClient } = await runtimeModules();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const client = createPostgresRuntimeClient({ env });
    try {
      await client.query("SELECT 1", []);
      await client.close();
      return;
    } catch {
      await client.close().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Managed Postgres did not accept connections before timeout.");
};

const quoteIdent = (value) => `"${String(value).replaceAll("\"", "\"\"")}"`;

const ensureManagedDatabase = async ({ config, runtimeModules }) => {
  const { createPostgresRuntimeClient } = await runtimeModules();
  const client = createPostgresRuntimeClient({
    env: { CHEMD_POSTGRES_DATABASE_URL: managedDatabaseUrl(config, "postgres") }
  });
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [config.database]);
    if (!result.rows?.[0]) {
      await client.query(`CREATE DATABASE ${quoteIdent(config.database)} OWNER ${quoteIdent(config.user)}`, []);
    }
  } finally {
    await client.close();
  }
};

const stopManagedProcess = async ({ child, pidFile, removeFile }) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    removeFile(pidFile);
    return;
  }
  child.kill();
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    child.once?.("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  removeFile(pidFile);
};

const defaultManagedRoot = () =>
  path.join(os.tmpdir(), `chemd-desktop-runtime-smoke-${process.pid}`, MANAGED_POSTGRES_DIR);

const unavailableManagedSmokeStatus = (availability) => {
  if (!availability.available) {
    return { status: "unavailable", reason: availability.reason };
  }
  if (!availability.binaries.postgres) {
    return { status: "unavailable", reason: "Managed smoke requires a postgres binary for owned process cleanup" };
  }
  return undefined;
};

const managedSmokePaths = (managedRoot) => ({
  root: managedRoot,
  dataDir: path.join(managedRoot, "data"),
  runDir: path.join(managedRoot, "run"),
  configFile: path.join(managedRoot, "connection.json"),
  pidFile: path.join(managedRoot, "managed-postgres.pid.json")
});

const ensureManagedSmokeDataDir = async ({
  paths,
  binaries,
  fileExists,
  readTextFile,
  writeTextFile,
  makeDir,
  getPort,
  runCommand,
  removeFile
}) => {
  makeDir(paths.root, { recursive: true });
  makeDir(paths.runDir, { recursive: true });
  const config = await createManagedConfig({ configFile: paths.configFile, fileExists, readTextFile, writeTextFile, getPort });
  if (!fileExists(path.join(paths.dataDir, "PG_VERSION"))) {
    await runInitdb({ binaries, paths, config, runCommand, writeTextFile, removeFile });
  }
  return config;
};

const spawnManagedSmokePostgres = ({ binaries, paths, config, spawnProcess, writeTextFile }) => {
  const child = spawnProcess(binaries.postgres, ["-D", paths.dataDir, "-h", config.host, "-p", String(config.port)], {
    stdio: "ignore",
    windowsHide: true
  });
  writeTextFile(paths.pidFile, `${JSON.stringify({ owner: MANAGED_POSTGRES_OWNER, pid: child.pid, dataDir: paths.dataDir, startedAt: new Date().toISOString() }, null, 2)}\n`);
  return child;
};

const startedManagedSmokeRuntime = ({ env, config, source, child, paths, removeFile }) => ({
  status: "started",
  env: {
    ...env,
    CHEMD_POSTGRES_DATABASE_URL: managedDatabaseUrl(config),
    CHEMD_POSTGRES_SSL: env.CHEMD_POSTGRES_SSL || "false",
    CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS: env.CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS || "5000"
  },
  summary: summarizeManagedTarget(config, source),
  cleanup: () => stopManagedProcess({ child, pidFile: paths.pidFile, removeFile })
});

const createManagedPostgresSmokeOptions = (options) => ({
  rootDir: REPO_ROOT,
  env: process.env,
  fileExists: existsSync,
  readTextFile: readFileSync,
  writeTextFile: writeFileSync,
  makeDir: mkdirSync,
  removeFile: (filePath) => rmSync(filePath, { force: true }),
  runCommand: execFile,
  spawnProcess: spawn,
  getPort: getFreePort,
  runtimeModules: loadRuntimeModules,
  readinessAttempts: 40,
  ...options
});

export const startManagedPostgresSmokeRuntime = async (options = {}) => {
  const {
    rootDir,
    env,
    fileExists,
    readTextFile,
    writeTextFile,
    makeDir,
    removeFile,
    runCommand,
    spawnProcess,
    getPort,
    runtimeModules,
    readinessAttempts
  } = createManagedPostgresSmokeOptions(options);
  const availability = discoverManagedPostgresBinaries({ rootDir, env, fileExists });
  const unavailable = unavailableManagedSmokeStatus(availability);
  if (unavailable) {
    return unavailable;
  }

  const managedRoot = safeTrim(env.CHEMD_MANAGED_POSTGRES_HOME) || defaultManagedRoot();
  const paths = managedSmokePaths(managedRoot);
  const config = await ensureManagedSmokeDataDir({
    paths,
    binaries: availability.binaries,
    fileExists,
    readTextFile,
    writeTextFile,
    makeDir,
    getPort,
    runCommand,
    removeFile
  });
  const child = spawnManagedSmokePostgres({ binaries: availability.binaries, paths, config, spawnProcess, writeTextFile });
  const maintenanceEnv = { CHEMD_POSTGRES_DATABASE_URL: managedDatabaseUrl(config, "postgres") };
  try {
    await waitForManagedPostgres({ env: maintenanceEnv, runtimeModules, attempts: readinessAttempts });
    await ensureManagedDatabase({ config, runtimeModules });
    return startedManagedSmokeRuntime({ env, config, source: availability.binaries.source, child, paths, removeFile });
  } catch (error) {
    await stopManagedProcess({ child, pidFile: paths.pidFile, removeFile });
    throw error;
  }
};

export const loadDesktopRuntimeGraphModules = async () => {
  const storage = await import("../packages/storage-postgres/src/index.ts");
  return {
    getPostgresGraphRagExtensionSchemaSql: storage.getPostgresGraphRagExtensionSchemaSql,
    persistPostgresRuntimeGraphRagRecords: storage.persistPostgresRuntimeGraphRagRecords
  };
};

export const loadDesktopLocalStoreModules = async () => {
  const localStore = await import("../apps/desktop/src/desktop-local-store.ts");
  return {
    buildLocalRuntimeSnapshotInput: localStore.buildLocalRuntimeSnapshotInput
  };
};

const parseRunnerArgs = (value) => {
  const trimmed = safeTrim(value);
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed) || parsed.some((arg) => typeof arg !== "string")) {
    throw new Error(`${TAURI_COMMAND_RUNNER_ARGS_ENV} must be a JSON string array`);
  }
  return parsed;
};

const runTauriCommandRunnerProcess = ({
  runnerPath,
  runnerArgs,
  command,
  input,
  runnerEnv = process.env,
  spawnProcess = spawn
}) =>
  new Promise((resolve, reject) => {
    const child = spawnProcess(runnerPath, [...runnerArgs, command], {
      stdio: ["pipe", "pipe", "pipe"],
      env: runnerEnv
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`runner exited ${code}: ${stderr.trim() || stdout.trim() || "no output"}`));
        return;
      }
      const body = stdout.trim();
      if (!body) {
        resolve(undefined);
        return;
      }
      const parsed = JSON.parse(body);
      resolve(Object.hasOwn(parsed, "output") ? parsed.output : parsed);
    });
    child.stdin?.end(`${JSON.stringify({ command, input: input ?? null })}\n`);
  });

export const createDesktopTauriCommandRunner = ({
  env = process.env,
  spawnProcess = spawn
} = {}) => {
  const runnerPath = safeTrim(env[TAURI_COMMAND_RUNNER_ENV]);
  if (!runnerPath) {
    return undefined;
  }
  const runnerArgs = parseRunnerArgs(env[TAURI_COMMAND_RUNNER_ARGS_ENV]);
  const runnerEnv = { ...process.env, ...env };
  return ({ command, input }) =>
    runTauriCommandRunnerProcess({ runnerPath, runnerArgs, command, input, runnerEnv, spawnProcess });
};

export const buildMinimalDesktopRuntimePersistencePayload = ({
  revisionId = `rev-desktop-runtime-${Date.now()}`,
  createdAt = RUNTIME_CREATED_AT
} = {}) => {
  const experimentId = "exp-desktop-runtime-smoke";
  const graphSnapshotId = `${revisionId}::graph`;
  const nodeA = `${graphSnapshotId}::node::reaction`;
  const nodeB = `${graphSnapshotId}::node::result`;
  const chunkId = "desktop-runtime-smoke-chunk-1";
  const agentRunId = `${revisionId}::agent-run`;
  const sourceRange = { start: 80, end: 170, startLine: 7, endLine: 12 };
  const nodeBase = { graphSnapshotId, experimentId, revisionId, nodeKind: "entity", sourceRange, createdAt };
  return {
    graphSnapshot: { graphSnapshotId, experimentId, sourceRevisionIds: [revisionId], graphKind: "reaction", nodeCount: 2, edgeCount: 1, createdAt },
    nodes: [
      { ...nodeBase, nodeId: nodeA, entityId: "rxn::desktop-runtime-smoke", blockId: "rxn-runtime-smoke", reactionFamily: "reduction", routeId: "route-smoke", payload: { label: "runtime reaction" } },
      { ...nodeBase, nodeId: nodeB, entityId: "res::desktop-runtime-smoke", payload: { label: "runtime result" } }
    ],
    edges: [{ edgeId: `${graphSnapshotId}::edge::evidence`, graphSnapshotId, experimentId, fromNodeId: nodeA, toNodeId: nodeB, edgeType: "evidence_link", confidence: "high", evidence: { source: "desktop-runtime-smoke" }, createdAt }],
    citationCandidates: [{
      citationId: `${revisionId}::citation::chunk-1`,
      revisionId,
      chunkId,
      experimentId,
      entityId: "rxn::desktop-runtime-smoke",
      blockId: "rxn-runtime-smoke",
      documentUri: "chemd://desktop-runtime-smoke",
      sourceRange,
      citation: { experimentId, revisionId, chunkId, sourceRange },
      quality: { score: 1, source: "desktop-runtime-smoke" },
      createdAt
    }],
    agentRuns: [{ agentRunId, experimentId, revisionId, status: "completed", goal: "Verify desktop runtime persistence", startedAt: createdAt, finishedAt: createdAt }],
    agentToolCalls: [{ toolCallId: `${revisionId}::tool-call`, agentRunId, toolName: "desktop_runtime_smoke", input: { query: "runtime persistence" }, output: { rows: 1 }, status: "ok", createdAt }],
    patchProposals: [{ patchProposalId: `${revisionId}::patch`, agentRunId, experimentId, baseRevisionId: revisionId, patch: { edits: [] }, status: "validated", validationResult: { status: "ok" }, createdAt }],
    metadata: {
      workspaceId: "desktop-runtime-smoke-workspace",
      documentId: "desktop-runtime-smoke-document",
      documentPath: "experiments/desktop-runtime-smoke.chemd.md",
      documentName: "desktop-runtime-smoke.chemd.md",
      documentUri: "chemd://desktop-runtime-smoke",
      revisionId,
      graphSnapshotId,
      sourceHash: "fnv1a:desktop-runtime-smoke",
      sourceText: RUNTIME_SOURCE
    },
    createdAt
  };
};

const firstSourceRevisionId = (payload) => {
  const revisionId = payload.graphSnapshot.sourceRevisionIds[0];
  if (!revisionId) {
    throw new Error("Desktop runtime persistence payload has no source revision id");
  }
  return revisionId;
};

export const writeDesktopRuntimeCoreRecords = async ({ client, payload }) => {
  const revisionId = firstSourceRevisionId(payload);
  const { experimentId } = payload.graphSnapshot;
  const citation = payload.citationCandidates[0];
  if (!citation) {
    throw new Error("Desktop runtime persistence payload has no citation candidate");
  }

  const queries = [
    [
      `INSERT INTO chemd_experiments (experiment_id, title, experiment_date, tags, created_at, updated_at)
       VALUES ($1, $2, $3::date, ARRAY['desktop-runtime-smoke']::text[], $4::timestamptz, $4::timestamptz)
       ON CONFLICT (experiment_id) DO UPDATE SET title = EXCLUDED.title, updated_at = EXCLUDED.updated_at`,
      [experimentId, "Desktop runtime smoke", payload.createdAt.slice(0, 10), payload.createdAt]
    ],
    [
      `INSERT INTO chemd_experiment_revisions (revision_id, experiment_id, source_kind, raw_source, source_hash, source_uri, created_at)
       VALUES ($1, $2, 'desktop_runtime', $3, $4, $5, $6::timestamptz)
       ON CONFLICT (revision_id) DO UPDATE SET raw_source = EXCLUDED.raw_source, source_hash = EXCLUDED.source_hash`,
      [revisionId, experimentId, payload.metadata.sourceText, payload.metadata.sourceHash, payload.metadata.documentUri, payload.createdAt]
    ],
    [
      `INSERT INTO chemd_rag_chunks (chunk_id, revision_id, experiment_id, chunk_type, source_entity_ids, text, metadata)
       VALUES ($1, $2, $3, 'desktop_runtime_citation', $4::text[], $5, $6::jsonb)
       ON CONFLICT (revision_id, chunk_id) DO UPDATE SET text = EXCLUDED.text, metadata = EXCLUDED.metadata`,
      [citation.chunkId, revisionId, experimentId, citation.entityId ? [citation.entityId] : [], `Desktop runtime citation for ${citation.chunkId}`, JSON.stringify({ source: "desktop-runtime-smoke" })]
    ]
  ];

  await client.query("BEGIN", []);
  try {
    for (const [sql, values] of queries) {
      await client.query(sql, values);
    }
    await client.query("COMMIT", []);
  } catch (error) {
    await client.query("ROLLBACK", []);
    throw error;
  }
};

const readCount = async (client, sql, values) => {
  const result = await client.query(sql, values);
  const count = Number(result?.rows?.[0]?.count);
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error("Desktop runtime persistence read-back failed");
  }
  return count;
};

export const verifyDesktopRuntimePersistence = async ({ client, payload }) => {
  const revisionId = firstSourceRevisionId(payload);
  const { graphSnapshotId, experimentId } = payload.graphSnapshot;
  const citation = payload.citationCandidates[0];
  const agentRun = payload.agentRuns[0];
  const toolCall = payload.agentToolCalls[0];
  const patch = payload.patchProposals[0];
  return {
    experiments: await readCount(client, "SELECT count(*)::int AS count FROM chemd_experiments WHERE experiment_id = $1", [experimentId]),
    revisions: await readCount(client, "SELECT count(*)::int AS count FROM chemd_experiment_revisions WHERE revision_id = $1", [revisionId]),
    ragChunks: await readCount(client, "SELECT count(*)::int AS count FROM chemd_rag_chunks WHERE revision_id = $1 AND chunk_id = $2", [revisionId, citation.chunkId]),
    graphSnapshots: await readCount(client, "SELECT count(*)::int AS count FROM chemd_reaction_graph_snapshots WHERE graph_snapshot_id = $1", [graphSnapshotId]),
    graphNodes: await readCount(client, "SELECT count(*)::int AS count FROM chemd_reaction_graph_nodes WHERE graph_snapshot_id = $1", [graphSnapshotId]),
    graphEdges: await readCount(client, "SELECT count(*)::int AS count FROM chemd_reaction_graph_edges WHERE graph_snapshot_id = $1", [graphSnapshotId]),
    citations: await readCount(client, "SELECT count(*)::int AS count FROM chemd_rag_chunk_citations WHERE revision_id = $1 AND chunk_id = $2", [revisionId, citation.chunkId]),
    agentRuns: await readCount(client, "SELECT count(*)::int AS count FROM chemd_agent_runs WHERE agent_run_id = $1", [agentRun.agentRunId]),
    agentToolCalls: await readCount(client, "SELECT count(*)::int AS count FROM chemd_agent_tool_calls WHERE tool_call_id = $1", [toolCall.toolCallId]),
    patchProposals: await readCount(client, "SELECT count(*)::int AS count FROM chemd_patch_proposals WHERE patch_proposal_id = $1", [patch.patchProposalId])
  };
};

export const runDesktopRuntimePersistenceSmoke = async ({
  client,
  revisionId = `rev-desktop-runtime-${Date.now()}`,
  graphModules = loadDesktopRuntimeGraphModules,
  payloadBuilder = buildMinimalDesktopRuntimePersistencePayload,
  coreWriter = writeDesktopRuntimeCoreRecords,
  persistenceVerifier = verifyDesktopRuntimePersistence
}) => {
  const modules = await graphModules();
  await client.query(modules.getPostgresGraphRagExtensionSchemaSql(), []);
  const payload = payloadBuilder({ revisionId });
  await coreWriter({ client, payload });
  const persisted = await modules.persistPostgresRuntimeGraphRagRecords(client, payload);
  const counts = await persistenceVerifier({ client, payload });
  return {
    experimentId: payload.graphSnapshot.experimentId,
    revisionId: firstSourceRevisionId(payload),
    graphSnapshotId: payload.graphSnapshot.graphSnapshotId,
    counts,
    records: persisted.records
  };
};

const defaultOfflineLocalStoreRoot = () =>
  path.join(os.tmpdir(), `chemd-desktop-offline-runtime-smoke-${process.pid}`, "local-store");

const resolveOfflineLocalStoreRoot = ({ rootDir, env }) => {
  const configured = safeTrim(env.CHEMD_DESKTOP_OFFLINE_SMOKE_DIR);
  if (!configured) {
    return defaultOfflineLocalStoreRoot();
  }
  return path.isAbsolute(configured) ? configured : path.resolve(rootDir, configured);
};

const readLocalOutboxFile = ({ outboxPath, fileExists, readTextFile }) => {
  if (!fileExists(outboxPath)) {
    return { entries: [] };
  }
  return JSON.parse(readTextFile(outboxPath, "utf8"));
};

const writePrettyJson = ({ filePath, value, makeDir, writeTextFile }) => {
  const parent = path.dirname(filePath);
  makeDir(parent, { recursive: true });
  writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const countLocalOutboxStatus = (outbox, syncStatus) =>
  outbox.entries.filter((entry) => entry.syncStatus === syncStatus).length;

const upsertLocalOutboxEntry = ({ outbox, snapshotInput }) => {
  const existing = outbox.entries.find((entry) => entry.idempotencyKey === snapshotInput.idempotencyKey);
  if (existing) {
    existing.payload = snapshotInput.payload;
    existing.metadata = snapshotInput.metadata;
    existing.syncStatus = "pending";
    existing.failureCount = 0;
    existing.lastError = null;
    existing.updatedAt = snapshotInput.createdAt;
    existing.syncedAt = null;
    return existing;
  }

  const entry = {
    ...snapshotInput,
    syncStatus: "pending",
    failureCount: 0,
    lastError: null,
    updatedAt: snapshotInput.createdAt,
    syncedAt: null
  };
  outbox.entries.push(entry);
  return entry;
};

const validateLocalSnapshotInput = (snapshotInput) => {
  for (const field of ["localId", "idempotencyKey", "createdAt"]) {
    if (typeof snapshotInput[field] !== "string" || snapshotInput[field].trim().length === 0) {
      throw new Error(`Local offline snapshot is missing ${field}`);
    }
  }
  if (!snapshotInput.payload || typeof snapshotInput.payload !== "object") {
    throw new Error("Local offline snapshot payload must be an object");
  }
  if (!snapshotInput.metadata || typeof snapshotInput.metadata !== "object" || Array.isArray(snapshotInput.metadata)) {
    throw new Error("Local offline snapshot metadata must be an object");
  }
};

const boundedSyncError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= 500 ? message : message.slice(0, 500);
};

const writeDesktopLocalRuntimeSnapshot = async ({
  payload,
  localStoreRoot,
  localStoreModules,
  fileExists,
  readTextFile,
  writeTextFile,
  makeDir
}) => {
  const modules = await localStoreModules();
  const snapshotInput = modules.buildLocalRuntimeSnapshotInput(payload);
  validateLocalSnapshotInput(snapshotInput);

  const snapshotPath = path.join(localStoreRoot, LOCAL_STORE_SNAPSHOT_FILE);
  const outboxPath = path.join(localStoreRoot, LOCAL_STORE_OUTBOX_FILE);
  const outbox = readLocalOutboxFile({ outboxPath, fileExists, readTextFile });
  const entry = upsertLocalOutboxEntry({ outbox, snapshotInput });
  const snapshot = {
    savedAt: entry.createdAt,
    localId: entry.localId,
    idempotencyKey: entry.idempotencyKey,
    payload: entry.payload,
    metadata: entry.metadata
  };

  writePrettyJson({ filePath: snapshotPath, value: snapshot, makeDir, writeTextFile });
  writePrettyJson({ filePath: outboxPath, value: outbox, makeDir, writeTextFile });

  const writtenOutbox = readLocalOutboxFile({ outboxPath, fileExists, readTextFile });
  const writtenEntry = writtenOutbox.entries.find((candidate) => candidate.idempotencyKey === snapshotInput.idempotencyKey);
  if (!writtenEntry) {
    throw new Error("Local offline outbox read-back failed");
  }

  return {
    storeRoot: localStoreRoot,
    snapshotPath,
    outboxPath,
    localId: writtenEntry.localId,
    idempotencyKey: writtenEntry.idempotencyKey,
    graphSnapshotId: payload.graphSnapshot.graphSnapshotId,
    experimentId: payload.graphSnapshot.experimentId,
    outboxPendingCount: countLocalOutboxStatus(writtenOutbox, "pending"),
    outboxFailedCount: countLocalOutboxStatus(writtenOutbox, "failed")
  };
};

const updateLocalOutboxSyncEntry = ({
  outboxPath,
  idempotencyKey,
  syncStatus,
  error,
  fileExists,
  readTextFile,
  writeTextFile,
  makeDir,
  now = () => new Date().toISOString()
}) => {
  const outbox = readLocalOutboxFile({ outboxPath, fileExists, readTextFile });
  const entry = outbox.entries.find((candidate) => candidate.idempotencyKey === idempotencyKey);
  if (!entry) {
    throw new Error("Local offline outbox sync entry was not found");
  }

  const updatedAt = now();
  entry.syncStatus = syncStatus;
  entry.updatedAt = updatedAt;
  if (syncStatus === "synced") {
    entry.failureCount = 0;
    entry.lastError = null;
    entry.syncedAt = updatedAt;
  } else {
    entry.failureCount = Number(entry.failureCount || 0) + 1;
    entry.lastError = boundedSyncError(error);
    entry.syncedAt = null;
  }
  writePrettyJson({ filePath: outboxPath, value: outbox, makeDir, writeTextFile });

  return {
    syncStatus: entry.syncStatus,
    failureCount: entry.failureCount,
    lastError: entry.lastError,
    syncedAt: entry.syncedAt,
    outboxPendingCount: countLocalOutboxStatus(outbox, "pending"),
    outboxFailedCount: countLocalOutboxStatus(outbox, "failed")
  };
};

export const runDesktopOfflineLocalStoreSmoke = async ({
  rootDir = REPO_ROOT,
  env = process.env,
  localStoreRoot = resolveOfflineLocalStoreRoot({ rootDir, env }),
  localStoreModules = loadDesktopLocalStoreModules,
  payloadBuilder = buildMinimalDesktopRuntimePersistencePayload,
  fileExists = existsSync,
  readTextFile = readFileSync,
  writeTextFile = writeFileSync,
  makeDir = mkdirSync
} = {}) => {
  const modules = await localStoreModules();
  const payload = payloadBuilder({ revisionId: "rev-desktop-offline-runtime-smoke" });
  const local = await writeDesktopLocalRuntimeSnapshot({
    payload,
    localStoreRoot,
    localStoreModules: async () => modules,
    fileExists,
    readTextFile,
    writeTextFile,
    makeDir
  });

  return {
    status: "offline-local-passed",
    detail: "local offline smoke wrote a runtime snapshot and pending outbox entry; database persistence was not attempted",
    ...local
  };
};

const OFFLINE_CORE_SKIPPED_DATABASE_DETAIL =
  "Offline Core smoke runs with database and managed PostgreSQL env disabled";

export const createOfflineCoreSmokeEnv = (env = process.env) => {
  const {
    CHEMD_POSTGRES_DATABASE_URL,
    DATABASE_URL,
    CHEMD_MANAGED_POSTGRES_BIN_DIR,
    CHEMD_MANAGED_POSTGRES_RESOURCE_DIR,
    CHEMD_MANAGED_POSTGRES_HOME,
    ...offlineEnv
  } = env;
  return offlineEnv;
};

export const validateDesktopOfflineCoreSmokeResult = ({
  offline,
  fileExists = existsSync
}) => {
  if (!offline || offline.status !== "offline-local-passed") {
    throw new Error(`Offline Core smoke expected local offline pass, got ${offline?.status ?? "missing"}`);
  }
  if (!fileExists(offline.snapshotPath)) {
    throw new Error(`Offline Core smoke did not write snapshot file: ${offline.snapshotPath}`);
  }
  if (!fileExists(offline.outboxPath)) {
    throw new Error(`Offline Core smoke did not write outbox file: ${offline.outboxPath}`);
  }
  if (Number(offline.outboxPendingCount) <= 0) {
    throw new Error(`Offline Core smoke expected pending outbox entries, got ${offline.outboxPendingCount}`);
  }
};

const offlineCoreDatabaseSkip = () => ({
  status: "skipped",
  reason: "offline-core-no-postgres-runtime",
  detail: OFFLINE_CORE_SKIPPED_DATABASE_DETAIL
});

export const logDesktopOfflineCoreSuccess = ({ logger, offline }) => {
  logger.log("Chemd desktop offline core smoke passed.");
  logger.log(`offline core store: ${offline.storeRoot}`);
  logger.log(`offline core snapshot: ${offline.snapshotPath}`);
  logger.log(`offline core outbox: ${offline.outboxPath}`);
  logger.log(`offline core verification: pending=${offline.outboxPendingCount}, graph=${offline.graphSnapshotId}`);
};

export const runDesktopOfflineCoreSmoke = async ({
  rootDir = REPO_ROOT,
  envLoader = loadPostgresEnv,
  desktopCheck = checkDesktopRuntimePreconditions,
  offlineLocalStoreSmoke = runDesktopOfflineLocalStoreSmoke,
  fileExists = existsSync,
  logger = console
} = {}) => {
  logger.log("Chemd desktop offline core smoke starting.");
  const { env, loadedFiles } = envLoader({ rootDir });
  logger.log(`Loaded env files: ${formatLoadedEnvFiles(loadedFiles)}`);

  const desktop = desktopCheck({ rootDir });
  logDesktopChecks(logger, desktop.checks);
  if (!desktop.ok) {
    throw new Error("Desktop offline core preflight failed.");
  }

  const offlineEnv = createOfflineCoreSmokeEnv(env);
  logger.log(`SKIP database persistence: ${OFFLINE_CORE_SKIPPED_DATABASE_DETAIL}.`);
  const offline = await offlineLocalStoreSmoke({ rootDir, env: offlineEnv });
  validateDesktopOfflineCoreSmokeResult({ offline, fileExists });
  logDesktopOfflineCoreSuccess({ logger, offline });

  return {
    status: "offline-core-passed",
    database: offlineCoreDatabaseSkip(),
    offline
  };
};

export const runDesktopReconnectOutboxSyncSmoke = async ({
  client,
  rootDir = REPO_ROOT,
  env = process.env,
  localStoreRoot = resolveOfflineLocalStoreRoot({ rootDir, env }),
  revisionId = "rev-desktop-reconnect-runtime-smoke",
  localStoreModules = loadDesktopLocalStoreModules,
  payloadBuilder = buildMinimalDesktopRuntimePersistencePayload,
  persistenceSmoke = runDesktopRuntimePersistenceSmoke,
  fileExists = existsSync,
  readTextFile = readFileSync,
  writeTextFile = writeFileSync,
  makeDir = mkdirSync,
  now = () => new Date().toISOString()
} = {}) => {
  const payload = payloadBuilder({ revisionId });
  const local = await writeDesktopLocalRuntimeSnapshot({
    payload,
    localStoreRoot,
    localStoreModules,
    fileExists,
    readTextFile,
    writeTextFile,
    makeDir
  });

  try {
    const persistence = await persistenceSmoke({
      client,
      revisionId,
      payloadBuilder: () => payload
    });
    const sync = updateLocalOutboxSyncEntry({
      outboxPath: local.outboxPath,
      idempotencyKey: local.idempotencyKey,
      syncStatus: "synced",
      fileExists,
      readTextFile,
      writeTextFile,
      makeDir,
      now
    });
    return {
      status: "script-level-reconnect-sync-passed",
      detail: "script-level smoke synced a local outbox payload to shared PostgreSQL schema; it is not Tauri command runtime proof",
      local,
      sync: {
        syncedCount: 1,
        failedCount: 0,
        skippedCount: 0,
        ...sync
      },
      persistence
    };
  } catch (error) {
    updateLocalOutboxSyncEntry({
      outboxPath: local.outboxPath,
      idempotencyKey: local.idempotencyKey,
      syncStatus: "failed",
      error,
      fileExists,
      readTextFile,
      writeTextFile,
      makeDir,
      now
    });
    throw error;
  }
};

const commandErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    return JSON.stringify(error);
  }
  return String(error);
};

const invokeSmokeCommand = async ({ commandRunner, command, input, commands }) => {
  commands.push(command);
  try {
    return await commandRunner({ command, input });
  } catch (error) {
    throw new Error(`Tauri command ${command} failed: ${commandErrorMessage(error)}`);
  }
};

const requireOutboxEntry = ({ entries, localId, idempotencyKey, syncStatus, phase }) => {
  if (!Array.isArray(entries)) {
    throw new Error(`Tauri command smoke expected ${phase} outbox entries to be an array`);
  }
  const entry = entries.find((candidate) =>
    candidate?.localId === localId || candidate?.idempotencyKey === idempotencyKey
  );
  if (!entry) {
    throw new Error(`Tauri command smoke did not find ${phase} outbox entry ${localId}`);
  }
  if (entry.syncStatus !== syncStatus) {
    throw new Error(`Tauri command smoke expected ${phase} outbox status ${syncStatus}, got ${entry.syncStatus}`);
  }
  return entry;
};

const requireSyncedOutboxResult = ({ sync, localId, idempotencyKey }) => {
  if (Number(sync?.syncedCount ?? 0) <= 0) {
    throw new Error("Tauri command smoke did not sync any local outbox entries");
  }
  const entry = sync.entries?.find((candidate) =>
    candidate?.localId === localId || candidate?.idempotencyKey === idempotencyKey
  );
  if (!entry || entry.syncStatus !== "synced") {
    throw new Error(`Tauri command smoke did not sync local outbox entry ${localId}`);
  }
  return entry;
};

const saveCommandLocalSnapshot = async ({
  commandRunner,
  localStoreModules,
  payloadBuilder,
  revisionId,
  commands
}) => {
  const modules = await localStoreModules();
  const payload = payloadBuilder({ revisionId });
  const snapshotInput = modules.buildLocalRuntimeSnapshotInput(payload);
  validateLocalSnapshotInput(snapshotInput);
  const saved = await invokeSmokeCommand({
    commandRunner,
    command: "save_local_runtime_snapshot",
    input: snapshotInput,
    commands
  });
  if (saved?.syncStatus !== "pending") {
    throw new Error(`Tauri command smoke expected saved snapshot to be pending, got ${saved?.syncStatus}`);
  }
  return { payload, snapshotInput, saved };
};

export const runDesktopTauriCommandSmoke = async ({
  env = process.env,
  postgresMode = getPostgresDatabaseUrl(env) ? "external" : "managed",
  commandRunner = createDesktopTauriCommandRunner({ env }),
  localStoreModules = loadDesktopLocalStoreModules,
  payloadBuilder = buildMinimalDesktopRuntimePersistencePayload,
  revisionId = "rev-desktop-tauri-command-runtime-smoke"
} = {}) => {
  if (!commandRunner) {
    return {
      status: "skipped",
      reason: "unsupported-tauri-command-runner",
      detail: `Set ${TAURI_COMMAND_RUNNER_ENV} or inject commandRunner to run real Tauri command smoke`
    };
  }

  const commands = [];
  if (postgresMode === "managed") {
    await invokeSmokeCommand({ commandRunner, command: "initialize_managed_postgres", commands });
    await invokeSmokeCommand({ commandRunner, command: "start_managed_postgres", commands });
    await invokeSmokeCommand({ commandRunner, command: "migrate_managed_postgres", commands });
  }

  const postgresStatus = await invokeSmokeCommand({ commandRunner, command: "read_postgres_status", commands });
  const localStoreStatus = await invokeSmokeCommand({ commandRunner, command: "read_local_store_status", commands });
  const { payload, saved } = await saveCommandLocalSnapshot({
    commandRunner,
    localStoreModules,
    payloadBuilder,
    revisionId,
    commands
  });
  const pending = await invokeSmokeCommand({
    commandRunner,
    command: "list_local_outbox",
    input: { syncStatus: "pending", limit: 10 },
    commands
  });
  const pendingEntry = requireOutboxEntry({
    entries: pending,
    localId: saved.localId,
    idempotencyKey: saved.idempotencyKey,
    syncStatus: "pending",
    phase: "pending"
  });
  const sync = await invokeSmokeCommand({ commandRunner, command: "sync_local_outbox_to_postgres", commands });
  const syncEntry = requireSyncedOutboxResult({
    sync,
    localId: saved.localId,
    idempotencyKey: saved.idempotencyKey
  });
  const synced = await invokeSmokeCommand({
    commandRunner,
    command: "list_local_outbox",
    input: { syncStatus: "synced", limit: 10 },
    commands
  });
  const syncedEntry = requireOutboxEntry({
    entries: synced,
    localId: saved.localId,
    idempotencyKey: saved.idempotencyKey,
    syncStatus: "synced",
    phase: "synced"
  });

  return {
    status: "tauri-command-passed",
    detail: "Tauri command smoke verified local outbox pending -> synced through desktop commands",
    postgresMode,
    commands,
    postgresStatus,
    localStoreStatus,
    graphSnapshotId: payload.graphSnapshot.graphSnapshotId,
    localId: saved.localId,
    idempotencyKey: saved.idempotencyKey,
    pendingEntry,
    sync,
    syncEntry,
    syncedEntry
  };
};

export const checkDesktopRuntimePreconditions = ({
  rootDir = REPO_ROOT,
  fileExists = existsSync,
  readTextFile = readFileSync
} = {}) => {
  const checks = [];

  const hasPackage = checkDesktopPackage({
    checks,
    rootDir,
    fileExists,
    readTextFile
  });
  if (!hasPackage) {
    return { ok: false, checks };
  }

  checkTauriConfig({ checks, rootDir, fileExists, readTextFile });
  checkDesktopDistArtifact({ checks, rootDir, fileExists });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
};

const logDesktopChecks = (logger, checks) => {
  for (const check of checks) {
    logger.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }
};

const runOfflineDesktopRuntimeSmoke = async ({ rootDir, env, managed, offlineLocalStoreSmoke, logger }) => {
  logger.log(`SKIP database persistence: ${managed.reason}.`);
  const offline = await offlineLocalStoreSmoke({ rootDir, env });
  logDesktopOfflineCoreSuccess({ logger, offline });
  return {
    status: "offline-core-passed",
    database: {
      status: "skipped",
      reason: "missing-postgres-runtime",
      detail: managed.reason
    },
    offline
  };
};

const prepareDesktopRuntimeSmokeTarget = async ({
  rootDir,
  env,
  managedPostgres,
  offlineLocalStoreSmoke,
  logger
}) => {
  const databaseUrl = getPostgresDatabaseUrl(env);
  if (databaseUrl) {
    logger.log(`PostgreSQL target: ${summarizePostgresTarget(databaseUrl)}`);
    return { smokeEnv: env, postgresMode: "external" };
  }

  const managed = await managedPostgres({ rootDir, env });
  if (managed.status !== "started") {
    return {
      completed: await runOfflineDesktopRuntimeSmoke({
        rootDir,
        env,
        managed,
        offlineLocalStoreSmoke,
        logger
      })
    };
  }

  logger.log(`Managed PostgreSQL target: ${managed.summary}`);
  return {
    smokeEnv: managed.env,
    postgresMode: "managed",
    cleanupManagedPostgres: managed.cleanup
  };
};

const runConnectedDesktopRuntimeSmoke = async ({
  rootDir,
  smokeEnv,
  postgresMode,
  withClient,
  postgresSmoke,
  reconnectSyncSmoke,
  persistenceSmoke,
  tauriCommandSmoke
}) =>
  withClient({
    env: smokeEnv,
    operation: async (client) => {
      const postgres = await postgresSmoke({ client });
      const reconnectSync = await reconnectSyncSmoke({
        client,
        rootDir,
        env: smokeEnv,
        persistenceSmoke
      });
      const tauriCommand = await tauriCommandSmoke({
        rootDir,
        env: smokeEnv,
        postgresMode
      });
      return { postgres, reconnectSync, persistence: reconnectSync.persistence, tauriCommand };
    }
  });

const logDesktopRuntimeSuccess = (logger, result) => {
  logger.log("Chemd desktop runtime smoke passed.");
  logger.log(`experiment: ${result.postgres.experimentId}`);
  logger.log(`revision: ${result.postgres.revisionId}`);
  logger.log(`compile run: ${result.postgres.compileRunId}`);
  logger.log(`rag chunks: ${result.postgres.ragChunks}`);
  logger.log(`first chunk: ${result.postgres.firstChunkId}`);
  logger.log(`runtime graph: ${result.reconnectSync.persistence.graphSnapshotId}`);
  logger.log(`runtime verification: ${JSON.stringify(result.reconnectSync.persistence.counts)}`);
  logger.log(`reconnect outbox sync: synced=${result.reconnectSync.sync.syncedCount}, pending=${result.reconnectSync.sync.outboxPendingCount}, failed=${result.reconnectSync.sync.outboxFailedCount}`);
  logger.log("reconnect proof: script-level local outbox -> shared PostgreSQL smoke.");
  if (result.tauriCommand.status === "skipped") {
    logger.log(`SKIP Tauri command smoke: ${result.tauriCommand.detail}`);
    return;
  }
  logger.log(`Tauri command smoke passed: graph=${result.tauriCommand.graphSnapshotId}, local=${result.tauriCommand.localId}, synced=${result.tauriCommand.sync.syncedCount}`);
};

const createDesktopRuntimeSmokeOptions = (options) => ({
  rootDir: REPO_ROOT,
  envLoader: loadPostgresEnv,
  desktopCheck: checkDesktopRuntimePreconditions,
  withClient: withPostgresRuntimeClient,
  postgresSmoke: runPostgresSmoke,
  persistenceSmoke: runDesktopRuntimePersistenceSmoke,
  reconnectSyncSmoke: runDesktopReconnectOutboxSyncSmoke,
  tauriCommandSmoke: runDesktopTauriCommandSmoke,
  managedPostgres: startManagedPostgresSmokeRuntime,
  offlineLocalStoreSmoke: runDesktopOfflineLocalStoreSmoke,
  logger: console,
  ...options
});

export const runDesktopRuntimeSmoke = async (options = {}) => {
  const {
    rootDir,
    envLoader,
    desktopCheck,
    withClient,
    postgresSmoke,
    persistenceSmoke,
    reconnectSyncSmoke,
    tauriCommandSmoke,
    managedPostgres,
    offlineLocalStoreSmoke,
    logger
  } = createDesktopRuntimeSmokeOptions(options);

  logger.log("Chemd desktop runtime smoke starting.");
  const { env, loadedFiles } = envLoader({ rootDir });
  logger.log(`Loaded env files: ${formatLoadedEnvFiles(loadedFiles)}`);

  const desktop = desktopCheck({ rootDir });
  logDesktopChecks(logger, desktop.checks);
  if (!desktop.ok) {
    throw new Error("Desktop runtime preflight failed.");
  }

  const target = await prepareDesktopRuntimeSmokeTarget({
    rootDir,
    env,
    managedPostgres,
    offlineLocalStoreSmoke,
    logger
  });
  if (target.completed) {
    return target.completed;
  }

  try {
    const result = await runConnectedDesktopRuntimeSmoke({
      rootDir,
      smokeEnv: target.smokeEnv,
      postgresMode: target.postgresMode,
      withClient,
      postgresSmoke,
      reconnectSyncSmoke,
      persistenceSmoke,
      tauriCommandSmoke
    });

    logDesktopRuntimeSuccess(logger, result);
    return { status: "passed", result };
  } finally {
    if (target.cleanupManagedPostgres) {
      await target.cleanupManagedPostgres();
    }
  }
};

export const runDesktopRuntimeSmokeCli = async ({
  runner = runDesktopRuntimeSmoke,
  logger = console
} = {}) => {
  try {
    await runner({ logger });
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktopRuntimeSmokeCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
