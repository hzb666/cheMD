# Desktop IDE Workspace Performance Architecture Loop

## Goal

Run the desktop IDE workspace performance work as a Trellis loop on
`develop`, from baseline instrumentation through Rust/Tauri workspace data
ownership and React IDE semantic cleanup.

The work must make the IDE more responsive without turning it into a faster but
less reliable file browser. Every optimization must preserve editor freshness,
workspace data consistency, local persistence semantics, and panel state
behavior.

## Current Findings

- `App.tsx` coordinates editor, workspace, sidecar, Postgres, local store,
  agent, preview, and knowledge-map state, then passes a broad prop surface into
  Workbench.
- `useWorkspaceIndexController` now prefers Rust `query_workspace_documents`,
  but still reads the returned page of document contents into React state.
- Workspace index, workspace symbol suggestions, RAG view, and workspace ingest
  still form multiple frontend read/compile/aggregate paths.
- Workspace ingest loops over workspace files in the frontend, reads each file,
  compiles with `compileChemdForEditor`, and then saves snapshots.
- Rust/Tauri already owns workspace path policy, ignored/sensitive filtering,
  file-size checks, query pagination, and blocking Postgres RAG command
  patterns.
- Local-store list commands still read JSON entries and truncate, but current
  hard limits make that a later UX/API improvement rather than the first
  bottleneck.
- Frontend render hotspots remain: inactive dock panel construction, preview
  hydration command bursts, Knowledge Map selection reheat, Monaco option
  churn, and window rect sync scheduling.

## Architecture Principles

- Rust/Tauri owns workspace data discovery, native IO policy, bounded
  pagination, task planning, and long-task progress/cancel surfaces.
- React owns Monaco editing, current-source overlay, panel state expression,
  graph interaction, preview presentation, and user feedback.
- TypeScript compiler/language-service semantics stay in TS for now; do not
  rewrite the Chemd compiler in Rust without a separate semantic-equivalence
  plan.
- `WorkspaceDataGateway` is the main frontend boundary. It must unify manifest
  metadata, current-document overlay, loaded content cache, compile
  queue/cache, staleness, source revisions, and cancellation.
- State identity must carry through `workspaceId`, `path`, `hash`, `mtime`, and
  `sourceRevision`. Stale async results must not overwrite the active editor,
  compile output, snapshot, or RAG records.

## Phased Trellis Loop

### Phase 0 - Baseline And Business Metrics

- Add or run dev-only instrumentation for:
  - workspace query/read counts and duration
  - compile/index/RAG durations
  - ingest step durations
  - preview render command concurrency/duration
  - knowledge graph reheat count
  - heap and React Profiler scenarios where feasible
- Capture business baselines:
  - current document diagnostics remain fresh
  - autocomplete still works
  - local RAG readiness/completeness is explainable
  - snapshot saving remains idempotent
  - file-switch/autosave/conflict behavior remains correct
  - preview renders base HTML before hydrated graphics

### Phase 1 - Rust Workspace Manifest Query

- Add or extend a Tauri command that returns bounded manifest rows and summary:
  `path`, `kind`, `chemdKind`, `size`, `modifiedAtMs`, `contentHash` or stable
  metadata hash, `stale` state, `totalCount`, and `nextCursor`.
- Do not return document source text from the manifest command.
- Preserve ignored directory rules, sensitive-file policy, 5MB file limit, and
  default/max page limits.
- Keep `workspace.rs` as a thin command wrapper and put workspace filtering in
  `workspace_io.rs`.
- Sync every command contract touchpoint:
  - Rust DTO and command implementation
  - `tauri::generate_handler!`
  - `apps/desktop/src/contracts.ts` `CommandMap`
  - diagnostics bundle command list
  - capability/permission files if applicable
- Add Rust tests for pagination, query filtering, current-file exclusion,
  ignored paths, sensitive files, limit clamps, and large-file behavior.

