# @chemd/storage-postgres

PostgreSQL storage contract for Chemd experiment persistence.

This package is intentionally pure:

- no database driver
- no connection pool
- no environment reads
- no filesystem writes

It owns the versioned SQL schema and the typed mapping from compiled Chemd
outputs into insertable records. Runtime execution belongs in app/server or
service code.

## Storage Flow

```text
Chemd source
  -> compileChemd()
  -> trainingExport / ragExport / trainingUnderstanding / LNF
  -> buildExperimentStorageRecords()
  -> PostgreSQL tables
```

`trainingExport` remains the full audit artifact. `ragExport` drives
`chemd_rag_chunks` and pgvector embeddings. `trainingUnderstanding` drives
semantic facts, field evidence, Training Experience Memory, and Experiment
Pattern Memory projections.

## Graph/RAG Extension Contract

Desktop IDE uses the existing `@chemd/storage-postgres` main schema as the
knowledge store. It does not get a parallel desktop-specific schema for
workspaces, documents, revisions, compiled artifacts, RAG chunks, embeddings,
semantic diffs, or memory records.

The Graph/RAG extension remains a pure contract layer:

```text
compiled artifacts + training graph index
  -> buildPostgresGraphRagStorageRecords()
  -> reaction graph / RAG citation / Agent audit records
```

`getPostgresGraphRagExtensionSchemaSql()` exposes the schema fragment for
shared reaction graph snapshots, graph nodes, graph edges, RAG chunk citations,
Agent runs, Agent tool calls, and patch proposals. These tables reference the
existing core tables such as `chemd_experiments`,
`chemd_experiment_revisions`, and `chemd_rag_chunks`.

The mapper consumes already compiled artifacts and graph records. It does not
call `compileChemd()`, open database connections, execute migrations, or
generate embeddings. It emits citation sidecar records for existing
`chemd_rag_chunks`; it does not create a second RAG chunk table.

Runtime code that already has editor Graph/RAG DTOs or Agent tool state can use
the adapter helpers instead of assembling PostgreSQL records by hand:

```ts
import {
  buildPostgresRuntimeGraphRagRecords,
  buildUpsertGraphSnapshotQueries,
  persistPostgresRuntimeGraphRagRecords
} from "@chemd/storage-postgres";

const runtimeRecords = buildPostgresRuntimeGraphRagRecords({
  graphSnapshot: editorRecords.graphSnapshot,
  nodes: editorRecords.reactionGraphNodes,
  edges: editorRecords.reactionGraphEdges,
  citationCandidates: editorRecords.ragCitationCandidates,
  agentRuns,
  agentToolCalls,
  patchProposals
});

const graphQueries = buildUpsertGraphSnapshotQueries(
  runtimeRecords.graphSnapshotInput
);

await persistPostgresRuntimeGraphRagRecords(client, runtimeRecords);
```

The adapter types intentionally mirror those runtime DTO shapes without
importing `@chemd/language-service` or `@chemd/agent-tools`. Graph snapshots map
to `UpsertPostgresGraphSnapshotInput`, citation candidates map to
`PostgresRagChunkCitationRecord`, and Agent run/tool/patch inputs map to the
existing Agent audit record types. Missing `createdAt` values are supplied by
the adapter call, and Agent-style statuses are normalized to the shared
PostgreSQL status enums.

The repository helpers expose two layers:

- query builders that return parameterized `{ sql, values }` objects
- executor helpers that call an injected PostgreSQL client

The client contract is intentionally minimal and does not bind `pg`:

```ts
export interface PostgresGraphRagClient {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
}
```

Runtime code owns the concrete pool, connection lifecycle, and environment
configuration. It can execute builders itself, or call the executor helpers:

