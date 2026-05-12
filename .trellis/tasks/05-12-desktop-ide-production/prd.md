# Desktop IDE Production Implementation

## Goal

Build the first production-oriented implementation slice for Chemd Desktop IDE on top of the `desktop-ide` architecture baseline.

## Requirements

- Keep `desktop-ide` as the integration branch.
- Use isolated worktrees and branches for parallel implementation.
- Keep `apps/web` and existing playground behavior intact.
- Do not wrap the current Next.js runtime as the desktop product.
- Preserve `compileChemd()` as the semantic source of truth.
- Preserve PostgreSQL as the durable knowledge backend.
- Keep `chem-service` as a managed sidecar boundary.
- Require Agent changes to use patch proposals and approval gates.

## Parallel Slices

1. `desktop-ide-shell`
   - Owns `apps/desktop/**`.
   - Creates the Tauri/Vite/React shell skeleton.

2. `desktop-ide-language-service`
   - Owns `packages/language-service/**`.
   - Creates the compiler-backed language service contract.

3. `desktop-ide-postgres-graph-rag`
   - Owns `packages/storage-postgres/**`.
   - Extends pure storage contracts for Graph/RAG/revisions/audit.

4. `desktop-ide-agent-tools`
   - Owns `packages/agent-tools/**`.
   - Creates pure Agent tool contracts and safety gates.

## Second-Wave Productionization Slices

The first wave established the production boundaries. The second wave turns
those boundaries into directly usable local IDE behavior while keeping ownership
isolated.

1. `desktop-ide-workspace-io`
   - Owns `apps/desktop/src-tauri/**`.
   - Replaces placeholder workspace commands with safe local directory, file
     listing, read, and write commands.
   - Rejects path traversal and reports structured frontend-displayable errors.

2. `desktop-ide-workbench-ui`
   - Owns `apps/desktop/src/App.tsx` and `apps/desktop/src/styles/**`.
   - Connects the shell to `@chemd/language-service` diagnostics, outline, and
     quick-fix data.
   - Keeps the UI close to the web product language: dense, calm, and
     workbench-first.

3. `desktop-ide-postgres-graph-repository`
   - Owns `packages/storage-postgres/src/graph-rag-*`.
   - Adds repository/query helpers for graph snapshots, RAG chunk citations,
     agent runs, tool calls, and patch proposals.
   - Must keep the schema generic and reuse `chemd_experiments`,
     `chemd_experiment_revisions`, and `chemd_rag_chunks`.

4. `desktop-ide-agent-orchestration`
   - Owns `packages/agent-tools/**`.
   - Adds deterministic local orchestration helpers and an audit timeline.
   - Does not connect a real LLM provider or require secrets.

## Acceptance Criteria

- Each slice compiles or reports exact environment blockers.
- Each slice runs `git diff --check`.
- Each slice commits to its branch with a Chinese commit message.
- Integration branch merges reviewed slices only.
- Shared root config or lockfile changes are reviewed centrally.
- Final integration reports targeted verification and remaining gaps.

## Non-Goals

- No production UI polish pass beyond shell skeleton.
- No real LLM provider integration.
- No real sidecar packaging finalization.
- No PostgreSQL runtime connection implementation in `@chemd/storage-postgres`.
- No silent Agent file writes.

## Updated Acceptance Criteria

- Desktop workspace commands perform real local file operations safely.
- The React workbench can display a real or sample document with language-service
  diagnostics and outline data.
- Graph/RAG repository helpers use parameterized SQL and do not introduce
  `desktop_*` or `chemd_desktop_*` tables.
- Agent orchestration blocks illegal state transitions and uncited patch apply
  decisions.
- Final integration runs targeted package tests, desktop build/typecheck, Rust
  checks, root `pnpm typecheck`, root `pnpm test`, and `git diff --check`.

## Third-Wave Production Runtime Slices

The third wave closes the remaining runtime gaps without reintroducing a wrapped
web app architecture.

