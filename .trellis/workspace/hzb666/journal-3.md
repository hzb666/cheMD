# Journal - hzb666 (Part 3)

> Continuation from `journal-2.md` (archived at ~2000 lines)
> Started: 2026-05-14

---



## Session 90: Desktop Agent panel and tool contracts

**Date**: 2026-05-14
**Task**: Desktop Agent panel and tool contracts
**Package**: web
**Branch**: `desktop-ide`

### Summary

Merged parallel Agent panel and tool contract slices, then wired them into the desktop Agent dock.

### Main Changes

- Merged child branches desktop-agent-panel-ui and desktop-agent-tool-contracts into desktop-ide.
- Replaced the inline App Agent dock implementation with DesktopAgentPanel while preserving quick-fix proposal controls.
- Added current source hash into panel build so patch gate display reflects base-hash drift.
- Wired desktop Agent tool contracts into timeline input/output summaries with generic fallback.
- Updated M7 implementation documentation and kept complexity lint debt recorded for M11.

Merged commits:
- 67e3606 feat(desktop)：新增 Agent 面板组件
- e2174ee feat(desktop)：新增 agent tool 展示契约
- 7a576f8 feat(desktop)：接入 Agent 面板和工具契约

Validation:
- pnpm exec vitest run apps/desktop/src/agent-panel/DesktopAgentPanel.test.tsx apps/desktop/src/agent-tools/contracts.test.ts apps/desktop/src/desktop-agent-timeline-panel.test.ts --config packages/compiler/vitest.config.ts --pool=threads (18/18 passed)
- pnpm --filter @chemd/desktop typecheck (passed)
- pnpm --filter @chemd/desktop build (passed; known Vite lucide use-client and chunk-size warnings)
- pnpm typecheck (24/24 tasks passed)
- pnpm test (turbo tests, 78 script tests, 52 Python tests passed)
- git diff --check (passed; line-ending warnings only)
- focused eslint passed for new agent-panel/agent-tools/timeline files; App.tsx still reports existing max-lines/complexity gates deferred to M11.


### Git Commits

