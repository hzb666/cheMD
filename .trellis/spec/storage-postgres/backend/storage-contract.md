# Storage Contract - @chemd/storage-postgres

## Scenario: PostgreSQL Experiment Persistence Contract

### 1. Scope / Trigger

- Trigger: changing PostgreSQL schema, pgvector storage, compiled-output
  record mapping, or future runtime writers for Chemd experiment persistence.
- Scope: `packages/storage-postgres/src`.
- Consumers: future `apps/web/src/server/chem/*` persistence services,
  `services/chem-service`, local RAG tooling, training dataset builders, and
  Git history mining jobs.

### 2. Signatures

Primary schema export:

```ts
export interface StorageMigration {
  id: string;
  description: string;
  sql: string;
}

export const storagePostgresMigrations: StorageMigration[];

export const getStoragePostgresSchemaSql = (): string;
```

Primary record mapper:

```ts
export interface BuildExperimentStorageInput {
  revisionId: string;
  source: string;
  sourceKind?: ExperimentSourceKind;
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  trainingExport: ChemdTrainingExportV2;
  ragExport: ChemdRagExportV1;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
  lnf?: ChemdLnf;
}

export const buildExperimentStorageRecords = (
  input: BuildExperimentStorageInput
) => ExperimentStorageRecords;
```

### 3. Contracts

The package is pure:

- no database driver
- no connection pool
- no environment reads
- no filesystem writes
- no embedding generation
- no `compileChemd()` call inside production mapping code

`buildExperimentStorageRecords()` must preserve the existing export boundaries:

```text
trainingExport
  -> chemd_compile_artifacts.training_export

trainingUnderstanding
  -> chemd_compile_artifacts.training_understanding
  -> chemd_semantic_entities
  -> chemd_semantic_relations
  -> chemd_field_evidence

ragExport
  -> chemd_compile_artifacts.rag_export
  -> chemd_rag_chunks

lnf
  -> chemd_compile_artifacts.lnf
```

Core tables in migration `0001_chemd_storage_core`:

```text
chemd_experiments
chemd_experiment_revisions
chemd_compile_runs
chemd_compile_artifacts
chemd_semantic_entities
chemd_semantic_relations
chemd_field_evidence
chemd_rag_chunks
chemd_embedding_models
chemd_rag_chunk_embeddings
chemd_semantic_diffs
chemd_training_experience_events
chemd_correction_patterns
chemd_experiment_pattern_memory
chemd_dataset_projections
```

The SQL schema must include:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

`chemd_rag_chunks` must key chunks by `(revision_id, chunk_id)`, and
`chemd_rag_chunk_embeddings` must key embeddings by
`(revision_id, chunk_id, embedding_model)`. The embedding table must reference
the revision-scoped chunk key so identical chunk IDs from different revisions
cannot collide.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Compile diagnostics include errors | `compileRun.status` is `"error"` |
| Compile diagnostics include warnings only | `compileRun.status` is `"warning"` |
| Compile diagnostics are empty | `compileRun.status` is `"success"` |
| `sourceKind` omitted | Default to `"chemd"` |
| `createdAt` omitted | Use `trainingExport.exported_at` |
| `compileRunId` omitted | Use `${revisionId}::compile` |
| Entity payload contains `original_id` | Preserve it on `SemanticEntityRecord.originalId` |
| Entity payload has no `original_id` | Leave `originalId` undefined |
| Training understanding contains artifacts | Persist them as `SemanticEntityRecord` rows with `entityType: "artifact"` |
| RAG chunk has metadata | Preserve metadata JSON without flattening |
| LNF omitted | Leave artifact `lnf` undefined |

### 5. Good/Base/Bad Cases

Good:

- A compiled document with molecule, reaction, result, artifact, semantic
  relation, field evidence, RAG chunks, and LNF maps to all record groups.

Base:

- A compiled document with only document summary still creates experiment,
  revision, compile run, compile artifact, and RAG chunk records.

Bad:

- Runtime writer must not infer missing semantic facts from raw source.
- Storage contract must not merge `trainingExport`, `ragExport`, and
  `trainingUnderstanding` into one opaque payload only.
- Storage package must not generate embeddings or execute SQL.

### 6. Tests Required

Tests must assert:

- `storagePostgresMigrations[0].id` is stable.
- SQL contains `CREATE EXTENSION IF NOT EXISTS vector`.
- SQL contains RAG embedding, Training Experience Memory, and Experiment
  Pattern Memory tables.
- `buildExperimentStorageRecords()` preserves experiment and revision IDs.
- `compileArtifact.trainingExport.schema_version` is
  `"chemd-training-export/v0.2"`.
- `compileArtifact.trainingUnderstanding.schema_version` is
  `"chemd-training-understanding/v0.1"`.
- Semantic entity records include reaction and artifact entities.
- Semantic relation records include `result_describes_reaction` when present.
- Field evidence includes training-relevant fields such as `yield_percent`.
- RAG chunk records preserve `revisionId`, `experimentId`, text, and metadata.

Required commands:

```bash
pnpm --filter @chemd/storage-postgres test
pnpm --filter @chemd/storage-postgres typecheck
pnpm exec eslint packages/storage-postgres/src --ext .ts
```

For broad changes, also run:

```bash
pnpm typecheck
pnpm test
```

### 7. Wrong vs Correct

#### Wrong

```ts
// Do not compile, connect, or generate embeddings inside the storage mapper.
const compiled = compileChemd(source);
await pool.query(sql, values);
const embedding = await embeddingClient.embed(chunk.text);
```