```ts
import {
  buildListPendingPatchProposalsQuery,
  buildUpsertGraphSnapshotQueries,
  executeUpsertGraphSnapshotTransactionPlan,
  listPendingPostgresPatchProposals,
  loadPostgresGraphDetail,
  recordPostgresAgentRun,
  upsertPostgresRagChunkCitation
} from "@chemd/storage-postgres";

const graphQueries = records.graphSnapshot
  ? buildUpsertGraphSnapshotQueries({
      graphSnapshot: records.graphSnapshot,
      nodes: records.reactionGraphNodes,
      edges: records.reactionGraphEdges
    })
  : [];

const citationQuery = buildUpsertRagChunkCitationQuery(
  records.ragChunkCitations[0]
);

const pendingPatches = buildListPendingPatchProposalsQuery({
  experimentId: "exp-storage",
  limit: 50
});

if (records.graphSnapshot) {
  await executeUpsertGraphSnapshotTransactionPlan(client, {
    graphSnapshot: records.graphSnapshot,
    nodes: records.reactionGraphNodes,
    edges: records.reactionGraphEdges
  });
}

await upsertPostgresRagChunkCitation(client, records.ragChunkCitations[0]);
await recordPostgresAgentRun(client, records.agentRuns[0]);

const graph = await loadPostgresGraphDetail(client, {
  graphSnapshotId: "graph-snapshot-1"
});
const patches = await listPendingPostgresPatchProposals(client, {
  experimentId: "exp-storage",
  limit: 50
});
```

`executeUpsertGraphSnapshotTransactionPlan()` issues `BEGIN`, the generated
graph upsert plan, then `COMMIT`; if any query throws, it issues `ROLLBACK` and
rethrows the original error. The other helpers execute a single parameterized
query or read rows and map snake_case PostgreSQL fields back to the existing
camelCase record types. JSONB fields are parsed when drivers return strings and
passed through when drivers return objects.

`persistPostgresRuntimeGraphRagRecords(client, input)` is the production helper
for fourth-round runtime bridge output. It accepts either
`PostgresRuntimeGraphRagRecords` or the same input accepted by
`buildPostgresRuntimeGraphRagRecords()`, then writes graph snapshot data, RAG
citations, Agent runs, tool calls, and patch proposals in one transaction. The
write order preserves foreign-key dependencies:

```text
snapshot
  -> nodes / edges
  -> RAG citations
  -> Agent runs
  -> Agent tool calls
  -> patch proposals
```

The helper still uses only the injected `PostgresGraphRagClient`, existing
query builders, and executor utilities. It does not create a pool, import `pg`,
read `process.env`, or add desktop-only tables.

If runtime code needs a broader transaction across core experiment writes,
graph writes, citations, and Agent audit records, run the query builders with
the transaction client owned by that runtime layer. This package does not open
connections, read `process.env`, or choose a transaction boundary beyond the
graph/RAG helper transactions.

The helpers target the shared extension tables:

- `chemd_reaction_graph_snapshots`
- `chemd_reaction_graph_nodes`
- `chemd_reaction_graph_edges`
- `chemd_rag_chunk_citations`
- `chemd_agent_runs`
- `chemd_agent_tool_calls`
- `chemd_patch_proposals`

They deliberately reuse the existing primary data model:

- experiments stay in `chemd_experiments`
- revisions stay in `chemd_experiment_revisions`
- compiled artifacts stay in `chemd_compile_artifacts`
- RAG chunks stay in `chemd_rag_chunks`
- graph citations reference `(revision_id, chunk_id)` in `chemd_rag_chunks`
- patch proposals point at existing base revisions

There are no desktop-only workspace, document, revision, RAG chunk, embedding,
or patch tables. Desktop IDE runtime code should compose these query builders
with the same PostgreSQL client and transaction boundaries used by the rest of
the app/server layer.

## Runtime Setup

Use `pnpm postgres:migrate` from the repository root to install the schema
against the configured PostgreSQL database. Use `pnpm postgres:smoke` to run
schema installation plus a minimal Chemd ingest and RAG chunk read-back.