### Phase 2 - WorkspaceDataGateway Contract

- Introduce a frontend gateway that initially preserves existing behavior while
  centralizing:
  - manifest state
  - current-document overlay
  - loaded-content cache
  - compile queue/cache
  - source revision and staleness
  - cancellation/stale-result guards
- Gateway must expose explicit `partial`, `ready`, `degraded`, and `stale`
  states for IDE panels.
- No consumer should silently infer full workspace semantic coverage when only a
  manifest page or current document is loaded.

### Phase 3 - Migrate Consumers To Gateway

Migrate one consumer at a time, with regression tests per slice:

- workspace index view model
- Monaco workspace symbol suggestions
- local RAG view
- workspace ingest input selection

Each migration must remove or isolate one duplicate read/compile path and must
preserve user-visible IDE states.

### Phase 4 - Rust Workspace Ingest Plan

- Add `build_workspace_ingest_plan` or equivalent command.
- Rust determines pending/skipped/blocked/retryable/unchanged disposition from
  file metadata, existing queue data, retry policy, and batch/page options.
- Frontend initially compiles only planned batches and persists snapshots through
  existing TS paths.
- Add progress/cancel via event/channel only when the task duration requires it.
- Tests must cover unchanged skip, retry limit, blocked reasons, stable cursor,
  and idempotent plan output.

### Phase 5 - Frontend Fast Wins That Preserve IDE Semantics

- Change `InsightDockContent` to active-panel lazy construction without losing
  panel state such as RAG query, agent approval, Postgres operations, or local
  store messages.
- Add preview hydration queue/cache:
  - base HTML renders first
  - render options are part of cache key
  - failures are localized per molecule/reaction
  - stale hydration cannot replace a newer preview
- Add component tests for these semantics.

### Phase 6 - Graph, Monaco, And Window Micro-Optimizations

- Knowledge Map selection-only updates must not reheat the full force graph.
  Structure, filter, or data-source changes still reheat when needed.
- Memoize Monaco options and guard ResizeObserver/undo state updates.
- Reduce line-count allocation for large sources.
- Schedule maximize-button rect sync only on actual geometry-affecting events
  when possible.

### Phase 7 - Local Store Pagination

- Lower priority than gateway and ingest.
- If implemented, return `{ entries, totalCount, nextCursor }` for outbox and
  reaction-intelligence artifact lists.
- Preserve existing callers through adapters until UI consumers migrate.
- Do not change storage format unless the phase explicitly expands to indexed
  storage.

### Phase 8 - Workbench/App State Domain Split

- Only after gateway and state identity contracts are stable.
- Split props by `editor`, `workspace`, `runtime`, `dock`, and `agent`.
- Preserve ordering for autosave, file switching, agent patch application,
  workspace conflict handling, Postgres binding, and local snapshot persistence.

## Verification Gates

- Do not claim completion without listing exact commands run and results.
- Minimum targeted gates per touched layer:
  - Rust workspace commands: cargo fmt/test for focused Tauri tests.
  - Desktop TS contracts/hooks: desktop typecheck and focused Vitest tests.
  - Cross-layer command changes: diagnostics bundle/static command-list tests.
  - UI semantics: focused component tests and, when available, browser smoke.
- Performance gates compare before/after on synthetic large workspaces:
  - time to first usable workspace panel
  - workspace read count and duration
  - heap impact from loaded workspace documents
  - index/RAG/ingest durations
  - preview command concurrency
  - graph reheat count

## Non-Goals

- Do not rewrite Chemd compiler/parser/language-service in Rust in this task.
- Do not move Monaco editing state or cursor/undo/save semantics to Rust.
- Do not use UI refactors to hide stale or partial workspace semantic state.
- Do not make local-store pagination block the main workspace gateway path.

## Trellis Loop Policy

- Work proceeds phase by phase on `develop`.
- Each phase should end with tests, spec/doc sync if contracts changed, commit,
  and Trellis session record before moving to the next phase.