#### Correct

```ts
const records = buildExperimentStorageRecords({
  revisionId,
  source,
  trainingExport: compiled.trainingExport,
  trainingUnderstanding: compiled.trainingUnderstanding,
  ragExport: compiled.ragExport,
  lnf: compiled.lnf
});
```

Runtime services may consume `records`, open transactions, perform upserts,
and schedule embedding jobs.

## Scenario: Web Runtime PostgreSQL Writer

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/server/chem/postgres-storage.ts` or adding
  a real PostgreSQL client binding for Chemd persistence.
- Scope: runtime write orchestration only.
- Consumers: future API routes, background jobs, and local import scripts.

### 2. Signatures

```ts
export interface PostgresQueryClient {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
}

export interface SaveCompiledExperimentInput {
  client: PostgresQueryClient;
  source: string;
  revisionId: string;
  sourceKind?: BuildExperimentStorageInput["sourceKind"];
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  compileOptions?: CompileOptions;
}

export const installChemdStorageSchema = async (
  client: PostgresQueryClient
) => Promise<void>;

export const writeExperimentStorageRecords = async (
  client: PostgresQueryClient,
  records: ExperimentStorageRecords
) => Promise<void>;

export const saveCompiledExperiment = async (
  input: SaveCompiledExperimentInput
) => Promise<ExperimentStorageRecords>;
```

### 3. Contracts

Runtime writer responsibilities:

```text
source
  -> compileChemd(source)
  -> buildExperimentStorageRecords()
  -> transactional SQL writes
```

SQL write order:

```text
BEGIN
chemd_experiments
chemd_experiment_revisions
chemd_compile_runs
chemd_compile_artifacts
chemd_semantic_entities
chemd_semantic_relations
chemd_field_evidence
chemd_rag_chunks
COMMIT
```

The writer accepts an injected `PostgresQueryClient`. It must not create a
connection pool, read database URLs, or import `pg` directly. A later app-level
binding may adapt `pg.PoolClient` to this interface.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Schema installation requested | Execute `getStoragePostgresSchemaSql()` through the injected client |
| All writes succeed | Commit transaction and return `ExperimentStorageRecords` |
| Any write fails | Execute `ROLLBACK` and rethrow original error |
| `compileOptions` omitted | Use strict Chemd kind mode |
| `compileOptions` supplied | Caller can pass non-language-mode compile options |
| Embeddings needed | Schedule in later layer; this writer does not create vectors |

### 5. Good/Base/Bad Cases

Good:

- `saveCompiledExperiment()` compiles a source document, builds records, writes
  all core record groups in a transaction, and returns the records for callers
  that need IDs or follow-up embedding jobs.

Base:

- `installChemdStorageSchema()` can run against any object implementing
  `PostgresQueryClient`.

Bad:

- Do not open a global database connection inside `postgres-storage.ts`.
- Do not write RAG embeddings in the same function that writes RAG chunks.
- Do not continue after a failed insert; rollback and rethrow.

### 6. Tests Required

`apps/web/src/server/chem/postgres-storage.spec.ts` must assert:

- schema install SQL contains `CREATE EXTENSION IF NOT EXISTS vector`.
- write sequence begins with `BEGIN` and ends with `COMMIT`.
- experiment upsert occurs before revision insert.
- compile artifacts, semantic entities, and RAG chunks are written.
- injected `commitSha` and `revisionId` are preserved in returned records.
- failures trigger `ROLLBACK` and never `COMMIT`.

Required commands:

```bash
pnpm --filter @chemd/web test -- src/server/chem/postgres-storage.spec.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/server/chem/postgres-storage.ts apps/web/src/server/chem/postgres-storage.spec.ts --ext .ts
```

### 7. Wrong vs Correct

#### Wrong

```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query("BEGIN");
```

#### Correct

```ts
await saveCompiledExperiment({
  client,
  source,
  revisionId
});
```

The app composition layer owns `client`; the writer owns only compile, record
mapping, transaction order, and rollback behavior.

## Scenario: Web Runtime pgvector RAG Helpers

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/server/chem/postgres-rag.ts`, embedding
  write orchestration, or pgvector similarity retrieval.
- Scope: runtime embedding and retrieval helpers only.
- Consumers: future API routes, background embedding jobs, local RAG tooling,
  and training dataset builders.

### 2. Signatures

```ts
export interface EmbeddingProvider {
  embed(text: string): Promise<readonly number[]>;
}

export interface RagEmbeddingModelConfig {
  embeddingModel: string;
  embeddingDim: number;
  distanceMetric?: "cosine" | "l2" | "inner_product";
}

export const writeRagChunkEmbeddings = async (
  input: WriteRagChunkEmbeddingsInput
) => Promise<WrittenRagChunkEmbedding[]>;

export const searchSimilarRagChunks = async (
  input: SearchSimilarRagChunksInput
) => Promise<SimilarRagChunkResult[]>;
```

### 3. Contracts

Embedding write flow:

```text
RagChunkRecord[]
  -> EmbeddingProvider.embed(chunk.text)
  -> validate finite vector length against embeddingDim
  -> BEGIN
  -> upsert chemd_embedding_models
  -> upsert chemd_rag_chunk_embeddings with $n::vector
  -> COMMIT
```

Similarity search flow:

```text
query embedding
  -> validate finite vector length against embeddingDim
  -> SELECT joined chunk rows
  -> ORDER BY e.embedding <operator> $2::vector
  -> map PostgreSQL snake_case rows to SimilarRagChunkResult
```