1. `desktop-ide-sidecar-runtime`
   - Owns `apps/desktop/src-tauri/**` and `apps/desktop/src/desktop-contracts.ts`.
   - Adds chem-service sidecar lifecycle commands with explicit start, stop,
     status, and log tail behavior.
   - Only manages processes it started; it must not kill unrelated user
     processes.

2. `desktop-ide-agent-pane`
   - Owns `apps/desktop/src/App.tsx` and desktop CSS files.
   - Uses `@chemd/agent-tools` to turn diagnostics/quick fixes into local agent
     runs, patch proposals, approval decisions, and audit timeline entries.
   - Applies patches only through explicit user approval.

3. `desktop-ide-postgres-executor`
   - Owns `packages/storage-postgres/src/graph-rag-*`,
     `packages/storage-postgres/src/index.ts`, and
     `packages/storage-postgres/README.md`.
   - Adds executor and row-mapping helpers around the existing parameterized
     Graph/RAG query builders.
   - Keeps all tables generic and shared with the main PostgreSQL model.

4. `desktop-ide-graph-records`
   - Owns `packages/language-service/**`.
   - Adds compiler-output-to-Graph/RAG record generation helpers for desktop and
     server runtimes to persist graph snapshots and citation sidecars.
   - Does not touch storage schema or desktop UI.

## Third-Wave Acceptance Criteria

- Desktop can start/stop/status the local chem-service sidecar boundary.
- Desktop Agent pane creates auditable local runs and approved patch proposals
  from real language-service diagnostics/quick fixes.
- Graph/RAG query builders can be executed through a typed client interface and
  map rows back into domain records.
- Language-service can produce graph/RAG storage records from a compiled source
  without direct database access.
- Final verification includes targeted package tests, desktop build,
  `cargo test`, `cargo check`, root `pnpm typecheck`, root `pnpm test`,
  `tauri:build`, and `git diff --check`.

## Fourth-Wave Production Hardening Slices

The fourth wave removes the last placeholder-quality runtime gaps while keeping
the desktop app aligned with the existing web architecture and PostgreSQL data
model.

1. `desktop-ide-sidecar-health`
   - Owns `apps/desktop/src-tauri/src/sidecar*`.
   - Promotes sidecar `ready` from "process spawned" to health-probed
     readiness via the chem-service `/healthz` endpoint.
   - Uses bounded retry and timeout behavior; never kills unrelated processes.

2. `desktop-ide-runtime-controls`
   - Owns `apps/desktop/src/App.tsx` and desktop CSS files.
   - Adds compact workbench controls for start, stop, refresh, and log tail
     inspection.
   - Keeps UI styling consistent with the web workbench language.

3. `desktop-ide-postgres-runtime-adapters`
   - Owns `packages/storage-postgres/src/graph-rag-*`.
   - Adds structural adapter helpers that convert editor Graph/RAG DTOs and
     agent run data into existing PostgreSQL executor inputs.
   - Must not introduce desktop-specific tables or a direct dependency on
     desktop packages.

## Fourth-Wave Acceptance Criteria

- Sidecar `ready` status is backed by a successful `/healthz` response or a
  clearly degraded status with pid/log evidence.
- Desktop users can operate the sidecar lifecycle from the IDE without racing
  concurrent commands or losing visible error context.
- Graph/RAG and Agent runtime persistence can be prepared from existing DTOs
  without ad hoc record construction in the desktop UI.
- Final integration repeats targeted validations, root `pnpm typecheck`, root
  `pnpm test`, `cargo test`, `cargo check`, desktop build, `tauri:build`, and
  `git diff --check`.

## Fifth-Wave Postgres Runtime Bridge Slices

The fifth wave connects the desktop IDE to the real PostgreSQL runtime instead
of leaving Graph/RAG persistence as library-only infrastructure.