- Existing unrelated dirty worktree changes must not be reverted or claimed.
- If a phase becomes too large, create a child Trellis task and merge back into
  this parent loop after validation.

## Acceptance Criteria

- [x] Phase 0 instrumentation is available for both performance and IDE
      business metrics.
- [ ] A real large-workspace baseline capture is recorded from the running
      desktop app.
- [x] Rust manifest/query contract exists or existing command is extended with
      metadata and tests.
- [ ] `WorkspaceDataGateway` centralizes manifest/current/loaded/compile state
      and stale-result handling.
- [ ] Workspace index, symbol suggestions, local RAG, and ingest no longer keep
      independent full-workspace read/compile loops.
- [ ] Workspace ingest planning is owned by Rust/Tauri metadata and queue
      policy, while TS compile semantics remain intact.
- [ ] Preview, dock, graph, Monaco, and window-control optimizations preserve
      IDE behavior under targeted tests.
- [ ] Workbench/App decomposition happens only after data and state contracts
      are stable.
- [ ] Trellis records, commits, and validation evidence exist for completed
      phases.

## Phase Records

### Phase 0 - Instrumentation

- Added a dev-gated desktop performance metrics helper.
- Instrumented Tauri command duration, editor compile, knowledge-map view model
  build, workspace document load, workspace view-model/symbol/RAG build, and
  preview render/hydration/replacement durations.
- Added unit coverage for the performance metrics helper.
- Validation:
  - `pnpm --filter @chemd/desktop test -- performance-marks.test.ts workspace-index.test.ts`
  - `pnpm --filter @chemd/desktop typecheck`
- Limitation: this phase creates the measurement surface. It does not yet
  include a real React Profiler or large-workspace runtime capture.

### Phase 1 - Rust Workspace Manifest Query

- Added `query_workspace_index` as a Rust/Tauri workspace manifest command.
- The command returns paged rows with path, kind, Chemd kind, byte size,
  modified time, and a stable metadata revision key; it does not return source
  text.
- Kept the existing `query_workspace_documents` command for compatibility.
- Synced the command registration, TypeScript `CommandMap`, diagnostics bundle
  command list, shell diagnostics summary, and Rust tests.
- Validation:
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace_tests`
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml diagnostics_bundle_tests`
  - `pnpm --filter @chemd/desktop typecheck`
  - `pnpm --filter @chemd/desktop test -- performance-marks.test.ts workspace-index.test.ts`
- Limitation: this phase provides the backend manifest contract. Frontend
  consumers still use the old read-and-compile paths until the
  `WorkspaceDataGateway` phase.

### Phase 2 - WorkspaceDataGateway Contract

- Added `useWorkspaceDataGateway` as the frontend workspace data boundary.
- The gateway owns manifest state, current-source overlay revision,
  metadata-based source identity, stale request guards, refresh, and a simple
  content cache keyed by workspace, path, and manifest revision key.
- The workspace index now consumes gateway manifest files and cached reads on
  the normal path, while retaining `query_workspace_documents` as a degraded
  fallback to preserve IDE behavior.
- Added unit coverage for manifest-row conversion, partial-state detection, and
  current-source revision identity.
- Validation:
  - `pnpm --filter @chemd/desktop test -- workspace-data-gateway.test.ts workspace-index.test.ts performance-marks.test.ts`
  - `pnpm --filter @chemd/desktop typecheck`
- Limitation: this phase establishes the gateway boundary for manifest,
  current-document overlay, loaded-content cache, and stale manifest guards.
  Compile queue/cache, symbol suggestions, local RAG, and ingest still need
  explicit migration in Phase 3.

### Phase 3 - Consumer Migration Slice 1

- Migrated workspace symbol indexing to use Gateway document files and cached
  reads when the Gateway state is fully `ready`.
- Added a guard so partial/degraded Gateway states do not silently masquerade
  as full workspace semantic coverage; symbol indexing falls back to the
  existing full workspace file list in those states.