The helper accepts injected `PostgresQueryClient` and `EmbeddingProvider`
instances. It must not create database pools, read environment variables, or
import concrete embedding SDKs.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| `embeddingModel` is blank | Throw before provider or SQL work |
| `embeddingDim` is not positive integer | Throw before provider or SQL work |
| `distanceMetric` is unsupported | Throw before provider or SQL work |
| Provider returns wrong vector length | Throw before SQL work |
| Provider returns `NaN` or infinite values | Throw before SQL work |
| SQL write fails | Execute `ROLLBACK` and rethrow original error |
| No chunks supplied | Return empty list without SQL writes |
| Search result lacks `rows` | Throw result-shape error |
| Search distance is string numeric | Convert to number |

### 5. Good/Base/Bad Cases

Good:

- A background job compiles and stores RAG chunks first, then calls
  `writeRagChunkEmbeddings()` with a concrete provider and injected database
  client.

Base:

- `searchSimilarRagChunks()` receives a precomputed query vector and returns
  chunk text, metadata, entity IDs, and distance for ranked retrieval.

Bad:

- Do not generate embeddings in `postgres-storage.ts`.
- Do not bind OpenAI, local model SDKs, or `pg.Pool` in `postgres-rag.ts`.
- Do not concatenate vector values directly into SQL text.

### 6. Tests Required

`apps/web/src/server/chem/postgres-rag.spec.ts` must assert:

- model metadata is upserted before chunk embeddings.
- chunk embedding inserts use `::vector` casts.
- invalid vector dimensions fail before SQL execution.
- write failures rollback and do not commit.
- search SQL uses pgvector distance ordering and filter clauses.
- search rows map to `SimilarRagChunkResult`.

Required commands:

```bash
pnpm --filter @chemd/web test -- src/server/chem/postgres-rag.spec.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/server/chem/postgres-rag.ts apps/web/src/server/chem/postgres-rag.spec.ts --ext .ts
```

### 7. Wrong vs Correct

#### Wrong

```ts
const embedding = await openai.embeddings.create({ input: chunk.text });
await pool.query(`... ${embedding.data[0].embedding} ...`);
```

#### Correct

```ts
await writeRagChunkEmbeddings({
  client,
  provider,
  chunks: records.ragChunks,
  model: {
    embeddingModel: "text-embedding-model",
    embeddingDim: 1536
  }
});
```

## Scenario: Web PostgreSQL Runtime Client

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/server/chem/postgres-client.ts`,
  PostgreSQL runtime env parsing, or the concrete `pg.Pool` adapter.
- Scope: app composition layer for database connectivity.
- Consumers: future API routes, import jobs, schema installers, storage writers,
  and embedding jobs.

### 2. Signatures

```ts
export interface PostgresRuntimeEnv {
  [key: string]: string | undefined;
  CHEMD_POSTGRES_DATABASE_URL?: string;
  DATABASE_URL?: string;
  CHEMD_POSTGRES_POOL_MAX?: string;
  CHEMD_POSTGRES_IDLE_TIMEOUT_MS?: string;
  CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS?: string;
  CHEMD_POSTGRES_ALLOW_EXIT_ON_IDLE?: string;
  CHEMD_POSTGRES_SSL?: string;
}

export interface PostgresRuntimeConfig {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  allowExitOnIdle?: boolean;
  ssl?: boolean;
}

export const parsePostgresRuntimeConfig = (
  env: PostgresRuntimeEnv
) => PostgresRuntimeConfig;

export const createPostgresPoolClient = (
  pool: PostgresPoolLike
) => PostgresRuntimeClient;

export const createPostgresRuntimeClient = (
  options?: CreatePostgresRuntimeClientOptions
) => PostgresRuntimeClient;
```

### 3. Contracts

Runtime client flow:

```text
env
  -> parsePostgresRuntimeConfig()
  -> new pg.Pool(config)
  -> createPostgresPoolClient(pool)
  -> PostgresQueryClient + close()
```

The concrete `pg` dependency belongs in `apps/web`. It must not be imported by
`@chemd/storage-postgres`, `postgres-storage.ts`, or `postgres-rag.ts`.

Environment precedence:

```text
CHEMD_POSTGRES_DATABASE_URL
DATABASE_URL
```

`createPostgresPoolClient()` adapts any pool-like object with `query()` and
`end()` methods. This allows tests, scripts, API routes, and background jobs to
share the same storage writers without each module creating its own pool.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| `CHEMD_POSTGRES_DATABASE_URL` exists | Use it as `connectionString` |
| `CHEMD_POSTGRES_DATABASE_URL` omitted and `DATABASE_URL` exists | Use `DATABASE_URL` |
| Both database URL vars omitted | Throw before creating a pool |
| Numeric pool option is blank | Omit option |
| Numeric pool option is non-positive or non-integer | Throw before creating a pool |
| Boolean option is `true/false/1/0/yes/no/on/off` | Parse to boolean |
| Boolean option has another value | Throw before creating a pool |
| Query executed through runtime client | Forward SQL and values to pool |
| Client shutdown requested | Call `pool.end()` |

### 5. Good/Base/Bad Cases

Good:

- API composition code calls `createPostgresRuntimeClient()` once and passes the
  resulting client to `installChemdStorageSchema()`, `saveCompiledExperiment()`,
  or `writeRagChunkEmbeddings()`.

Base:

- Tests pass a fake `PostgresPoolConstructor` to verify config and forwarding
  without opening a real database connection.

Bad:

- Do not create a new pool inside each storage function call.
- Do not read database URLs in package-level storage contract code.
- Do not silently continue with missing database configuration.

### 6. Tests Required

`apps/web/src/server/chem/postgres-client.spec.ts` must assert:

- Chemd-specific env vars parse into pool config.
- `DATABASE_URL` fallback works.
- missing URL, invalid numeric options, and invalid boolean options throw.
- injected pool constructor receives parsed config.
- `query()` forwards SQL and values.
- `close()` calls `pool.end()`.

Required commands:

```bash
pnpm --filter @chemd/web test -- src/server/chem/postgres-client.spec.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/server/chem/postgres-client.ts apps/web/src/server/chem/postgres-client.spec.ts --ext .ts
```

## Scenario: Web PostgreSQL Ingest Service

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/server/chem/postgres-ingest-service.ts`
  or the orchestration between schema installation, experiment persistence,
  runtime clients, and optional embedding writes.
