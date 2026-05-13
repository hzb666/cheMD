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

- `desktop-ide-offline-smoke-docs` merged through
  `931243e feat(desktop)：合入离线 local-store smoke`.
  - `desktop:runtime-smoke` now distinguishes database persistence SKIP from
    local offline success when no external DB or managed binaries are present.
  - `docs/desktop-ide/offline-local-store.zh-CN.md` documents the three-layer
    persistence model and the offline JSON outbox contract.

- `desktop-ide-offline-ui` merged through
  `ebcf493 feat(desktop)：合入离线本地快照控制面`.
  - The desktop workbench now exposes an Offline Local Store panel beside the
    existing PostgreSQL controls.
  - `Save Local Snapshot` reuses the same Graph/RAG/Agent payload builder and
    stores a pending local snapshot without implying PostgreSQL sync success.

- Final ninth-wave validation:
  - `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` passed 39
    tests after rerunning one transient sidecar exit-status assertion.
  - `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` passed.
  - `pnpm --filter @chemd/desktop typecheck` passed.
  - Focused `desktop-local-store.test.ts` Vitest passed 6 tests.
  - Desktop eslint passed with only existing CSS ignored warnings.
  - `pnpm --filter @chemd/desktop build` passed with existing lucide and chunk
    size warnings.
  - `pnpm test:scripts` passed 37 script tests.
  - `pnpm desktop:runtime-smoke` passed the offline local path on this machine:
    database persistence was skipped because PostgreSQL binaries were missing,
    then local snapshot/outbox verification completed with `pending=1`.
  - `pnpm typecheck` passed all 21 workspaces.
  - `pnpm test` passed Turbo tests, script tests, and 52 Python tests.
  - `pnpm --filter @chemd/desktop tauri:build` produced the release executable,
    MSI bundle, and NSIS installer.
  - `git diff --check` passed.

## Tenth-Wave Reconnect Sync Slices

The tenth wave turns the offline local outbox into a real reconnect workflow.
It must sync back into the existing shared PostgreSQL Graph/RAG/Agent schema and
then mark local entries as synced or failed. It must not create desktop-only
database tables.

1. `desktop-ide-outbox-sync-runtime`
   - Owns `apps/desktop/src-tauri/src/local_store*`,
     `apps/desktop/src-tauri/src/postgres_runtime_*`, `apps/desktop/src-tauri/src/postgres*`
     only when needed for shared persistence reuse, `apps/desktop/src-tauri/src/lib.rs`,
     and focused Rust tests.
   - Adds a Tauri command that reads pending local outbox entries, persists each
     entry's existing Graph/RAG/Agent payload through the shared PostgreSQL
     runtime path, marks successful entries `synced`, and records bounded
     failure metadata for failed entries.
   - Reuses the external/managed PostgreSQL target selection already used by
     `persist_runtime_graph_rag`.
   - Preserves idempotency: repeated sync of the same local entry must not
     create duplicate shared records.

2. `desktop-ide-outbox-sync-contract`
   - Owns `apps/desktop/src/desktop-contracts.ts`,
     `apps/desktop/src/desktop-local-store.ts`, and focused TypeScript tests.
   - Adds typed command/result shapes for outbox sync, including selected
     target summary, synced count, failed count, skipped count, and per-entry
     status.
   - Keeps existing local snapshot types stable.

3. `desktop-ide-outbox-sync-ui`
   - Runs after runtime and contract integration.
   - Owns `apps/desktop/src/App.tsx` and desktop CSS files.
   - Adds a compact `Sync Pending` action in the Offline Local Store panel.
   - Shows sync result counts and the active External/Managed target without
     implying local-only entries are shared until sync succeeds.

4. `desktop-ide-outbox-sync-smoke-docs`
   - Runs after runtime/contract integration.
   - Owns `scripts/desktop-runtime-smoke.mjs`,
     `scripts/desktop-runtime-smoke.test.mjs`, and desktop docs.
   - Adds script-level coverage for offline-save-then-sync when a PostgreSQL
     runtime is available, and keeps local offline-only smoke behavior when no
     runtime is available.

## Tenth-Wave Acceptance Criteria

- Pending local outbox entries can be synced to the shared PostgreSQL schema
  once External or Managed PostgreSQL is available.
- Successful sync marks entries `synced` with `syncedAt` and clears failure
  metadata.