| Hash | Message |
|------|---------|
| `67e3606` | (see git log) |
| `e2174ee` | (see git log) |
| `7a576f8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## Session 91: Desktop UI componentization merge

**Date**: 2026-05-14
**Task**: Merge desktop-ui into desktop-ide
**Package**: desktop
**Branch**: `desktop-ide`

### Summary

Merged the `desktop-ui` refactor into `desktop-ide` while preserving the newer connected RAG and Agent panel capabilities.

### Main Changes

- Cherry-picked `desktop-ui` commit `1f1db37` instead of a normal branch merge because `desktop-ui` was based on an older baseline.
- Replaced the monolithic desktop App UI with `DesktopWorkbench`, shell/panel components, desktop hooks, and UI primitives.
- Restored connected RAG query/backfill wiring through `use-connected-rag-controller` after the UI split.
- Preserved Agent timeline contract display and patch-gate source hash integration.
- Updated the productization implementation doc with the staged M10/M11 merge result and remaining complexity debt.

Merged commits:
- d49e63c refactor(desktop)：合并桌面 UI 组件化

Validation:
- pnpm --filter @chemd/desktop typecheck (passed)
- pnpm exec vitest run apps/desktop/src/agent-panel/DesktopAgentPanel.test.tsx apps/desktop/src/agent-tools/contracts.test.ts apps/desktop/src/desktop-agent-timeline-panel.test.ts apps/desktop/src/workspace-index/desktop-postgres-rag-query-controller.test.ts apps/desktop/src/workspace-index/desktop-postgres-rag-backfill-controller.test.ts --config packages/compiler/vitest.config.ts --pool=threads (5 files / 36 tests passed)
- pnpm --filter @chemd/desktop build (passed; Vite use-client and chunk-size warnings remain)
- git diff --check (passed)
- focused eslint reports 6 complexity/max-lines errors only; deferred to M11 per user direction.

### Git Commits

| Hash | Message |
|------|---------|
| `d49e63c` | refactor(desktop)：合并桌面 UI 组件化 |

### Testing

- [OK] Desktop typecheck passed
- [OK] Focused Agent/RAG Vitest passed
- [OK] Desktop build passed
- [WARN] Focused ESLint complexity gate deferred to M11

### Status

[OK] **Completed**

### Next Steps

- Resume the desktop IDE productization plan from the next non-network-blocked slice.

## Session 92: Desktop Graph edge evidence panel

**Date**: 2026-05-14
**Task**: Desktop Graph edge evidence panel
**Package**: desktop
**Branch**: `desktop-ide`

### Summary

Completed the P3 Knowledge Map edge evidence slice with parallel view-model and UI worktrees, then integrated source-jump aware Graph edge evidence into the desktop panel.

### Main Changes

- Worker A added `edgeEvidenceRows` to the Knowledge Map view-model with from/to reaction labels, source refs, jump intents, basis, score, warnings, and evidence sources.
- Worker B added the Edge Evidence panel UI and preserved the desktop-ui lightweight row/chip style.
- Architect integration rewired the UI to consume `edgeEvidenceRows` instead of temporary raw reaction-map edges.
- Updated the productization plan to mark Graph panel edge evidence explanation/source jump complete.
- Closed both subagents after review and integration.

Merged commits:
- 3816374 feat(desktop)：增加 Knowledge Map edge evidence view-model
- e99c92b feat(desktop)：补充图谱边证据面板草案
- 9a060aa feat(desktop)：接入图谱边证据面板

Validation:
- pnpm exec vitest run apps/desktop/src/knowledge-map/desktop-knowledge-map.test.ts --config packages/compiler/vitest.config.ts --pool=threads (17/17 passed)
- pnpm --filter @chemd/desktop typecheck (passed)
- pnpm --filter @chemd/desktop exec eslint src/knowledge-map/DesktopKnowledgeMapPanel.tsx src/knowledge-map/desktop-knowledge-map.ts (passed)
- pnpm --filter @chemd/desktop build (passed; known Vite use-client and chunk-size warnings remain)
- pnpm typecheck (24/24 tasks passed)
- pnpm test (23 turbo test tasks, 78 script tests, 86 Python tests passed)
- git diff --check (passed; line-ending warnings only)

### Git Commits

| Hash | Message |
|------|---------|
| `3816374` | feat(desktop)：增加 Knowledge Map edge evidence view-model |
| `e99c92b` | feat(desktop)：补充图谱边证据面板草案 |
| `9a060aa` | feat(desktop)：接入图谱边证据面板 |

### Testing

- [OK] Knowledge Map focused tests passed
- [OK] Desktop focused lint/typecheck/build passed
- [OK] Root typecheck and root tests passed

### Status

[OK] **Completed**

### Next Steps

- Continue with the next non-network-blocked P3/P4 slice: sync result/conflict UI, Agent audit completion, or offline degradation hardening.

## Session 93: Desktop local sync result UI

**Date**: 2026-05-14
**Task**: Desktop local sync success/failure/conflict visibility
**Package**: desktop
**Branch**: `desktop-ide`

### Summary

Completed the P2 local sync result visibility slice. The desktop Local Store panel now exposes full sync outcomes instead of failed-only summaries, including success, retryable failure, skipped/pending, and conflict classification.

### Main Changes

- Worker C added `buildLocalSyncResultRows` and preserved full sync entries in `LocalSyncSummary`.
- Integrated the view-model into `LocalStorePanel` and rendered synced/failed/retryable/skipped result rows with sanitized messages.
- Added conflict-aware labels for base revision/stale revision style failures without changing the shared sync contract.
- Updated the productization implementation doc to mark sync success/failure/conflict UI and logs complete for the local-verifiable desktop path.

Merged commits:
- 3273a0e feat(desktop)：补充本地同步结果视图模型
- 6392aea feat(desktop)：接入本地同步结果列表

Validation:
- pnpm exec vitest run apps/desktop/src/desktop-local-sync-view.test.ts --config packages/compiler/vitest.config.ts --pool=threads (5/5 passed)
- pnpm --filter @chemd/desktop typecheck (passed)
- pnpm --filter @chemd/desktop build (passed; known Vite use-client and chunk-size warnings remain)
- pnpm typecheck (24/24 tasks passed)
- pnpm test (23 turbo test tasks, 78 script tests, 86 Python tests passed)
- git diff --check (passed; line-ending warnings only)
- focused eslint reports only existing `LocalStorePanel.tsx` max-lines/complexity; deferred to M11 per user direction.

### Git Commits

| Hash | Message |
|------|---------|
| `3273a0e` | feat(desktop)：补充本地同步结果视图模型 |
| `6392aea` | feat(desktop)：接入本地同步结果列表 |

### Testing

- [OK] Local sync view-model focused tests passed
- [OK] Desktop typecheck and build passed
- [OK] Root typecheck and root tests passed
- [WARN] LocalStorePanel complexity/max-lines deferred to M11

### Status

[OK] **Completed**

### Next Steps

- Continue with the next non-network-blocked desktop IDE productization slice: Agent audit/patch confirmation hardening or offline degradation coverage.

## Session 94: Desktop Agent audit replay persistence

**Date**: 2026-05-14
**Task**: Persist Agent audit timeline for replay
**Package**: desktop, storage-postgres
**Branch**: `desktop-ide`

### Summary

Completed the P3 Agent audit replay slice. Agent run persistence now includes the full audit timeline across the shared PostgreSQL contract, desktop payload builder, Rust Tauri runtime, and managed Postgres migration.

### Main Changes

- Worker A added `chemd_agent_runs.audit_timeline` to the `@chemd/storage-postgres` shared schema, runtime adapters, write queries, and contract tests.
- Worker B wired desktop runtime payloads and Rust Tauri persistence to carry `AgentRun.auditTimeline` through serde into `audit_timeline`.
- Managed Postgres migration now carries the same shared schema column and compatibility `ADD COLUMN IF NOT EXISTS` path.
- Updated the productization plan to mark Agent run auditability and explicit patch confirmation complete.

Merged commits:
- 5affb52 feat(storage-postgres)：持久化 Agent audit timeline
- 9696778 feat(desktop)：持久化 Agent audit timeline

Validation:
- pnpm --filter @chemd/storage-postgres test (8 files / 33 tests passed)
- pnpm exec vitest run apps/desktop/src/desktop-runtime-persistence.test.ts --config packages/compiler/vitest.config.ts --pool=threads (5/5 passed)
- cargo test --manifest-path apps\\desktop\\src-tauri\\Cargo.toml --lib audit_timeline -- --nocapture (2/2 passed)
- cargo test --manifest-path apps\\desktop\\src-tauri\\Cargo.toml --lib managed_migration_uses_shared_storage_columns_without_desktop_tables -- --nocapture (1/1 passed)
- pnpm --filter @chemd/storage-postgres typecheck (passed)
- pnpm --filter @chemd/desktop typecheck (passed)
- focused eslint on changed TS files (passed)
- pnpm --filter @chemd/desktop build (passed; known Vite use-client and chunk-size warnings remain)
- pnpm typecheck (24/24 tasks passed)
- pnpm test (23 turbo test tasks, 78 script tests, 86 Python tests passed)
- git diff --check (passed)

### Git Commits

| Hash | Message |
|------|---------|
| `5affb52` | feat(storage-postgres)：持久化 Agent audit timeline |
| `9696778` | feat(desktop)：持久化 Agent audit timeline |

### Testing

- [OK] Storage contract tests passed
- [OK] Desktop runtime persistence tests passed
- [OK] Rust focused audit/migration tests passed
- [OK] Root typecheck and root tests passed

### Status

[OK] **Completed**

### Next Steps

- Continue with the next non-network-blocked desktop IDE productization slice: offline/degraded capability aggregation or release smoke hardening.

## Session 95: Desktop enhanced capability degradation gate

**Date**: 2026-05-14
**Task**: Aggregate offline/degraded boundaries for enhanced desktop capabilities
**Package**: desktop scripts, docs
**Branch**: `desktop-ide`

### Summary

Completed the P3 enhanced capability degradation closure. Release readiness now exposes a static product gate proving enhanced features have explicit offline/degraded/fallback boundaries without running real network, GUI, sidecar, or database smoke.

### Main Changes

- Added `enhancedCapabilityDegradation` to `pnpm desktop:release-readiness` JSON.
- Covered PostgreSQL sync, connected RAG, embedding provider, sidecar, and Agent patch degradation boundaries.
- Preserved release readiness overall `skip` while clean-machine installer smoke and real network checks remain not-run.
- Updated release readiness docs and the productization implementation plan.

Merged commits:
- 64fd58c feat(desktop)：聚合增强能力降级门禁

Validation:
- node --test scripts/desktop-release-readiness.test.mjs (6/6 passed)
- pnpm desktop:release-readiness -- --json (reported enhancedCapabilityDegradation pass; overall skip)
- pnpm run test:scripts (78/78 passed)
- git diff --check (passed)

### Git Commits

| Hash | Message |
|------|---------|
| `64fd58c` | feat(desktop)：聚合增强能力降级门禁 |

### Testing

- [OK] Release readiness focused tests passed
- [OK] Full script tests passed
- [OK] Release readiness JSON preserved offline-only boundaries

### Status

[OK] **Completed**

### Next Steps

- Continue with P4 installer/signing/clean-machine smoke planning and any remaining productization gaps that are not blocked by real environment access.

## Session 96: Desktop managed shared schema parity

**Date**: 2026-05-14
**Task**: Prove external and managed DB use the same shared schema
**Package**: desktop scripts, docs
**Branch**: `desktop-ide`

### Summary

Closed the P2 shared schema parity gap with a static script-level test. The test compares the external `@chemd/storage-postgres` Graph/RAG/Agent schema signature against the desktop managed Postgres migration.

### Main Changes

- Added a shared schema signature test to `scripts/desktop-postgres-bundle.test.mjs`.
- Covered key Graph, RAG citation, Agent run/tool-call, and patch proposal tables and columns.
- Asserted that managed migration does not introduce desktop-only table names into the shared schema.
- Updated the productization implementation plan to mark external DB and managed DB shared schema parity complete.

Merged commits:
- 84e94d3 test(desktop)：校验 managed shared schema parity

Validation:
- node --test scripts/desktop-postgres-bundle.test.mjs (12/12 passed)
- pnpm run test:scripts (79/79 passed)
- git diff --check (passed)

### Git Commits

| Hash | Message |
|------|---------|
| `84e94d3` | test(desktop)：校验 managed shared schema parity |

### Testing

- [OK] Desktop Postgres bundle focused tests passed
- [OK] Full script tests passed

### Status

[OK] **Completed**

### Next Steps

- Continue with P4 release hardening items that can be verified locally, while keeping clean-machine installer smoke as an explicit environment/manual gate.

## Session 97: Desktop release hardening strategy

**Date**: 2026-05-14
**Task**: Define installer, signing, and upgrade strategy
**Package**: desktop docs
**Branch**: `desktop-ide`

### Summary

Closed the P4 installer/signing/upgrade strategy item with a dedicated release hardening runbook. The remaining clean-machine installer smoke stays explicit and unclaimed because it requires a real clean Windows user environment or VM.

### Main Changes

- Added `docs/desktop-ide/release-hardening-strategy.zh-CN.md`.
- Defined Windows installer targets, managed PostgreSQL staging requirements, code signing paths, updater preconditions, data retention rules, and clean-machine smoke steps.
- Linked the strategy from release readiness docs and the main productization plan.
- Marked installer/signing/upgrade strategy complete while keeping clean-machine Offline Core smoke open.

Validation:
- git diff --check (passed)

### Git Commits

| Hash | Message |
|------|---------|
| `d80c902` | docs(desktop)：明确 release hardening 策略 |

### Testing

- [OK] Documentation-only change; no runtime command required
- [OK] git diff --check passed

### Status

[OK] **Completed**

### Next Steps

- The only remaining unchecked productization item is clean-machine installer Offline Core smoke, which needs a real isolated install environment.


## Session 98: Desktop IDE 产品化重组收尾

**Date**: 2026-05-16
**Task**: Desktop IDE 产品化重组收尾
**Package**: web
**Branch**: `desktop-ide`

### Summary

完成 desktop-ide 产品化重组收尾：组件化桌面工作台与功能模块，补齐桌面 Vitest、离线 smoke、runtime smoke 与 release readiness 验证，修复 lint error；Tauri build 因当前环境缺少 cargo 被记录为阻塞。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `4670c0e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 99: Chemd 0.6 desktop finishwork