- Scope: app-level ingest orchestration only.
- Consumers: future API routes, import jobs, local ingest scripts, and
  background embedding jobs.

### 2. Signatures

```ts
export interface PostgresEmbeddingWriteOptions {
  provider: EmbeddingProvider;
  model: RagEmbeddingModelConfig;
}

export interface PersistChemdExperimentInput {
  client: PostgresQueryClient;
  source: string;
  revisionId: string;
  sourceKind?: BuildExperimentStorageInput["sourceKind"];
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  installSchema?: boolean;
  embedding?: PostgresEmbeddingWriteOptions;
}

export const persistChemdExperiment = async (
  input: PersistChemdExperimentInput
) => Promise<PersistChemdExperimentResult>;

export const persistChemdExperimentWithRuntime = async (
  input: PersistChemdExperimentWithRuntimeInput
) => Promise<PersistChemdExperimentResult>;
```

### 3. Contracts

Injected-client ingest flow:

```text
optional installChemdStorageSchema(client)
  -> saveCompiledExperiment({ client, source, revisionId, ... })
  -> optional writeRagChunkEmbeddings({ client, chunks: records.ragChunks, ... })
  -> PersistChemdExperimentResult
```

Runtime-client ingest flow:

```text
createPostgresRuntimeClient(runtime)
  -> persistChemdExperiment({ client, ... })
  -> client.close() in finally
```

This service must not build SQL strings, create embedding vectors itself, or
bind a concrete embedding SDK. Core experiment persistence and embedding writes
remain separate transactions. If embeddings fail after records are persisted,
the core experiment record remains committed and the embedding error is
rethrown.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| `installSchema` is true | Install schema before any record write |
| `installSchema` is omitted or false | Skip schema installation |
| `embedding` is omitted | Persist records and return empty embeddings |
| `embedding` is supplied | Write embeddings after RAG chunks are persisted |
| Core persistence fails | Rethrow persistence error and do not write embeddings |
| Embedding write fails | Rethrow embedding error after core records commit |
| Runtime wrapper succeeds | Close runtime client in `finally` |
| Runtime wrapper fails | Close runtime client in `finally` before rethrow |

### 5. Good/Base/Bad Cases

Good:

- A job calls `persistChemdExperimentWithRuntime()` with database env and a
  model provider supplied by the job composition layer.

Base:

- Tests call `persistChemdExperiment()` with a fake `PostgresQueryClient` to
  verify operation order without a real database.

Bad:

- Do not call `new Pool()` inside the lower-level storage or RAG helpers.
- Do not retry or swallow embedding write failures in this service.
- Do not merge core record persistence and embedding writes into one opaque
  operation without separate result fields.

### 6. Tests Required

`apps/web/src/server/chem/postgres-ingest-service.spec.ts` must assert:

- schema install runs before record persistence when requested.
- embedding writes happen after RAG chunk persistence.
- schema and embedding work are skipped by default.
- embedding failure leaves one core persistence commit and rolls back embedding
  writes.
- runtime wrapper closes the client when persistence fails.

Required commands:

```bash
pnpm --filter @chemd/web test -- src/server/chem/postgres-ingest-service.spec.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/server/chem/postgres-ingest-service.ts apps/web/src/server/chem/postgres-ingest-service.spec.ts --ext .ts
```

## Scenario: Web PostgreSQL Ingest API Route

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/app/api/chem/postgres/ingest/route.ts`,
  `apps/web/src/server/chem/postgres-ingest-route.ts`, or the HTTP contract
  around PostgreSQL experiment ingest.
- Scope: route boundary only.
- Consumers: internal tools, local import clients, and future ingestion jobs
  that need a stable HTTP entry point.

### 2. Signatures

```ts
export const POST = async (request: Request): Promise<Response>;

export const parsePostgresIngestRouteInput = async (
  request: Request
) => Promise<PostgresIngestRouteInput | Response>;

export const buildPostgresIngestRouteResult = (
  result: PersistChemdExperimentResult
) => JsonRouteResult<PostgresIngestRouteResponse>;