- Failed sync leaves entries local, marks or retains `failed`, increments
  bounded failure metadata, and never drops the payload silently.
- Sync results are visible in the UI with counts and safe, redacted errors.
- Offline-only smoke still passes without PostgreSQL; online smoke proves the
  sync path when PostgreSQL is configured.

## Tenth-Wave Execution Record

- `desktop-ide-outbox-sync-runtime` merged through
  `9bdddf7 feat(desktop)：合入本地 outbox 重连同步运行时`.
  - Added `sync_local_outbox_to_postgres` and wired it into the Tauri invoke
    handler.
  - The command reads pending local outbox entries and reuses the existing
    shared PostgreSQL Graph/RAG/Agent persistence path.
  - Successful entries are marked `synced`; failed entries retain payload and
    bounded failure metadata.
  - Integrated validation: `cargo test` passed 43 tests and `cargo check`
    passed.

- `desktop-ide-outbox-sync-contract` merged through
  `6c9d684 feat(desktop)：合入本地 outbox 同步契约`.
  - TypeScript contracts now expose `sync_local_outbox_to_postgres`, sync
    target metadata, per-entry results, and summary counts.
  - Integrated validation: desktop typecheck passed, focused Vitest passed 7
    tests, eslint passed, and `git diff --check` passed.

- Remaining tenth-wave work is split into `desktop-ide-outbox-sync-ui` and
  `desktop-ide-outbox-sync-smoke-docs`.

- `desktop-ide-outbox-sync-smoke-docs` merged through
  `3812138 feat(desktop)：合入 outbox 重连同步 smoke`.
  - `desktop:runtime-smoke` now covers script-level local outbox ->
    shared PostgreSQL sync when a database runtime is available.
  - Offline-only runs still explicitly skip database persistence and verify the
    local JSON snapshot/outbox contract.

- `desktop-ide-outbox-sync-ui` merged through
  `3059a57 feat(desktop)：合入本地 outbox 同步入口`.
  - The Offline Local Store panel now exposes a gated `Sync Pending` action.
  - Sync results show synced, failed, skipped, target metadata, and redacted
    failure details.

- Final tenth-wave validation was recorded in
  `c3e0045 docs(desktop)：记录第十轮同步验收` and
  `e6f6a5f chore(trellis)：记录桌面IDE第十轮 outbox 重连同步`.
  - Rust tests/check, desktop typecheck/build/eslint, focused Vitest,
    script tests, root typecheck, root test, Tauri build, runtime smoke, and
    `git diff --check` passed.
  - `pnpm desktop:runtime-smoke` reported database persistence as SKIP on this
    machine because no external PostgreSQL env or managed PostgreSQL binaries
    were available, then verified the offline local outbox path.
  - The remaining production gap is command-level proof of
    `sync_local_outbox_to_postgres` against a real PostgreSQL runtime.

## Eleventh-Wave Runtime Proof and Distribution Slices

The eleventh wave closes the proof gap left after reconnect sync. It should make
PostgreSQL runtime availability explicit and testable without committing
PostgreSQL binaries to the repository.

1. `desktop-ide-tauri-command-smoke`
   - Owns `scripts/desktop-runtime-smoke.mjs`,
     `scripts/desktop-runtime-smoke.test.mjs`, and optional helper scripts.
   - Adds a command-level smoke runner abstraction for the real Tauri command
     chain: initialize/start/migrate managed PostgreSQL, save a local runtime
     snapshot, sync pending outbox, and verify the local entry transitions to
     `synced`.
   - If no real Tauri invoke runner is configured, it must report an explicit
     SKIP/unsupported result instead of claiming command-level proof.

2. `desktop-ide-postgres-dist-proof`
   - Owns `scripts/desktop-postgres-bundle.mjs`,
     `scripts/desktop-postgres-bundle.test.mjs`, and desktop PostgreSQL docs.
   - Adds staging provenance/manifest output for PostgreSQL distributions so
     CI and release operators can prove which source was staged.
   - Keeps bin-only local development staging separate from full distribution
     staging, because bin-only is not enough for offline installer proof.

## Eleventh-Wave Acceptance Criteria

- Script-level smoke, command-level smoke, and offline local-only smoke are
  reported as distinct outcomes.
- A real Tauri command-level proof can be run when a Tauri invoke runner and
  PostgreSQL runtime are available.