1. `desktop-ide-postgres-bridge`
   - Owns Tauri/Rust Postgres bridge files and `desktop-contracts.ts`.
   - Adds a `read_postgres_status` command that reads env configuration,
     redacts secrets, performs bounded connection checks, verifies pgvector, and
     verifies the existing Graph/RAG tables.
   - Does not introduce desktop-specific tables.

2. `desktop-ide-postgres-runtime-persistence`
   - Owns `packages/storage-postgres/src/graph-rag-*`.
   - Adds a transaction helper that persists runtime Graph/RAG DTOs, citations,
     Agent runs, tool calls, and patch proposals using the existing executor.
   - Keeps `@chemd/storage-postgres` independent from desktop packages and `pg`.

3. `desktop-ide-postgres-ui`
   - Runs after the shared desktop contract is integrated.
   - Adds compact workbench controls for Postgres status/config visibility and
     safe manual refresh.

4. `desktop-ide-runtime-smoke`
   - Runs after bridge and UI integration.
   - Adds a local smoke path that validates sidecar health, desktop build, and
     Postgres status behavior without requiring secrets to be committed.

## Fifth-Wave Acceptance Criteria

- Desktop can report whether PostgreSQL is configured, reachable, pgvector is
  installed, and existing Graph/RAG tables are ready.
- No command response leaks database passwords or full connection URLs.
- Runtime Graph/RAG/Agent records can be persisted through one transaction with
  rollback on failure.
- UI and smoke tests verify the runtime surface from the desktop side.
- Session recording does not end the workflow if these acceptance criteria or
  final validation are still incomplete.

## Sixth-Wave Desktop Persistence Loop Slices

The sixth wave turns the runtime bridge into an end-user workflow: a desktop
user can build Graph/RAG records from the current editor state and persist them
through the configured PostgreSQL runtime, while the app continues to reuse the
main PostgreSQL schema.

1. `desktop-ide-rust-persist-bridge`
   - Owns `apps/desktop/src-tauri/src/postgres*`,
     `apps/desktop/src-tauri/src/lib.rs`, and
     `apps/desktop/src/desktop-contracts.ts`.
   - Adds a `persist_runtime_graph_rag` command that accepts normalized runtime
     Graph/RAG/Agent records, validates required IDs, writes through
     parameterized SQL in one transaction, and returns counts plus a redacted
     target summary.
   - Must not add `desktop_*` or `chemd_desktop_*` tables.

2. `desktop-ide-persist-payload-builder`
   - Owns `apps/desktop/src/desktop-runtime-persistence.ts` and focused tests.
   - Converts existing `@chemd/language-service` editor Graph/RAG records and
     local Agent state into the command payload without importing database
     drivers or duplicating SQL.
   - Provides deterministic IDs so repeated saves upsert the same snapshot.

3. `desktop-ide-persist-ui`
   - Runs after the payload builder contract is integrated.
   - Owns `apps/desktop/src/App.tsx` and desktop CSS files.
   - Adds a compact "Persist graph" action, pending/success/failure state, and
     persisted counts near the existing Postgres runtime panel.
   - Keeps the light dense workbench style aligned with the web app.

4. `desktop-ide-persist-smoke`
   - Runs after the bridge and UI are integrated.
   - Extends `desktop:runtime-smoke` to exercise a minimal runtime persistence
     payload when database env is configured.
   - Keeps no-env behavior as an explicit SKIP rather than a false pass.

## Sixth-Wave Acceptance Criteria

- Desktop UI exposes a user-controlled persistence action for the current
  editor Graph/RAG/Agent snapshot.
- The Tauri command persists snapshot, nodes, edges, citations, Agent runs, tool
  calls, and patch proposals through one PostgreSQL transaction.
- All SQL is parameterized and targets the existing shared schema only.
- Command and UI responses never leak database passwords or full URLs.
- Local validation includes targeted desktop/storage/script tests,
  `pnpm typecheck`, `pnpm test`, Rust `cargo test/check`, desktop build,
  `tauri:build`, and `git diff --check`.