export const postgresIngestErrorResponse = (error: unknown): Response;
```

Route JSON input:

```ts
{
  source: string;
  revisionId: string;
  sourceKind?: "chemd" | "patent_xml" | "paper_pdf" | "ocr_text" | "external_import";
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  installSchema?: boolean;
}
```

Route JSON response:

```ts
{
  experimentId: string;
  revisionId: string;
  compileRunId: string;
  schemaInstalled: boolean;
  embeddings: { count: number };
  records: {
    semanticEntities: number;
    semanticRelations: number;
    fieldEvidence: number;
    ragChunks: number;
  };
}
```

### 3. Contracts

HTTP ingest flow:

```text
POST /api/chem/postgres/ingest
  -> parseJsonObjectBody(request)
  -> narrow source, revisionId, sourceKind, installSchema
  -> persistChemdExperimentWithRuntime(input)
  -> buildPostgresIngestRouteResult(result)
```

The route must stay thin: it parses untrusted JSON, delegates persistence to
`persistChemdExperimentWithRuntime()`, and serializes a compact summary. It must
not create a `pg.Pool`, compile Chemd directly, build SQL, or bind an embedding
provider. Because this route depends on PostgreSQL through `pg`, it must use
the Node.js runtime.

`source` must preserve caller-provided leading and trailing whitespace after
validation so raw experiment source is stored exactly as submitted.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Body is not a JSON object | Return `400` |
| `source` is missing or blank | Return `400` |
| `revisionId` is missing or blank | Return `400` |
| `sourceKind` is unknown | Return `400` |
| `installSchema` is provided but not boolean | Return `400` |
| Runtime database URL is missing | Return `500` with `E_POSTGRES_CONFIG` |
| Persistence throws | Return `502` with `E_POSTGRES_INGEST` |
| Persistence succeeds | Return `201` with ids and record counts |

### 5. Good/Base/Bad Cases

Good:

- An import tool posts a Chemd source and revision metadata, and receives a
  compact summary containing `experimentId`, `revisionId`, and record counts.

Base:

- Tests mock `persistChemdExperimentWithRuntime()` and assert the route forwards
  accepted fields without opening PostgreSQL.

Bad:

- Do not trim or normalize the raw `source` before handing it to persistence.
- Do not accept string values such as `"true"` for `installSchema`.
- Do not add embedding provider credentials or SDK construction to this route.

### 6. Tests Required

`apps/web/tests/postgres-ingest-route.test.ts` must assert:

- success calls `persistChemdExperimentWithRuntime()` with narrowed fields.
- invalid JSON returns `400`.
- missing `source` or `revisionId` returns `400`.
- invalid `sourceKind` and `installSchema` return `400`.
- missing PostgreSQL config maps to `500` and `E_POSTGRES_CONFIG`.
- persistence failures map to `502` and `E_POSTGRES_INGEST`.

Required commands:

```bash
pnpm --filter @chemd/web test -- tests/postgres-ingest-route.test.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/app/api/chem/postgres/ingest/route.ts apps/web/src/server/chem/postgres-ingest-route.ts apps/web/tests/postgres-ingest-route.test.ts --ext .ts
```

## Scenario: Web PostgreSQL RAG Search API Route

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/app/api/chem/postgres/rag/search/route.ts`,
  `apps/web/src/server/chem/postgres-rag-search-route.ts`, or
  `apps/web/src/server/chem/postgres-rag-search-service.ts`.
- Scope: HTTP retrieval boundary and runtime-client wrapper for pgvector search.
- Consumers: internal retrieval tools, future chat/RAG workflows, and training
  dataset builders that need ranked chunk retrieval.

### 2. Signatures

```ts
export const POST = async (request: Request): Promise<Response>;

export const parseRagSearchRouteInput = async (
  request: Request
) => Promise<RagSearchRouteInput | Response>;

export const searchSimilarRagChunksWithRuntime = async (
  input: SearchSimilarRagChunksWithRuntimeInput
) => Promise<SimilarRagChunkResult[]>;
```

Route JSON input:

```ts
{
  embedding: number[];
  embeddingModel: string;
  embeddingDim: number;
  distanceMetric?: "cosine" | "l2" | "inner_product";
  limit?: number;
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: (
    | "markdown"
    | "reaction_summary"
    | "result_notes"
    | "analysis_notes"
    | "sample_notes"
    | "artifact_notes"
    | "condition_variation"
    | "condition_variation_attempt"
    | "document_summary"
  )[];
}
```

Route JSON response:

```ts
{
  model: {
    embeddingModel: string;
    embeddingDim: number;
    distanceMetric: "cosine" | "l2" | "inner_product";
  };
  count: number;
  results: SimilarRagChunkResult[];
}
```

### 3. Contracts

HTTP RAG search flow:

```text
POST /api/chem/postgres/rag/search
  -> requireMatchingSessionToken(request)
  -> parseJsonObjectBody(request)
  -> validate model config, vector, filters, limit <= 100, embeddingDim <= 4096
  -> searchSimilarRagChunksWithRuntime(input)
  -> createPostgresRuntimeClient(runtime)
  -> searchSimilarRagChunks({ client, ...input })
  -> client.close() in finally
  -> buildRagSearchRouteResult(input, results)
```

The route accepts a precomputed embedding vector. It must not generate the query
embedding, bind OpenAI/local model SDKs, or store credentials. Query-string to
embedding conversion belongs in a later provider binding or job composition
layer.

The route must use the Node.js runtime because `pg.Pool` is used beneath the
runtime client. The runtime wrapper must close the client on both success and
failure.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Body is not a JSON object | Return `400` |
| `embeddingModel` is missing or blank | Return `400` |
| `embeddingDim` is non-integer or non-positive | Return `400` |
| `embedding` length differs from `embeddingDim` | Return `400` |
| `embedding` contains non-finite values | Return `400` |
| `distanceMetric` is unknown | Return `400` |
| `limit` is provided but non-positive | Return `400` |
| `chunkTypes` contains an unknown value | Return `400` |
| Runtime database URL is missing | Return `500` with `E_POSTGRES_CONFIG` |
| pgvector search throws | Return `502` with `E_POSTGRES_RAG_SEARCH` |
| Search succeeds | Return `200` with model metadata, count, and results |