- Without a command runner or database runtime, the result is an explicit
  environment SKIP, not a product pass.
- PostgreSQL staging verification emits source, target, platform, required
  binary, and full-distribution/bin-only provenance without storing secrets.
- Documentation explains the three production modes: external PostgreSQL,
  bundled managed PostgreSQL, and offline local outbox.
- Validation includes focused script tests, `pnpm test:scripts`,
  `pnpm desktop:runtime-smoke`, root typecheck/test, desktop build/Tauri build,
  and `git diff --check`.

## Eleventh-Wave Execution Record

- `desktop-ide-postgres-dist-proof` merged through
  `0a21ce6 feat(desktop)：合入 PostgreSQL 分发证明`.
  - `scripts/desktop-postgres-bundle.mjs` now writes a staging manifest with
    source, target, platform, binary requirements, bin-only/full mode, and a
    verification summary.
  - `--require-full` rejects bin-only development sources for production
    distribution proof.
  - Desktop PostgreSQL docs now distinguish external DB, installer bundled
    managed DB, and offline local outbox modes.
  - Integrated validation: focused bundle tests passed 11 tests, script lint
    passed for bundle files, and `pnpm test:scripts` passed before merge.

- `desktop-ide-tauri-command-smoke` merged through
  `74edabf feat(desktop)：合入 Tauri command smoke`.
  - `desktop:runtime-smoke` now includes a Tauri command-level smoke runner
    abstraction and reports explicit SKIP when no runner is configured.
  - The command-level path verifies pending local outbox -> synced outbox using
    desktop command calls, without bypassing the existing shared Graph/RAG
    persistence target.
  - Integration review added `92d29a8 fix(desktop)：传递 command smoke 运行环境`
    so runner subprocesses inherit the smoke env and managed PostgreSQL
    temporary connection data.
  - Final integration added `cf1ff3a refactor(desktop)：降低 runtime smoke 复杂度`
    to split the managed PostgreSQL smoke startup path and clear the script
    ESLint complexity gate.
  - Integrated validation: focused runtime smoke tests passed 20 tests and
    `pnpm test:scripts` passed before merge.

- Current integrated validation:
  - Script ESLint passed for runtime smoke and bundle scripts.
  - `node --test scripts/desktop-runtime-smoke.test.mjs scripts/desktop-postgres-bundle.test.mjs`
    passed 31 tests.
  - `pnpm test:scripts` passed 47 script tests.
  - `pnpm desktop:runtime-smoke` passed the offline local path on this machine;
    database persistence remains an environment SKIP because no external DB or
    managed PostgreSQL binaries are available.
  - `pnpm typecheck` passed all 21 workspaces.
  - `pnpm test` passed Turbo tests, 47 script tests, and 52 Python tests.
  - `pnpm --filter @chemd/desktop tauri:build` produced release exe, MSI, and
    NSIS installer.
  - `git diff --check` passed.

- Remaining production proof gap:
  - Real DB proof needs either external PostgreSQL env or staged managed
    PostgreSQL binaries.
  - Real command-level proof needs a configured
    `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER` that can invoke the packaged desktop
    commands against that DB runtime.

## Twelfth-Wave Offline-First Productization Slices

The twelfth wave realigns the production path around offline-first desktop
authoring. Local `.chemd.md` documents are the source of truth. PostgreSQL is a
sync/enrichment layer and must not gate basic authoring.

1. `desktop-ide-offline-workspace-reliability`
   - Owns `apps/desktop/src-tauri/src/workspace*`.
   - Adds content hash and modified time to workspace reads/writes.
   - Adds optional `baseHash` conflict detection and atomic same-directory
     write/replace behavior.

2. `desktop-ide-language-service-core`
   - Owns `packages/language-service/**`.
   - Adds worker request/response contracts, stale compile handling, and a
     Monaco-friendly aggregate model.

3. `desktop-ide-local-status-contract`
   - Owns `apps/desktop/src/desktop-local-store.ts`,
     `apps/desktop/src/desktop-local-store.test.ts`, and local-store related
     command types.
   - Adds local authoring status derivation for saved/compiled/snapshot/sync
     state without treating DB absence as a product failure.

