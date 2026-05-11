#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  formatLoadedEnvFiles,
  loadPostgresEnv,
  REPO_ROOT,
  runPostgresSmoke,
  withPostgresRuntimeClient
} from "./postgres-tools.mjs";

const DESKTOP_APP_DIR = path.join("apps", "desktop");
const DESKTOP_PACKAGE_PATH = path.join(DESKTOP_APP_DIR, "package.json");
const TAURI_CONFIG_PATH = path.join(DESKTOP_APP_DIR, "src-tauri", "tauri.conf.json");
const DESKTOP_DIST_INDEX_PATH = path.join(DESKTOP_APP_DIR, "dist", "index.html");
const RUNTIME_CREATED_AT = "2026-05-12T00:00:00.000Z";
const RUNTIME_SOURCE = "---\nid: exp-desktop-runtime-smoke\ntitle: Desktop runtime smoke\ndate: 2026-05-12\n---\n\n:::chemd #rxn-runtime-smoke\nkind: reaction\nreactants: aldehyde\nproducts: alcohol\nyield: 72%\n:::\n";

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
  env.CHEMD_POSTGRES_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || "";

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

export const loadDesktopRuntimeGraphModules = async () => {
  const storage = await import("../packages/storage-postgres/src/index.ts");
  return {
    getPostgresGraphRagExtensionSchemaSql: storage.getPostgresGraphRagExtensionSchemaSql,
    persistPostgresRuntimeGraphRagRecords: storage.persistPostgresRuntimeGraphRagRecords
  };
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
    metadata: { documentName: "desktop-runtime-smoke.chemd.md", documentUri: "chemd://desktop-runtime-smoke", sourceHash: "fnv1a:desktop-runtime-smoke", sourceText: RUNTIME_SOURCE },
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

export const runDesktopRuntimeSmoke = async ({
  rootDir = REPO_ROOT,
  envLoader = loadPostgresEnv,
  desktopCheck = checkDesktopRuntimePreconditions,
  withClient = withPostgresRuntimeClient,
  postgresSmoke = runPostgresSmoke,
  persistenceSmoke = runDesktopRuntimePersistenceSmoke,
  logger = console
} = {}) => {
  logger.log("Chemd desktop runtime smoke starting.");
  const { env, loadedFiles } = envLoader({ rootDir });
  logger.log(`Loaded env files: ${formatLoadedEnvFiles(loadedFiles)}`);

  const desktop = desktopCheck({ rootDir });
  logDesktopChecks(logger, desktop.checks);
  if (!desktop.ok) {
    throw new Error("Desktop runtime preflight failed.");
  }

  const databaseUrl = getPostgresDatabaseUrl(env);
  if (!databaseUrl) {
    logger.log(
      "SKIP desktop runtime smoke: CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is not configured."
    );
    return { status: "skipped", reason: "missing-postgres-env" };
  }

  logger.log(`PostgreSQL target: ${summarizePostgresTarget(databaseUrl)}`);
  const result = await withClient({
    env,
    operation: async (client) => {
      const postgres = await postgresSmoke({ client });
      const persistence = await persistenceSmoke({ client });
      return { postgres, persistence };
    }
  });

  logger.log("Chemd desktop runtime smoke passed.");
  logger.log(`experiment: ${result.postgres.experimentId}`);
  logger.log(`revision: ${result.postgres.revisionId}`);
  logger.log(`compile run: ${result.postgres.compileRunId}`);
  logger.log(`rag chunks: ${result.postgres.ragChunks}`);
  logger.log(`first chunk: ${result.postgres.firstChunkId}`);
  logger.log(`runtime graph: ${result.persistence.graphSnapshotId}`);
  logger.log(`runtime verification: ${JSON.stringify(result.persistence.counts)}`);
  return { status: "passed", result };
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