### 5. Good/Base/Bad Cases

Good:

- A retrieval client embeds a question externally, posts the vector and model
  metadata, and receives ranked chunks with distance values.

Base:

- Tests mock `searchSimilarRagChunksWithRuntime()` to verify route validation,
  and test the runtime wrapper with a fake pool to prove `close()` runs.

Bad:

- Do not accept a `query` string in this route before an embedding provider
  binding exists.
- Do not allow arbitrary chunk type strings into SQL filters.
- Do not return raw PostgreSQL rows without mapping through
  `SimilarRagChunkResult`.

### 6. Tests Required

`apps/web/tests/postgres-rag-search-route.test.ts` must assert:

- success calls `searchSimilarRagChunksWithRuntime()` with narrowed fields.
- invalid JSON returns `400`.
- missing model or dimension returns `400`.
- invalid vector shape returns `400`.
- invalid metric, limit, and chunk type return `400`.
- missing PostgreSQL config maps to `500` and `E_POSTGRES_CONFIG`.
- search failures map to `502` and `E_POSTGRES_RAG_SEARCH`.

`apps/web/src/server/chem/postgres-rag-search-service.spec.ts` must assert:

- runtime search forwards model/vector/filter values to pgvector search.
- runtime client closes on success.
- runtime client closes when search fails.

Required commands:

```bash
pnpm --filter @chemd/web test -- tests/postgres-rag-search-route.test.ts src/server/chem/postgres-rag-search-service.spec.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/app/api/chem/postgres/rag/search/route.ts apps/web/src/server/chem/postgres-rag-search-route.ts apps/web/src/server/chem/postgres-rag-search-service.ts apps/web/src/server/chem/postgres-rag-search-service.spec.ts apps/web/tests/postgres-rag-search-route.test.ts --ext .ts
```

## Scenario: Web PostgreSQL RAG Query API Route

### 1. Scope / Trigger

- Trigger: changing `apps/web/src/app/api/chem/postgres/rag/query/route.ts`,
  `apps/web/src/server/chem/postgres-embedding-provider.ts`,
  `apps/web/src/server/chem/postgres-rag-query-route.ts`, or
  `apps/web/src/server/chem/postgres-rag-query-service.ts`.
- Scope: text-query retrieval boundary over stored pgvector RAG chunks.
- Consumers: future chat/RAG workflows, import review tools, and training data
  inspection tools.

### 2. Signatures

```ts
export const createRuntimeEmbeddingProvider = (
  options?: CreateRuntimeEmbeddingProviderOptions
) => RuntimeEmbeddingProvider;

export const searchRagChunksByQuery = async (
  input: SearchRagChunksByQueryInput
) => Promise<SearchRagChunksByQueryResult>;

export const POST = async (request: Request): Promise<Response>;
```

Embedding provider env:

```ts
{
  CHEMD_EMBEDDING_BASE_URL: string;
  CHEMD_EMBEDDING_MODEL: string;
  CHEMD_EMBEDDING_DIM: string;
  CHEMD_EMBEDDING_PATH?: string;
  CHEMD_EMBEDDING_API_KEY?: string;
  CHEMD_EMBEDDING_TIMEOUT_MS?: string;
  CHEMD_EMBEDDING_DISTANCE_METRIC?: "cosine" | "l2" | "inner_product";
}
```

Route JSON input:

```ts
{
  query: string;
  limit?: number;
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: (
    | "markdown"
    | "reaction_summary"
    | "result_notes"
    | "analysis_notes"
    | "sample_notes"
    | "artifact_notes"
    | "condition_variation"
    | "condition_variation_attempt"
    | "document_summary"
  )[];
}
```

Route JSON response:

```ts
{
  query: string;
  model: {
    embeddingModel: string;
    embeddingDim: number;
    distanceMetric: "cosine" | "l2" | "inner_product";
  };
  count: number;
  results: SimilarRagChunkResult[];
}
```

### 3. Contracts

HTTP RAG query flow:

```text
POST /api/chem/postgres/rag/query
  -> requireMatchingSessionToken(request)
  -> parseJsonObjectBody(request)
  -> validate query <= 2000 chars, filters, limit <= 100
  -> createRuntimeEmbeddingProvider(process.env)
  -> POST { input, model } to embedding gateway
  -> validate response vector length and finite values
  -> searchSimilarRagChunksWithRuntime({ embedding, model, filters })
  -> close PostgreSQL runtime client in finally
  -> buildRagQueryRouteResult(result)
```

The embedding provider is an HTTP gateway contract. It sends:

```json
{ "input": "<query text>", "model": "<configured model>" }
```

It accepts either:

```json
{ "embedding": [0.1, 0.2, 0.3] }
```

or an OpenAI-compatible response shape:

```json
{ "data": [{ "embedding": [0.1, 0.2, 0.3] }] }
```