4. `desktop-ide-offline-core-smoke`
   - Owns `scripts/desktop-runtime-smoke.mjs`,
     `scripts/desktop-offline-core-smoke.mjs`, focused tests, and offline docs.
   - Adds a P0 Offline Core smoke that explicitly separates database persistence
     SKIP from local offline PASS.

## Twelfth-Wave Execution Record

- `desktop-ide-language-service-core` merged through
  `246df83 feat(language-service)：增强语言服务核心契约`.
  - Added `packages/language-service/src/worker.ts`.
  - Added stale-safe compile response and structured error response.
  - Extended Monaco adapter with an aggregate language-service model.

- `desktop-ide-local-status-contract` merged through
  `888159b feat(desktop)：补充离线本地状态契约`.
  - Added `deriveLocalAuthoringStatus`.
  - Added bounded/redacted local display errors, outbox counts, and retry
    eligibility.

- `desktop-ide-offline-core-smoke` merged through
  `e06a546 feat(desktop)：添加离线核心 smoke`.
  - Added `pnpm desktop:offline-core-smoke`.
  - Updated integrated runtime smoke to return `offline-core-passed` when no
    PostgreSQL runtime is available.

- `desktop-ide-offline-workspace-reliability` merged through
  `a84fccc fix(desktop)：强化 workspace 文件保存可靠性`.
  - Added workspace content hash and modified timestamp metadata.
  - Added optional `baseHash` conflict detection.
  - Added atomic temp-file write and replace behavior.

- Integration follow-up `13d1ccf fix(desktop)：同步 workspace 保存契约`.
  - Synced TypeScript command contracts with Rust workspace read/write payloads.

- Current validation:
  - `pnpm --filter @chemd/language-service test` passed 11 tests.
  - `pnpm exec vitest run apps/desktop/src/desktop-local-store.test.ts --config packages/compiler/vitest.config.ts --pool=threads`
    passed 10 tests.
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace`
    passed 8 tests.
  - `pnpm run test:scripts` passed 52 script tests.
  - `pnpm --filter @chemd/desktop typecheck` passed.
  - Desktop focused ESLint passed for changed TS/TSX files.
  - `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml` passed.
  - `pnpm desktop:offline-core-smoke` passed with Offline Core PASS.
  - `pnpm --filter @chemd/desktop build` passed with existing lucide/chunk
    warnings.
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml` passed 47
    tests.
  - `pnpm desktop:runtime-smoke` passed Offline Core and explicitly skipped
    database persistence because no PostgreSQL binaries were available.
  - `pnpm typecheck` passed all 21 workspaces.
  - `pnpm test` passed Turbo tests, 52 script tests, and 52 Python tests.
  - `git diff --check` passed.

- Blocked verification:
  - `pnpm --filter @chemd/desktop tauri:build` did not pass in this run.
  - First attempt was blocked by a running
    `apps/desktop/src-tauri/target/release/chemd-desktop.exe` process and
    Windows `os error 5` while deleting the old exe.
  - Second attempt with isolated `CARGO_TARGET_DIR=.tmp/tauri-build-target`
    exceeded the tool timeout and was stopped.
  - Treat this as an environment/process-lock blocker, not as a product pass.

## Thirteenth-Wave Offline-First Productization Slices

The thirteenth wave closes the immediate P0 gaps from the twelfth wave and
prepares the next P1 ingest loop without changing the local-document source of
truth.

1. `desktop-ide-workspace-conflict-ui`
   - Owns `apps/desktop/src/App.tsx` and panel styling.
   - Turns `workspace_file_conflict` into a visible reload/keep-local decision
     panel.
   - Must not overwrite externally modified files without user choice.

2. `desktop-ide-workspace-ingest-queue`
   - Owns the desktop ingest contract and tests.
   - Adds local ingest entry/queue/summary contracts for pending, running,
     synced, failed, and skipped states.
   - Keeps payloads derived from document metadata, compile result, and runtime
     persistence payloads.

3. `desktop-ide-offline-release-smoke`
   - Owns release preflight script, script tests, package script, and release
     smoke docs.
   - Adds `desktop:offline-release-smoke` with PASS/SKIP/BLOCKED semantics.
   - Detects release exe process locks by exact path, does not kill processes,
     and does not print env/secrets.

## Thirteenth-Wave Execution Record