- If no database URL is configured, smoke output records SKIP explicitly and the
  workflow continues to the next production gap instead of stopping.

## Seventh-Wave Managed Local Postgres Runtime Slices

The seventh wave makes the desktop IDE usable without a separately installed
PostgreSQL service. The app should prefer explicit external configuration when
present, but otherwise manage a local bundled PostgreSQL + pgvector runtime from
the desktop host.

1. `desktop-ide-managed-postgres-runtime`
   - Owns `apps/desktop/src-tauri/src/managed_postgres*`,
     `apps/desktop/src-tauri/src/postgres_config.rs`,
     `apps/desktop/src-tauri/src/lib.rs`, and focused Rust tests.
   - Adds managed runtime discovery, status, init, start, stop, migration, and
     connection URL generation.
   - Supports `CHEMD_MANAGED_POSTGRES_BIN_DIR` for development and packaged
     resource discovery for production.
   - Stores data under the app data directory by default and never logs the
     generated password or full URL.

2. `desktop-ide-managed-postgres-contract-ui`
   - Runs after the runtime command contract is integrated.
   - Owns `apps/desktop/src/desktop-contracts.ts`, `apps/desktop/src/App.tsx`,
     and desktop CSS files.
   - Adds a compact Managed / External Postgres surface to the existing runtime
     panel, with initialize/start/stop/migrate/refresh actions and visible
     state, port, data dir, schema status, and safe error messages.

3. `desktop-ide-managed-postgres-smoke`
   - Runs after managed runtime integration.
   - Owns `scripts/desktop-runtime-smoke.mjs`,
     `scripts/desktop-runtime-smoke.test.mjs`, and docs.
   - If external DB env is missing but managed binaries are discoverable, starts
     a managed local Postgres instance, runs migrations, then executes the real
     desktop runtime smoke path against that instance.
   - If neither external DB nor managed binaries are available, reports a
     precise SKIP reason rather than claiming success.

## Seventh-Wave Acceptance Criteria

- Desktop can run with no user-provided `DATABASE_URL` when bundled/managed
  Postgres binaries are available.
- Managed runtime commands use bounded process control and only manage the app's
  own data directory and process.
- The generated connection URL is available to runtime code but never displayed
  with password or full URL in UI/logs.
- Migrations can initialize the shared Chemd PostgreSQL schema in the managed
  database.
- The existing Postgres status and `Persist graph` flow work against either
  external or managed Postgres.
- Local validation includes Rust tests/checks, desktop typecheck/build,
  script tests, `desktop:runtime-smoke`, root `pnpm typecheck`, root
  `pnpm test`, `tauri:build`, and `git diff --check`.

## Eighth-Wave PostgreSQL Bundle Staging Slices

The eighth wave keeps managed PostgreSQL optional instead of forcing a heavy
database into every desktop install. The app can bundle PostgreSQL when a local
or CI-provided distribution is staged, while the main package can still build
without those binaries.

1. `desktop-ide-postgres-bundle-staging`
   - Owns `apps/desktop/src-tauri/tauri.conf.json`,
     `apps/desktop/src-tauri/resources/postgres/**`,
     `scripts/desktop-postgres-bundle.mjs`, focused script tests,
     `package.json` script entries, and desktop docs.
   - Adds a local/CI staging script that copies a full PostgreSQL distribution
     into `resources/postgres` and verifies `bin/initdb`, `bin/psql`, and
     `bin/postgres` or `bin/pg_ctl`.
   - Tracks only placeholder docs and `.gitkeep`; staged binaries are ignored.

## Eighth-Wave Acceptance Criteria

- Tauri bundles `resources/postgres` when staged binaries are present.
- The repo does not commit PostgreSQL binary files.
- `desktop:postgres:verify` fails with an explicit environment reason when
  binaries are not staged.
- `desktop:runtime-smoke` continues to SKIP explicitly when neither external DB
  nor staged managed binaries are available.