The route and provider must not hard-code credentials. If
`CHEMD_EMBEDDING_API_KEY` is set, the provider sends it as a bearer token.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Body is not a JSON object | Return `400` |
| `query` is missing or blank | Return `400` |
| `limit` is provided but non-positive | Return `400` |
| `chunkTypes` contains an unknown value | Return `400` |
| Embedding env is missing or invalid | Return `500` with `E_EMBEDDING_CONFIG` |
| PostgreSQL database URL is missing | Return `500` with `E_POSTGRES_CONFIG` |
| Embedding provider returns non-OK | Return `502` with `E_POSTGRES_RAG_QUERY` |
| Embedding vector dimension is wrong | Return `502` with `E_POSTGRES_RAG_QUERY` |
| Query succeeds | Return `200` with model metadata, count, and results |

### 5. Good/Base/Bad Cases

Good:

- A RAG client posts `{ query: "ethanol yield", chunkTypes: ["result_notes"] }`
  and receives ranked stored chunks.

Base:

- Tests inject a fake embedding `fetchImpl` and fake PostgreSQL pool so no
  external network or database is required.

Bad:

- Do not embed inside `postgres-rag.ts`; that helper only consumes vectors.
- Do not place model API keys in route code or tests.
- Do not skip vector validation before calling pgvector search.

### 6. Tests Required

`apps/web/src/server/chem/postgres-embedding-provider.spec.ts` must assert:

- runtime env parsing trims and validates provider config.
- provider sends `{ input, model }` with bearer token when configured.
- Chemd gateway and OpenAI-compatible response shapes are accepted.
- missing config and invalid response dimensions are rejected.

`apps/web/src/server/chem/postgres-rag-query-service.spec.ts` must assert:

- query text is embedded, the generated vector reaches pgvector search, and the
  runtime PostgreSQL client closes.

`apps/web/tests/postgres-rag-query-route.test.ts` must assert:

- success forwards query and filters to `searchRagChunksByQuery()`.
- invalid JSON and missing query return `400`.
- invalid limit and chunk type return `400`.
- missing embedding config maps to `500` and `E_EMBEDDING_CONFIG`.
- missing PostgreSQL config maps to `500` and `E_POSTGRES_CONFIG`.
- provider/search failures map to `502` and `E_POSTGRES_RAG_QUERY`.

Required commands:

```bash
pnpm --filter @chemd/web test -- src/server/chem/postgres-embedding-provider.spec.ts src/server/chem/postgres-rag-query-service.spec.ts tests/postgres-rag-query-route.test.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/app/api/chem/postgres/rag/query/route.ts apps/web/src/server/chem/postgres-embedding-provider.ts apps/web/src/server/chem/postgres-embedding-provider.spec.ts apps/web/src/server/chem/postgres-rag-query-route.ts apps/web/src/server/chem/postgres-rag-query-service.ts apps/web/src/server/chem/postgres-rag-query-service.spec.ts apps/web/tests/postgres-rag-query-route.test.ts --ext .ts
```

## Scenario: PostgreSQL Migration and Smoke Scripts

### 1. Scope / Trigger

- Trigger: changing `scripts/postgres-*.mjs`, root package scripts, or local
  PostgreSQL runtime setup documentation.
- Scope: command-line composition only.
- Consumers: local development, CI smoke jobs, deployment runbooks, and future
  import/training pipelines.

### 2. Signatures

```js
export const parseEnvContent = (content) => Record<string, string>;
export const loadPostgresEnv = (options?) => {
  env: Record<string, string>;
  loadedFiles: string[];
};
export const runPostgresMigration = async ({ client }) => {
  vectorInstalled: boolean;
};
export const runPostgresSmoke = async ({ client, revisionId? }) => {
  experimentId: string;
  revisionId: string;
  compileRunId: string;
  ragChunks: number;
  firstChunkId: string;
};
```

CLI commands:

```bash
pnpm postgres:migrate
pnpm postgres:smoke
```

### 3. Contracts

Environment loading order:

```text
root .env
root .env.local
apps/web/.env
apps/web/.env.local
process.env override
```

Migration flow:

```text
env -> createPostgresRuntimeClient()
  -> installChemdStorageSchema()
  -> verify pg_extension has vector
  -> close client
```

Smoke flow:

```text
migration flow
  -> persistChemdExperiment()
  -> count chemd_rag_chunks by revision_id
  -> read one persisted chunk
  -> close client
```

Scripts may print command progress with `console.log`, but must not print
database passwords, full connection strings, API keys, or raw environment
objects.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Database URL missing | Throw clear configuration error before connecting |
| Env files exist | Merge supported files and keep process env precedence |
| Schema install succeeds | Verify `pg_extension.extname = 'vector'` |
| pgvector missing after migration | Throw smoke/migration failure |
| Smoke ingest succeeds | Return experiment id, revision id, and chunk count |
| No RAG chunks read back | Throw smoke failure |
| Any runtime operation fails | Close PostgreSQL client in `finally` |

### 5. Good/Base/Bad Cases

Good:

- `pnpm postgres:smoke` runs against the SSH-tunneled database and proves
  schema installation, ingest, and RAG chunk read-back with one command.

Base:

- Script tests inject a fake client and fake runtime modules so CI does not
  require a real PostgreSQL service.

Bad:

- Do not duplicate storage writer SQL in the scripts.
- Do not require embedding provider env for the core smoke path.
- Do not log secrets while reporting loaded env file names.

### 6. Tests Required

`scripts/postgres-tools.test.mjs` must assert:

- env parsing supports comments, `export`, and quoted values.
- env loading supports root and `apps/web` env files with process override.
- missing database URL throws a clear error.
- migration installs schema and verifies pgvector through a fake client.
- smoke migrates, persists, counts chunks, and reads one chunk.