- `desktop-ide-workspace-ingest-queue` merged through
  `ac8c792 feat(desktop)：合并 workspace ingest 队列契约`.
  - Added `apps/desktop/src/desktop-workspace-ingest.ts`.
  - Added focused Vitest coverage for queue derivation, summary counts, retry
    eligibility, and redacted failure display.

- `desktop-ide-workspace-conflict-ui` merged through
  `e237e9b fix(desktop)：合并 workspace 保存冲突 UI`.
  - Workspace save conflicts now surface a dedicated conflict panel.
  - Users can reload from disk or keep local editing while preserving the editor
    buffer.

- `desktop-ide-offline-release-smoke` merged through
  `3cbefc8 feat(desktop)：合并 release 离线 smoke 前置检查`.
  - Added `pnpm desktop:offline-release-smoke`.
  - Added release preflight documentation and 5 script tests, increasing
    `test:scripts` coverage to 57 tests.

- Current integrated validation:
  - Focused desktop local-store/ingest Vitest passed 15 tests.
  - `pnpm run test:scripts` passed 57 script tests.
  - `pnpm --filter @chemd/desktop typecheck` passed.
  - Desktop focused ESLint passed for changed TS/TSX files; CSS remains ignored
    by existing lint config.
  - `pnpm desktop:offline-core-smoke` passed with Offline Core PASS.
  - `pnpm desktop:offline-release-smoke` passed with release preflight PASS.
  - `pnpm --filter @chemd/desktop build` passed with existing lucide/chunk
    warnings.
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace`
    passed 8 workspace tests.
  - `git diff --check` passed.
  - `pnpm typecheck` passed all 21 workspaces.
  - `pnpm test` passed Turbo tests, 57 script tests, and 52 Python tests.
  - `pnpm --filter @chemd/desktop tauri:build` passed and produced release exe,
    MSI, and NSIS installer artifacts.
  - `pnpm desktop:runtime-smoke` passed Offline Core and explicitly skipped
    database persistence because PostgreSQL binaries were unavailable.

- Remaining production gaps:
  - Monaco has not replaced the textarea yet.
  - The Windows installer artifacts exist, but clean-machine installer Offline
    Core smoke has not been run.
  - Workspace ingest has contracts and tests, but not the full UI scan/retry/
    cancel loop.
  - Real PostgreSQL sync proof still needs either external DB env or staged
    managed PostgreSQL binaries.

## Fourteenth-Wave Offline-First Productization Slices

The fourteenth wave closes the remaining P0 editor gap and advances the P1/P4
proof surface without changing the local-document source of truth.

1. `desktop-ide-monaco-editor`
   - Owns the desktop editor entrypoint and Monaco-only dependencies.
   - Replaces the textarea with `@monaco-editor/react` and `monaco-editor`.
   - Keeps diagnostics, markers, Problems, and preview derived from
     `@chemd/language-service`, not a parallel compiler.

2. `desktop-ide-workspace-ingest-runner`
   - Owns the pure TypeScript workspace ingest runner.
   - Uses dependency injection for file reads and compile calls.
   - Keeps one-file failures isolated and produces recoverable queue summaries.

3. `desktop-ide-installer-offline-smoke`
   - Owns installer artifact preflight scripts and release docs.
   - Checks release exe, MSI, NSIS, and target release exe lock status.
   - Does not launch the GUI, kill processes, or claim clean-machine smoke.

## Fourteenth-Wave Execution Record

- `desktop-ide-workspace-ingest-runner` merged through
  `fabddb9 feat(desktop)：合并 workspace ingest runner`.
  - Added `runWorkspaceIngest` with injected `readFile` and `compile`.
  - `.chemd.md` entries produce pending queue items; plain markdown is skipped;
    other entries are excluded.
  - Failures are redacted, bounded, and counted without stopping the rest of the
    run.

- `desktop-ide-installer-offline-smoke` merged through
  `9369aef feat(desktop)：合并 installer 离线 smoke`.
  - `desktop:offline-release-smoke` now performs artifact preflight.
  - Added `desktop:installer-offline-smoke` as an explicit alias.
  - Checks release exe, MSI, NSIS non-empty artifacts and exact-path release exe
    locks.

- `desktop-ide-monaco-editor` merged through
  `d2198f0 feat(desktop)：合并 Monaco 编辑器`.
  - Added Monaco dependencies and `MonacoChemdEditor`.
  - Replaced the desktop textarea with Monaco while preserving `Ctrl/Cmd+S`,
    existing save flow, compiler diagnostics, preview, and Problems panel.
  - Integrated the Monaco worker in the Vite/Tauri desktop build without root
    config changes.

- Integration follow-up:
  - Cleaned the workspace ingest runner types and long lines.
  - Updated release smoke docs to distinguish artifact preflight from
    clean-machine installer smoke.
  - The implementation plan now includes final M10 visual style refactor and
    M11 UI componentization/big-file split as post-core-productization work.

- Current integrated validation:
  - `pnpm install --frozen-lockfile` passed.
  - Focused desktop local-store/ingest Vitest passed 19 tests.
  - `pnpm run test:scripts` passed 59 script tests.
  - `pnpm --filter @chemd/desktop typecheck` passed.
  - Desktop focused ESLint passed for changed TS/TSX files; CSS remains ignored
    by existing lint config.
  - `pnpm --filter @chemd/desktop build` passed and emitted
    `editor.worker`; Monaco increased the main bundle size warning.
  - `pnpm desktop:offline-core-smoke` passed with Offline Core PASS.
  - `pnpm desktop:offline-release-smoke` passed artifact preflight PASS.
  - `pnpm desktop:installer-offline-smoke` passed artifact preflight PASS.
  - `pnpm desktop:runtime-smoke` passed Offline Core and explicitly skipped
    database persistence because PostgreSQL binaries were unavailable.
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace`
    passed 8 workspace tests.
  - `pnpm typecheck` passed all 21 workspaces.
  - `pnpm test` passed Turbo tests, 59 script tests, and 52 Python tests.
  - `pnpm --filter @chemd/desktop tauri:build` passed and produced a release
    exe plus MSI/NSIS installers containing the Monaco frontend artifact.
  - `git diff --check` passed with only CRLF worktree warnings.