**Date**: 2026-05-17
**Task**: Chemd 0.6 desktop finishwork
**Package**: desktop
**Branch**: `develop`

### Summary

Completed Chemd 0.6 desktop finishwork with validation, build, installer artifact preflight, and Trellis archive.

### Main Changes

### Finishwork Notes

- Code commit: 2055d35
- Scope: Chemd 0.6 source extension migration, desktop workspace save/session hardening, preview and Postgres profile binding, desktop release readiness.
- Fixed finishwork lint blockers in postgres profile UI/controller and editor surface before commit.

### Verification

- git diff --check: pass
- pnpm run lint -- --quiet: pass
- pnpm --filter @chemd/desktop typecheck: pass
- pnpm --filter @chemd/desktop test: 39 files, 208 tests pass
- pnpm typecheck: 24 packages pass
- pnpm test: turbo test + scripts + Python unittest pass; Python unittest ran 86 tests
- pnpm --filter @chemd/desktop build: pass with existing Vite large chunk warning
- pnpm --filter @chemd/desktop tauri:build: pass; produced release exe, MSI, and NSIS installer
- cargo test in apps/desktop/src-tauri: 115 tests pass
- pnpm desktop:offline-core-smoke: pass
- pnpm desktop:runtime-smoke: offline core pass; DB/RAG smoke skipped because staged PostgreSQL binaries are missing
- pnpm desktop:release-readiness -- --json: artifact preflight pass; overallStatus remains skip because clean-machine installer smoke and real-network proof are explicitly not run