Required commands:

```bash
pnpm run test:scripts
pnpm postgres:migrate
pnpm postgres:smoke
pnpm typecheck
pnpm lint
pnpm test
```

## Scenario: Web PostgreSQL RAG Embedding Backfill API Route

### 1. Scope / Trigger

- Trigger: changing
  `apps/web/src/app/api/chem/postgres/rag/backfill/route.ts`,
  `apps/web/src/server/chem/postgres-rag-backfill-route.ts`, or
  `apps/web/src/server/chem/postgres-rag-backfill-service.ts`.
- Scope: server-side embedding backfill over already-persisted RAG chunks.
- Consumers: local admin tooling, future background workers, and training/RAG
  maintenance jobs.

### 2. Signatures

```ts
export interface BackfillRagChunkEmbeddingsInput {
  client: PostgresQueryClient;
  provider: EmbeddingProvider;
  model: RagEmbeddingModelConfig;
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: readonly RagChunkRecord["chunkType"][];
  limit?: number;
  overwriteExisting?: boolean;
}

export const backfillRagChunkEmbeddings = async (
  input: BackfillRagChunkEmbeddingsInput
) => Promise<BackfillRagChunkEmbeddingsResult>;

export const backfillRagChunkEmbeddingsWithRuntime = async (
  input: BackfillRagChunkEmbeddingsWithRuntimeInput
) => Promise<BackfillRagChunkEmbeddingsResult>;
```

Route JSON input:

```ts
{
  experimentId?: string;
  revisionId?: string;
  chunkTypes?: RagChunkRecord["chunkType"][];
  limit?: number;
  overwriteExisting?: boolean;
}
```

Route JSON response:

```ts
{
  model: {
    embeddingModel: string;
    embeddingDim: number;
    distanceMetric: "cosine" | "l2" | "inner_product";
  };
  selected: number;
  embedded: number;
  skippedExisting: number;
  embeddings: { count: number; chunkIds: string[] };
}
```

### 3. Contracts

Backfill flow:

```text
POST /api/chem/postgres/rag/backfill
  -> requireMatchingSessionToken(request)
  -> parseJsonObjectBody(request)
  -> validate bounded selection and limit <= 100
  -> createRuntimeEmbeddingProvider(process.env)
  -> createPostgresRuntimeClient(process.env)
  -> SELECT chemd_rag_chunks with optional filters
  -> skip existing model embeddings unless overwriteExisting
  -> writeRagChunkEmbeddings()
  -> close PostgreSQL runtime client in finally
```

The service accepts injected `PostgresQueryClient` and `EmbeddingProvider`.
It must not duplicate pgvector insert SQL; embedding writes go through
`writeRagChunkEmbeddings()`.

Selection must be bounded by at least one of:

```text
revisionId
experimentId
limit
```

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Body is not a JSON object | Return `400` |
| No `revisionId`, `experimentId`, or `limit` | Return `400` |
| `limit` is non-positive or non-integer | Return `400` |
| `overwriteExisting` is not boolean | Return `400` |
| `chunkTypes` contains unknown value | Return `400` |
| Existing embedding and no overwrite | Count as `skippedExisting` |
| `overwriteExisting` is true | Recompute and upsert same model embedding |
| Embedding env is missing or invalid | Return `500` with `E_EMBEDDING_CONFIG` |
| PostgreSQL database URL is missing | Return `500` with `E_POSTGRES_CONFIG` |
| Provider or pgvector write fails | Return `502` with `E_POSTGRES_RAG_BACKFILL` |

### 5. Good/Base/Bad Cases

Good:

- A local admin tool posts `{ "revisionId": "rev-1" }` and receives selected,
  embedded, skipped counts plus written chunk IDs.

Base:

- Posting `{ "limit": 10 }` is allowed for bounded maintenance batches.

Bad:

- Do not run unbounded backfills without `revisionId`, `experimentId`, or
  `limit`.
- Do not return embedding vectors from the route response.
- Do not create embeddings before RAG chunks are stored.

### 6. Tests Required

`apps/web/src/server/chem/postgres-rag-backfill-service.spec.ts` must assert:

- service selects chunks and writes via `writeRagChunkEmbeddings()`.
- existing embeddings are skipped unless overwrite is requested.
- empty selection returns a zero-count summary without embedding calls.
- unbounded selection fails before SQL.
- runtime wrapper closes the PostgreSQL client.

`apps/web/tests/postgres-rag-backfill-route.test.ts` must assert:

- route forwards trimmed filters and returns `202`.
- invalid JSON and unbounded selection return `400`.
- invalid `limit`, `overwriteExisting`, and `chunkTypes` return `400`.
- missing embedding config maps to `E_EMBEDDING_CONFIG`.
- missing PostgreSQL config maps to `E_POSTGRES_CONFIG`.
- provider/search failures map to `E_POSTGRES_RAG_BACKFILL`.

Required commands:

```bash
pnpm --filter @chemd/web test -- src/server/chem/postgres-rag-backfill-service.spec.ts tests/postgres-rag-backfill-route.test.ts
pnpm --filter @chemd/web typecheck
pnpm exec eslint apps/web/src/app/api/chem/postgres/rag/backfill/route.ts apps/web/src/server/chem/postgres-rag-backfill-route.ts apps/web/src/server/chem/postgres-rag-backfill-service.ts apps/web/src/server/chem/postgres-rag-backfill-service.spec.ts apps/web/tests/postgres-rag-backfill-route.test.ts --ext .ts
```