## Ninth-Wave Offline Local-First Slices

The ninth wave makes the desktop IDE useful when external PostgreSQL is
offline, without making bundled PostgreSQL the default. The local store is a
desktop cache/outbox, not a replacement for the shared PostgreSQL source of
truth.

1. `desktop-ide-local-store-runtime`
   - Owns `apps/desktop/src-tauri/src/local_store*`,
     `apps/desktop/src-tauri/src/lib.rs`, and focused Rust tests.
   - Adds app-data local store commands for status, snapshot save, outbox
     enqueue, pending list, mark synced, and clear failed entries.
   - Uses durable local files with atomic writes and bounded JSON payloads.
   - Stores only local cache/outbox records; it must not create desktop-specific
     PostgreSQL tables or require a database driver.

2. `desktop-ide-local-store-contract-builder`
   - Owns `apps/desktop/src/desktop-contracts.ts`,
     `apps/desktop/src/desktop-local-store.ts`, and focused TypeScript tests.
   - Defines typed local snapshot and sync outbox payloads that reuse the
     existing runtime Graph/RAG/Agent DTO shape.
   - Builds deterministic idempotency keys so reconnect sync can upsert safely
     to shared PostgreSQL later.

3. `desktop-ide-offline-ui`
   - Runs after the local-store contract is integrated.
   - Owns `apps/desktop/src/App.tsx` and desktop CSS files.
   - Adds clear offline/local-only state, pending sync count, save-local action,
     and restore/read-local status near the existing Postgres panel.
   - Must keep the UI aligned with the current light dense workbench style.

4. `desktop-ide-offline-smoke-docs`
   - Owns `scripts/desktop-runtime-smoke.mjs`,
     `scripts/desktop-runtime-smoke.test.mjs`, and desktop docs.
   - Extends smoke to prove the offline local path when no external DB or
     managed binaries are available.
   - Keeps external/managed DB smoke behavior unchanged and still distinguishes
     environment SKIP from product failures.

## Ninth-Wave Acceptance Criteria

- With no external PostgreSQL and no staged managed binaries, the desktop can
  still save the current editor Graph/RAG/Agent snapshot to a local outbox.
- Local outbox records include stable `localId`, `idempotencyKey`, `createdAt`,
  `syncStatus`, and a bounded runtime payload.
- UI reports `Offline: local cache only` and pending sync count without
  implying that shared PostgreSQL persistence succeeded.
- Reconnect sync remains a later explicit phase; this wave only creates the
  durable local queue and user-visible offline state.
- Validation includes Rust tests/checks, desktop typecheck/build, focused
  TypeScript/script tests, root `pnpm typecheck`, root `pnpm test`,
  `tauri:build`, and `git diff --check`.

## Ninth-Wave Execution Record

- `desktop-ide-local-store-runtime` merged through
  `024a746 feat(desktop)：合入离线本地快照运行时`.
  - Runtime commands now cover local store status, save snapshot, list outbox,
    mark synced, and clear failed entries.
  - The runtime writes bounded JSON files under app data with atomic temp-file
    replacement and no database dependency.
  - Integrated validation: `cargo test` passed 39 tests and `cargo check`
    passed.

- `desktop-ide-local-store-contract-builder` merged through
  `02b7733 feat(desktop)：合入本地快照契约构建器`.
  - TypeScript command contracts now match the Rust local-store command names
    and reuse `PersistRuntimeGraphRagPayload`.
  - `buildLocalRuntimeSnapshotInput` generates deterministic `localId` and
    `idempotencyKey` values with a browser-compatible stable hash.
  - Integrated validation: desktop typecheck passed, focused Vitest passed 6
    tests, eslint passed, and `git diff --check` passed.

- Remaining ninth-wave work is split into `desktop-ide-offline-ui` and
  `desktop-ide-offline-smoke-docs` worktrees so UI changes do not conflict
  with script/docs verification work.