### Known Gaps

- pnpm desktop:postgres:verify failed because staged PostgreSQL binaries are missing: initdb, psql, postgres or pg_ctl.
- Clean-machine installer launch smoke and real-network proof were not run in this local finishwork session.


### Git Commits

| Hash | Message |
|------|---------|
| `2055d35` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 100: Reaction intelligence core finishwork

**Date**: 2026-05-17
**Task**: Reaction intelligence core finishwork
**Package**: exporter-training
**Branch**: `develop`

### Summary

Completed reaction intelligence kernel finishwork across parser, renderer, workspace index, Python services, desktop Rust tests, validation gates, and build dependency repair.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8b25e11` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 101: Phase 0 desktop IDE performance baseline instrumentation

**Date**: 2026-05-17
**Task**: Phase 0 desktop IDE performance baseline instrumentation
**Package**: desktop
**Branch**: `develop`

### Summary

Added dev-gated desktop performance metrics for workspace indexing, preview hydration, Tauri invokes, editor compile, and knowledge-map view-model construction.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 102: Phase 1 Rust workspace manifest query

**Date**: 2026-05-17
**Task**: Phase 1 Rust workspace manifest query
**Package**: desktop
**Branch**: `develop`

### Summary

Added query_workspace_index to return bounded workspace manifest rows and metadata without document source text, with synced TypeScript contracts and diagnostics coverage.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 103: Phase 2 WorkspaceDataGateway foundation

**Date**: 2026-05-17
**Task**: Phase 2 WorkspaceDataGateway foundation
**Package**: desktop
**Branch**: `develop`

### Summary

Added a frontend WorkspaceDataGateway boundary for manifest state, current-source revisions, stale guards, and cached workspace reads, then routed workspace index through it with fallback behavior preserved.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 104: Phase 3 workspace symbol gateway migration

**Date**: 2026-05-17
**Task**: Phase 3 workspace symbol gateway migration
**Package**: desktop
**Branch**: `develop`

### Summary

Routed workspace symbol indexing through the WorkspaceDataGateway only when manifest coverage is complete, preserving the legacy full-workspace path for partial or degraded gateway states.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 105: Phase 4 Rust workspace ingest plan command

**Date**: 2026-05-17
**Task**: Phase 4 Rust workspace ingest plan command
**Package**: desktop
**Branch**: `develop`

### Summary

Added build_workspace_ingest_plan to let Rust enumerate and page workspace ingest candidates, returning pending, unchanged, and skipped metadata rows without source text or compiler migration.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 106: Phase 5 lazy active dock panel construction

**Date**: 2026-05-17
**Task**: Phase 5 lazy active dock panel construction
**Package**: desktop
**Branch**: `develop`

### Summary

Replaced eager insight dock contentByPanel construction with active-panel switch rendering so inactive dock panels and agent quick-fix derivations are not rebuilt every render.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 107: Phase 5 preview hydration queue and cache

**Date**: 2026-05-17
**Task**: Phase 5 preview hydration queue and cache
**Package**: desktop
**Branch**: `develop`

### Summary

Added a desktop preview render scheduler and cache for render_chem_preview hydration while preserving base HTML, localized render failures, and stale hydration guards.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 108: Phase 6 Monaco editor surface micro-optimizations

**Date**: 2026-05-17
**Task**: Phase 6 Monaco editor surface micro-optimizations
**Package**: desktop
**Branch**: `develop`

### Summary

Memoized Monaco options, coalesced undo-redo notifications, guarded duplicate resize padding updates, and replaced source.split line counting with countSourceLines.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 109: Phase 6 Knowledge Map and window rect sync

**Date**: 2026-05-17
**Task**: Phase 6 Knowledge Map and window rect sync
**Package**: desktop
**Branch**: `develop`

### Summary

Prevented ForceGraph selection-only changes from reheating simulations and removed the per-render native maximize button rect sync while keeping resize, scale, and cleanup paths.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 110: Phase 7 local-store list pagination

**Date**: 2026-05-17
**Task**: Phase 7 local-store list pagination
**Package**: desktop
**Branch**: `develop`

### Summary

Added paged Rust local-store list command results and synchronized desktop contracts.

### Main Changes

Phase 7 local-store pagination completed on develop.

Changes:
- Extended Rust local-store list commands with cursor/limit pagination.
- Returned { entries, totalCount, nextCursor } instead of full arrays from Tauri commands.
- Kept test-only Vec helpers for existing sync/unit tests.
- Updated desktop TypeScript command contracts and reaction-intelligence artifact reader to consume page.entries.

Validation:
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml local_store_tests
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml local_store_sync_tests
- pnpm --filter @chemd/desktop typecheck
- pnpm --filter @chemd/desktop test -- store.test.ts artifact-controller.test.ts
- pnpm --filter @chemd/desktop exec eslint src/contracts.ts src/features/reaction-intelligence/artifact-controller.ts src/features/reaction-intelligence/artifact-controller.test.ts src/features/local-store/store.test.ts
- python ./.trellis/scripts/task.py validate .trellis/tasks/05-17-05-17-desktop-ide-workspace-performance
- git diff --check

Notes:
- ESLint completed with existing warnings only in contracts.ts and store.test.ts.


### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 111: Phase 8 Workbench render boundary cleanup

**Date**: 2026-05-17
**Task**: Phase 8 Workbench render boundary cleanup
**Package**: desktop
**Branch**: `develop`

### Summary

Reduced App-to-Workbench callback churn and memoized Workbench insight props.

### Main Changes

Phase 8 App/Workbench render-boundary cleanup completed on develop.

Changes:
- Memoized Workbench insight prop derivation so local shell state changes do not rebuild the dock prop bag unless active tool or parent props change.
- Stabilized Workbench shell callbacks for activity selection, preview toggles, graph close, and bottom panel close.
- Stabilized App callbacks passed into Workbench for save/open/tab/conflict operations.
- Narrowed workspace restore and sidecar autostart effects to concrete dependencies instead of whole controller objects.

Validation:
- pnpm --filter @chemd/desktop typecheck
- pnpm --filter @chemd/desktop exec eslint src/App.tsx src/features/workbench/workbench-shell.tsx
- pnpm --filter @chemd/desktop test -- App.test.ts workbench-shell.test.ts
- python ./.trellis/scripts/task.py validate .trellis/tasks/05-17-05-17-desktop-ide-workspace-performance
- git diff --check

Notes:
- ESLint completed with warnings only; these are existing App.tsx size/complexity/void-use style warnings, not blocking errors.
- Vitest matched App.test.tsx; no dedicated workbench-shell test file was present.


### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 112: Phase 9 dock panel primitives

**Date**: 2026-05-17
**Task**: Phase 9 dock panel primitives
**Package**: desktop
**Branch**: `develop`

### Summary

Extracted shared dock panel primitives and migrated sidecar/local-store panels.

### Main Changes

Phase 9 dock panel primitive cleanup completed on develop.

Changes:
- Added shared dock panel primitive constants and DockPanelButton.
- Migrated Sidecar panel to shared container, metric, message, log, action row, and button primitives.
- Migrated Local Store panel shell/list/metric/log/button constants to the same primitives while preserving business-specific sections and disabled logic.

Validation:
- pnpm --filter @chemd/desktop typecheck
- pnpm --filter @chemd/desktop exec eslint src/features/dock-panels/panel-primitives.tsx src/features/dock-panels/sidecar-panel.tsx src/features/dock-panels/local-store-panel.tsx
- python ./.trellis/scripts/task.py validate .trellis/tasks/05-17-05-17-desktop-ide-workspace-performance
- git diff --check

Notes:
- ESLint completed with existing LocalStorePanel size/complexity warnings only; no errors.
- No dedicated dock-panel tests were present, so this refactor is covered by TypeScript and lint.


### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 113: Regression review and test hardening

**Date**: 2026-05-17
**Task**: Regression review and test hardening
**Package**: desktop
**Branch**: `develop`

### Summary

Reviewed performance refactors, connected workspace ingest to Rust plans, and added regression tests.

### Main Changes

Final regression review and test hardening completed on develop.

Review findings:
- Checked the performance/refactor changes across Rust workspace commands, local-store list pagination, WorkspaceDataGateway, preview render scheduling, Knowledge Map selection-only graph updates, Workbench callback cleanup, and dock panel primitive extraction.
- Found one incomplete backend-processing loop: build_workspace_ingest_plan existed but Workspace ingest still used the old frontend file list path directly.
- Fixed that by having Workspace ingest request Rust paged ingest plans first, then passing only runnable pending/skipped files into the existing TS compile/outbox compatibility layer.
- Preserved business behavior with a fallback to the original files path if the Rust plan command fails.
- Stored backend manifest revision keys on ingest queue items so future runs can send knownRevisions and let Rust mark unchanged files.

Tests added:
- Ingest queue tests for manifest revision key persistence, knownRevisions generation, runnable plan item filtering, and plan item mapping.
- Ingest runner test for carrying manifest revision keys through outbox-save flow.
- Preview scheduler test that queued renders continue after a rejected task.
- Local-store Rust test for cursor beyond total returning an empty page without bogus nextCursor.

Validation:
- pnpm --filter @chemd/desktop test
- pnpm --filter @chemd/desktop typecheck
- pnpm --filter @chemd/desktop exec eslint src/hooks/use-local-store-controller.ts src/features/workspace-ingest/queue.ts src/features/workspace-ingest/queue.test.ts src/features/workspace-ingest/runner.ts src/features/workspace-ingest/runner.test.ts src/hooks/use-rendered-preview.test.ts
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
- python ./.trellis/scripts/task.py validate .trellis/tasks/05-17-05-17-desktop-ide-workspace-performance
- git diff --check

Notes:
- ESLint returned warnings only, no errors. Warnings are existing complexity/void-use/null-style warnings in the touched files.


### Git Commits

| Hash | Message |
|------|---------|
| `2ceb3fe77f` | feat(desktop)：优化 IDE 工作区性能 |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 114: Desktop workspace explorer and IDE surface polish

**Date**: 2026-05-18
**Task**: Desktop workspace explorer and IDE surface polish
**Package**: desktop
**Branch**: `develop`

### Summary

Completed a desktop workspace performance slice: moved workspace IO behind blocking Tauri tasks, added bounded directory-layer loading and workspace ignore settings, polished editor breadcrumbs/preview/bottom-panel behavior, updated task PRD evidence, and verified with Rust, desktop, script, typecheck, build, and offline release gates.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `3f8de85d540785ac21ae1212d621e4e500ab2048` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 115: Language contract and schema registry

**Date**: 2026-05-20
**Task**: Language contract and schema registry
**Package**: core
**Branch**: `trellis/language-contract-p0`

### Summary

Stage 1 implemented the current language contract, schema registry, kind inference policy, CLI check command, conformance fixtures, docs sync, and validation updates.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `91b9884` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 116: Quantity material reaction semantics

**Date**: 2026-05-20
**Task**: Quantity material reaction semantics
**Package**: typechecker
**Branch**: `trellis/language-contract-p0`

### Summary

Implemented quantity v2, material/batch nodes, reaction participant stoichiometry, diagnostics, docs, fixtures, and exporter/language-service propagation for plan sections 5.1-5.3.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `795f477` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 117: Condition outcome analysis schemas

**Date**: 2026-05-20
**Task**: Condition outcome analysis schemas
**Package**: parser
**Branch**: `trellis/language-contract-p0`

### Summary

Implemented plan sections 5.4-5.5: factor/outcome/attempt condition DSL, TLC lane/spot references, structured NMR/HPLC/LCMS/MS analysis normalization, exporter measurements, language-service snippets, docs, fixtures, and validation coverage. Verification: pnpm typecheck; pnpm test; pnpm chemd validate fixtures/language/valid/condition-analysis-schemas.chemd; pnpm chemd check fixtures/language/valid --target validate --format json; git diff --check. Lint remains blocked by ESLint 10.4.0 scopeManager.addGlobals runtime error before rule execution.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `af27f77` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 118: Procedure runtime trace

**Date**: 2026-05-20
**Task**: Procedure runtime trace
**Package**: runtime-lab
**Branch**: `trellis/language-contract-p0`

### Summary

Implemented plan sections 6.1-6.4: StepFamily schema contract, brace-based procedure controls, runtime preflight context/CLI, source-authored trace validation, replay to LabState, docs, fixtures, and tests. Verification: pnpm typecheck; pnpm test; chemd validate/check fixtures; preflight smoke; docs coverage. Lint remains blocked by existing ESLint 10.4.0 scopeManager.addGlobals runtime error.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `da831b1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