- Remaining production gaps:
  - Clean-machine installer Offline Core smoke has not been run.
  - Workspace ingest still needs the UI scan/retry/cancel loop and local outbox
    execution wiring.
  - Real PostgreSQL sync proof still needs either external DB env or staged
    managed PostgreSQL binaries.
  - Monaco is integrated, but bundle splitting/performance tuning is still a
    release optimization item.

## Fifteenth-Wave In-Progress Record

- `desktop-ide-monaco-bundle-split` merged through
  `8a4cd28 build(desktop)：拆分 Monaco 构建 chunk`.
  - `apps/desktop/vite.config.ts` now uses a conservative `manualChunks`
    function for `monaco` and `react-vendor`.
  - Desktop build main entry dropped from roughly 3.2 MB to roughly 468 KB.
  - Monaco remains a separate large chunk and still emits a size warning; the
    warning threshold was not raised.

- External PostgreSQL runtime proof:
  - `pnpm desktop:runtime-smoke` passed against the remote PostgreSQL target.
  - Logged target metadata was redacted: host, port, database, and user only;
    password was `[REDACTED]`.
  - Shared schema persistence, runtime Graph/RAG verification, and local outbox
    reconnect sync passed.
  - Tauri command smoke remains an environment SKIP because
    `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER` is not configured.

- `desktop-ide-diagnostics-bundle` merged through
  `c3f84fb feat(desktop)：合并诊断包脚本`.
  - Added `pnpm desktop:diagnostics-bundle` for offline, redacted JSON support
    diagnostics.
  - The bundle records platform, Node, git commit, desktop package metadata,
    artifact summaries, known desktop commands, runtime/release preflight
    classifications, and selected env signal names with values redacted.
  - It does not start the GUI, open network connections, read `.env` files, or
    run heavy runtime/database smoke.
  - Main branch follow-up split the script into CLI, core, and sanitizer modules
    to keep the new code within file-size boundaries.
  - Main branch validation passed: focused diagnostics test 5/5,
    `pnpm run test:scripts` 64/64, scripts ESLint, `pnpm desktop:diagnostics-bundle`,
    and `git diff --check` with only CRLF worktree warnings.

- `desktop-ide-user-offline-docs` merged through
  `8a3a99f docs(desktop)：合并离线优先用户指南`.
  - Added `docs/desktop-ide/user-offline-first-guide.zh-CN.md`.
  - The guide covers Offline Core, local document authority, workspace open/save,
    compile/preview/diagnostics, local snapshot/outbox, PostgreSQL/JDBC setup,
    sync recovery, diagnostics bundle, clean-machine smoke, and `SKIP`
    semantics.