- Kept workspace ingest on the existing path for now because ingest planning
  should be moved to Rust/Tauri in Phase 4 rather than made dependent on a
  partial frontend manifest page.
- Validation:
  - `pnpm --filter @chemd/desktop test -- workspace-data-gateway.test.ts symbol-index.test.ts workspace-index.test.ts`
  - `pnpm --filter @chemd/desktop typecheck`
- Limitation: local RAG and ingest are not fully migrated yet. The next useful
  step is Rust-owned ingest planning, then consumer cleanup around that
  backend contract.

### Phase 4 - Rust Workspace Ingest Plan Command

- Added `build_workspace_ingest_plan` as a Rust/Tauri command.
- Rust now enumerates workspace files, filters Chemd documents and plain
  Markdown skips, pages plan items, and marks rows as `pending`, `unchanged`,
  or `skipped` based on metadata revision keys.
- The command returns only ingest plan metadata; it does not return source text
  and does not compile documents.
- Synced Tauri registration, TypeScript command contracts, diagnostics bundle,
  and Rust workspace tests.
- Validation:
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace_tests`
  - `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml diagnostics_bundle_tests`
  - `pnpm --filter @chemd/desktop typecheck`
- Limitation: frontend ingest still calls the old TS runner. A follow-up slice
  should consume the Rust plan and map plan items into compile batches.

### Phase 5 - Frontend Fast Win Slice 1

- Changed `InsightDockContent` from eager `contentByPanel` construction to an
  active-panel `switch`.
- Inactive dock panels no longer construct React nodes on every active-panel
  render.
- Agent quick-fix and timeline derivation now run only when the agent panel is
  active.
- Validation:
  - `pnpm --filter @chemd/desktop typecheck`
  - `pnpm --filter @chemd/desktop test -- workspace-data-gateway.test.ts workspace-index.test.ts`
- Limitation: preview hydration queue/cache remains a separate Phase 5 slice.

### Phase 5 - Frontend Fast Win Slice 2

- Added a desktop preview render scheduler with a concurrency cap for
  `render_chem_preview` command calls.
- Added cache keys that include molecule/reaction input and render options, so
  repeated hydration of the same structure can reuse an in-flight or completed
  render.
- Preserved existing base-HTML-first behavior, per-entry render error markup,
  and stale hydration guard.
- Added unit coverage for stable render cache keys and concurrency limiting.
- Validation:
  - `pnpm --filter @chemd/desktop test -- use-rendered-preview.test.ts`
  - `pnpm --filter @chemd/desktop typecheck`

### Phase 6 - Monaco And Editor Surface Micro-Optimizations

- Replaced `source.split(/\r?\n/)` line counting with a no-array
  `countSourceLines` helper.
- Memoized Monaco editor options instead of recreating the full options object
  on every render.
- Added guards for repeated undo/redo state scheduling and identical
  ResizeObserver scroll-padding updates.
- Validation:
  - `pnpm --filter @chemd/desktop test -- editor-surface.test.ts monaco-chemd-editor.test.ts`
  - `pnpm --filter @chemd/desktop typecheck`
- Limitation: Knowledge Map reheat and native window rect sync still need their
  own focused slices.

### Phase 6 - Knowledge Map And Window Rect Sync

- Split ForceGraph updates between structural changes and selection-only
  changes for both document and reaction graphs.
- Selection-only graph updates now refresh graph data without calling
  `d3ReheatSimulation`.
- Added structure-key tests to lock the selection-only behavior.
- Removed the no-dependency window maximize rect sync effect that scheduled a
  native rect update after every render. Resize, scale, native window events,
  initial sync, and cleanup remain in place.
- Validation:
  - `pnpm --filter @chemd/desktop test -- knowledge-map-panel.test.ts knowledge-map.test.ts`
  - `pnpm --filter @chemd/desktop typecheck`
