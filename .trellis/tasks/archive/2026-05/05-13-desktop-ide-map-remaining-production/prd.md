# Desktop IDE Map Remaining Production Closure

## Goal

Finish the remaining unchecked goals in `docs/chemd-production-ide-knowledge-map-implementation-plan.zh-CN.md` on top of `desktop-ide-map` without touching other worktrees.

## Current Evidence

- `desktop-ide-map` started this task from `6b96420 chore(trellis)：创建地图剩余闭环任务`.
- Core IDE map capabilities already existed: completion/snippets, cross-document index, hover/definition/references, code actions, semantic render tree, reaction map canvas/filter/inspector, full build/typecheck/test/offline smoke.
- The remaining code goals are now merged:
  - Monaco diagnostic/template hover details: merge `111e450`, slice `3f0e133`.
  - Preview/source-ref/cluster badge interaction: merge `71bdea0`, slice `a216783`.
  - Independent TMAP worker skeleton and missing-dependency classification: merge `bf02237`, slice `8553866`.
- Installer artifact smoke now passes after `pnpm --filter @chemd/desktop tauri:build` produced release exe, MSI, and NSIS artifacts.
- Clean-machine install smoke still requires a real clean environment and must not be replaced by artifact preflight evidence.

## Parallel Slices

### Slice A: Monaco Hover Details

Write scope:
- `apps/desktop/src/monaco/**`
- focused tests under `apps/desktop/src/monaco/**`

Acceptance:
- [x] Hover over diagnostic range displays diagnostic code/message and quick fix count.
- [x] Hover over template name displays template params when available.
- [x] Existing symbol/reference hover, definition, references, and code action behavior remains stable.

### Slice B: Semantic Preview Source Refs

Write scope:
- `apps/desktop/src/knowledge-map/**`
- `apps/desktop/src/styles/panels.css`
- focused tests for desktop preview/source-ref view-model or components

Acceptance:
- [x] Knowledge/preview panel can expand reaction renderable nodes.
- [x] Evidence/source refs are visible and can produce a source-jump intent/callback from component logic.
- [x] Cluster badge is visible for reaction nodes when map membership exists.
- [x] Logic stays in helper/view-model/component files, not `App.tsx`.

### Slice C: TMAP Worker

Write scope:
- `services/chem-cluster-service/**`
- related scripts/tests/docs only if needed

Acceptance:
- [x] Worker can run independently from the app runtime.
- [x] Worker accepts graph/layout input and writes layout artifact format compatible with `@chemd/reaction-map`.
- [x] Missing TMAP dependency produces explicit SKIP/ERROR classification.
- [x] Worker failure does not affect IDE authoring.

## Serial Integration / Verification

- Main architect owns shared docs, root config, dependencies, integration commits, merges, cleanup, and Trellis recording.
- Installer artifact smoke passed with release artifacts present.
- Clean-machine smoke remains an external/manual acceptance item unless a real clean install environment is provided.

## Required Verification

- [x] Targeted tests for changed modules.
- [x] `pnpm --filter @chemd/desktop build`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- Desktop smoke scripts where relevant:
  - [x] `pnpm desktop:offline-core-smoke`
  - [x] `pnpm desktop:runtime-smoke`
  - [x] `pnpm desktop:offline-release-smoke`
  - [x] `pnpm desktop:installer-offline-smoke`