- `desktop-ide-diagnostics-support-context` merged through
  `04f8202 feat(desktop)：合并诊断包支持上下文`.
  - Added offline support context to the diagnostics bundle.
  - The context includes fixed support commands, bounded offline smoke file
    summaries, preflight classifications, and explicit not-run `SKIP` entries
    for sidecar/log/sync/provider/Tauri command smoke.
  - Main branch validation passed: focused diagnostics test 7/7,
    `pnpm run test:scripts` 66/66, scripts ESLint, `pnpm desktop:diagnostics-bundle`,
    `pnpm --filter @chemd/desktop typecheck`, and `git diff --check`.

- `desktop-ide-workspace-ingest-ui` merged through
  `feat(desktop)：合并 workspace ingest UI`.
  - Added a Local Store panel action to scan the current workspace through the
    existing workspace file list, `read_workspace_file`, and language-service
    compile path.
  - The first UI version builds an in-memory ingest queue and displays
    total/pending/skipped/failed/retryable counts plus bounded failure rows.
  - Main branch validation passed: desktop workspace ingest/local-store Vitest
    19/19, `pnpm --filter @chemd/desktop typecheck`,
    `pnpm --filter @chemd/desktop build`, and `git diff --check`.
  - Focused ESLint still reports `LocalStorePanel` complexity/max-lines errors;
    per user direction this is recorded as M11 UI componentization/complexity
    debt and no longer blocks current productization flow.

- `desktop-ide-release-readiness` merged through
  `feat(desktop)：合并发布就绪聚合脚本`.
  - Added `pnpm desktop:release-readiness` with console, `--json`, and
    `--output` modes.
  - The report aggregates runtime preconditions, offline release preflight, and
    diagnostics bundle builder results.
  - Clean-machine installer smoke and real network checks are explicitly
    `skip/not-run`, so offline readiness cannot be mistaken for full production
    acceptance.
  - Main branch validation passed: release-readiness tests 6/6,
    `pnpm run test:scripts` 72/72, scripts ESLint,
    `pnpm desktop:release-readiness --json`, and `git diff --check`.

- `desktop-ide-tauri-diagnostics-export` merged through
  `feat(desktop)：合并 Tauri 诊断包导出命令`.
  - Added the Tauri command contract `export_diagnostics_bundle`.
  - The command writes a redacted offline JSON bundle to a temp directory and
    returns the output path plus summary counts.
  - It does not start GUI helpers, open network connections, read `.env`, or
    require sidecar/PostgreSQL runtime availability.
  - Follow-up `fix(desktop)：同步诊断包命令清单` keeps the Node diagnostics
    bundle command list aligned with the Rust command list.
  - Main branch validation passed: Rust diagnostics bundle tests 3/3,
    desktop typecheck, contract/scripts ESLint, diagnostics bundle tests 7/7,
    `pnpm desktop:diagnostics-bundle`, and `git diff --check`.

## User Offline-First Docs Branch Record

- Branch/worktree:
  - `desktop-ide-user-offline-docs`
  - `D:\Code\chemd-wt-user-offline-docs`
- Baseline:
  - Created from local `desktop-ide` at `193ab83`.
  - Remote refresh was attempted, but `git fetch origin desktop-ide` failed
    with `Recv failure: Connection was reset`; treated as a network blocker.
- Documentation:
  - Added `docs/desktop-ide/user-offline-first-guide.zh-CN.md` as the
    production user/support guide for Offline Core, local documents,
    snapshot/outbox, PostgreSQL configuration, sync recovery, diagnostics
    bundle, clean-machine smoke, and explicit `SKIP` semantics.
  - Updated the offline-first implementation status/link so P4 user docs point
    to the new guide.
- Validation:
  - `git diff --check`: passed with only Git LF/CRLF worktree warning.
  - `pnpm exec markdownlint docs/desktop-ide/user-offline-first-guide.zh-CN.md docs/desktop-ide/offline-first-productization-implementation.zh-CN.md`:
    not available; command failed because `markdownlint` is not installed in
    this workspace.
  - Local Markdown relative-link check: passed.
- Scope control:
  - No app code, package scripts, lockfile, root config, or desktop runtime
    files were modified.