For the desktop production runtime slice, use `pnpm desktop:runtime-smoke`.
The command checks the desktop build prerequisites without launching Tauri. If
no PostgreSQL URL is configured, it prints a clear `SKIP` reason and exits 0 so
CI and local checkouts can run it safely without secrets. If a database URL is
available, it reuses the PostgreSQL env loader, runs the schema/smoke path, and
prints only redacted connection target metadata.

Required database environment:

```text
CHEMD_POSTGRES_DATABASE_URL=postgres://chemd:change-me@localhost:15432/chemd
CHEMD_POSTGRES_SSL=false
```

Optional database tuning:

```text
CHEMD_POSTGRES_POOL_MAX=5
CHEMD_POSTGRES_IDLE_TIMEOUT_MS=30000
CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS=10000
CHEMD_POSTGRES_ALLOW_EXIT_ON_IDLE=true
```

For SSH tunnel development, keep a local TCP forward open:

```powershell
ssh -N -L 15432:127.0.0.1:15432 -p <ssh-port> <user>@<server-host>
```

The server must run PostgreSQL with pgvector available. The migration executes
`CREATE EXTENSION IF NOT EXISTS vector`, so the connected database user needs
permission to create the extension.

RAG query endpoints require an embedding gateway:

```text
CHEMD_EMBEDDING_BASE_URL=http://127.0.0.1:8000
CHEMD_EMBEDDING_PATH=/embeddings
CHEMD_EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
CHEMD_EMBEDDING_DIM=384
CHEMD_EMBEDDING_DISTANCE_METRIC=cosine
CHEMD_EMBEDDING_TIMEOUT_MS=30000
CHEMD_EMBEDDING_API_KEY=
```

The gateway receives `{ "input": "...", "model": "..." }` and may return
either `{ "embedding": [...] }` or an OpenAI-compatible
`{ "data": [{ "embedding": [...] }] }` response.

## Training Memory Loop MVP

The first memory-loop path derives deterministic training memory records from
persisted compile artifacts:

```text
after revision
  -> optional parent/before revision
  -> trainingUnderstanding comparison
  -> semantic diff
  -> training experience events
  -> correction pattern candidates
  -> Experiment Pattern Memory snapshot
  -> dataset projection
```

The pure transform is `buildTrainingMemoryRecords()` from
`@chemd/storage-postgres`. It does not read the database or environment.

The web runtime exposes:

```text
POST /api/chem/postgres/memory/loop
POST /api/chem/postgres/training/export
```

Request body:

```json
{
  "afterRevisionId": "rev-after",
  "beforeRevisionId": "rev-before"
}
```

`beforeRevisionId` is optional. If omitted, the runtime uses the
`parent_revision_id` on the after revision when present. The route writes
records to:

- `chemd_semantic_diffs`
- `chemd_training_experience_events`
- `chemd_correction_patterns`
- `chemd_experiment_pattern_memory`
- `chemd_dataset_projections`

After writing revision-pair snapshots and per-diff correction candidates, the
runtime recomputes aggregate correction patterns from
`chemd_training_experience_events`. Aggregate rows use deterministic
`correction::aggregate::*` IDs, and their `support_count` is derived from the
current event table rather than incremented per loop run. Rerunning the same
revision pair first removes stale rows for that semantic diff, and the
aggregate pass removes `correction::aggregate::*` rows that no longer have
supporting events.

## Training Export API

`POST /api/chem/postgres/training/export` reads persisted compile artifacts and
returns training-ready JSON with revision provenance. Requests must provide
exactly one bounded selector:

```json
{
  "experimentId": "exp-storage",
  "limit": 50,
  "includeCorrectionPatterns": true,
  "includeExperimentPatternMemory": true
}
```

`revisionId` can be used instead of `experimentId`. The runtime rejects
unbounded requests, caps `limit` at 100, orders revisions by creation time, and
only reads compile runs with `success` or `warning` status. Optional correction
patterns and Experiment Pattern Memory are scoped to the selected revision set.
