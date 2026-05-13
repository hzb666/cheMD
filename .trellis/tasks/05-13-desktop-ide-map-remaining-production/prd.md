# Desktop IDE Map Remaining Production Closure

## Goal

Finish the remaining unchecked goals in `docs/chemd-production-ide-knowledge-map-implementation-plan.zh-CN.md` on top of `desktop-ide-map` without touching other worktrees.

## Current Evidence

- `desktop-ide-map` is clean at `cd94525`.
- Core IDE map capabilities already exist: completion/snippets, cross-document index, hover/definition/references, code actions, semantic render tree, reaction map canvas/filter/inspector, full build/typecheck/test/offline smoke.
- Remaining unchecked items are focused around hover detail, preview/source-ref interaction, TMAP worker, save/restart proof, and installer/clean-machine evidence.

## Parallel Slices

### Slice A: Monaco Hover Details

Write scope:
- `apps/desktop/src/monaco/**`
- focused tests under `apps/desktop/src/monaco/**`

Acceptance:
- Hover over diagnostic range displays diagnostic code/message and quick fix count.
- Hover over template name displays template params when available.
- Existing symbol/reference hover, definition, references, and code action behavior remains stable.

### Slice B: Semantic Preview Source Refs

Write scope:
- `apps/desktop/src/knowledge-map/**`
- `apps/desktop/src/styles/panels.css`
- focused tests for desktop preview/source-ref view-model or components

Acceptance:
- Knowledge/preview panel can expand reaction renderable nodes.
- Evidence/source refs are visible and can produce a source-jump intent/callback from component logic.
- Cluster badge is visible for reaction nodes when map membership exists.
- Logic stays in helper/view-model/component files, not `App.tsx`.

### Slice C: TMAP Worker

Write scope:
- `services/chem-cluster-service/**`
- related scripts/tests/docs only if needed

Acceptance:
- Worker can run independently from the app runtime.
- Worker accepts graph/layout input and writes layout artifact format compatible with `@chemd/reaction-map`.
- Missing TMAP dependency produces explicit SKIP/ERROR classification.
- Worker failure does not affect IDE authoring.

## Serial Integration / Verification

- Main architect owns shared docs, root config, dependencies, integration commits, merges, cleanup, and Trellis recording.
- Installer artifact and clean-machine smoke may remain SKIP if release artifacts or clean machine are unavailable, but must be reported as SKIP rather than pass.

## Required Verification

- Targeted tests for changed modules.
- `pnpm --filter @chemd/desktop build`
- `pnpm typecheck`
- `pnpm test`
- Desktop smoke scripts where relevant:
  - `pnpm desktop:offline-core-smoke`
  - `pnpm desktop:runtime-smoke`
  - `pnpm desktop:offline-release-smoke`
  - `pnpm desktop:installer-offline-smoke`
