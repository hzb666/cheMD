# Desktop IDE Map Production Implementation

## Goal

Deliver the production-ready Chemd desktop IDE map scope described in
`docs/chemd-production-ide-knowledge-map-implementation-plan.zh-CN.md`.

The implementation loop must keep the desktop IDE usable while adding:

- Monaco snippets, completions, hover, definition, and references.
- Workspace symbol index and cross-document reference navigation.
- Semantic node rendering contracts and preview integration.
- Reaction association, clustering, and inspectable map layout.
- Persisted Graph/RAG/training records where the feature crosses storage.

## Source Of Truth

- `docs/chemd-production-ide-knowledge-map-implementation-plan.zh-CN.md`
- `docs/chemd-monaco-autocomplete-prd.zh-CN.md`
- `docs/chemd-monaco-autocomplete-implementation-plan.zh-CN.md`
- `docs/chemd-rendering-and-reaction-clustering-master-prd.zh-CN.md`
- `docs/chemd-semantic-node-rendering-prd.zh-CN.md`
- `docs/chemd-reaction-clustering-tmap-prd.zh-CN.md`

## Requirements

- Keep implementation in isolated child worktrees and merge only reviewed,
  validated slices into `desktop-ide-map`.
- Keep shared contracts, root package configuration, and app entry integration
  under architect control.
- Keep code componentized and toolized; do not put business logic into
  application entry files or large UI files.
- Prefer package-level language, index, rendering, and clustering helpers over
  ad hoc UI-only logic.
- Update the implementation plan after each merged stage with status and
  validation evidence.
- Treat bundle size, network availability, or missing local service dependencies
  as engineering risks to mitigate, not as reasons to stop the workflow.

## Acceptance Criteria

- [ ] Completion/snippet MVP works in the desktop Monaco editor with tests.
- [ ] Cross-document references are indexed from workspace files and exposed to
      Monaco navigation providers.
- [ ] Semantic node render DTOs are produced from compiled documents and
      previewed without hard-coding node-specific rendering in `App.tsx`.
- [ ] Reaction cluster records can be built deterministically from graph/RAG
      records and rendered as list/detail/map-ready data.
- [ ] Map visualization has a production fallback when TMAP or layout workers
      are unavailable.
- [ ] Targeted package tests, type checks, and desktop build checks are run or
      explicitly classified with exact blockers.
- [ ] Trellis session records and implementation documents reflect the actual
      merged code state.

## Coordination Notes

- First parallel wave should avoid shared files:
  - language-service completion providers and tests.
  - workspace reference index package/helpers and tests.
  - reaction clustering pure data builders and tests.
- App integration, dependency edits, storage contract edits, and final release
  gates are serialized in the architect worktree.

## First-Wave Integration Record

- `desktop-ide-map-completion-ls` merged through
  `feat(language-service)：合并 Chemd completion core`.
  - Added Monaco-neutral `getChemdCompletions(request)`.
  - Covered reaction/molecule snippets, Chemd block field suggestions, `kind:`
    enum suggestions, and `stage:` enum suggestions.
  - Main validation passed `pnpm --filter @chemd/language-service test` with
    18 tests, `pnpm --filter @chemd/language-service typecheck`, and
    `git diff --check`.

- `desktop-ide-map-reaction-clusters` was integrated only by cherry-picking the
  clean exporter-training adapter commit `4505d50`.
  - Added `buildReactionClusterViewModel()` and
    `findReactionClusterDetail()` to `@chemd/exporter-training`.
  - The adapter produces cluster list/detail, members, similarity edges,
    evidence summary, citation/source IDs, warnings, and empty-data summaries.
  - Main validation passed `pnpm --filter @chemd/exporter-training test` with
    23 tests, `pnpm --filter @chemd/exporter-training typecheck`, and
    `git diff --check`.

- `desktop-ide-map-workspace-index` was not merged.
  - It repeatedly moved outside the approved write scope by creating a new
    `packages/workspace-index` package.
  - The agent was stopped; workspace indexing will be re-cut as a stricter
    language-service-only slice.

- `desktop-ide-map-workspace-symbol-core` merged through
  `feat(language-service)：合并 workspace symbol index`.
  - Added `buildChemdWorkspaceSymbolIndex()` plus lookup helpers under
    `@chemd/language-service`.
  - The index records per-document status, source hash, symbols by kind/name,
    diagnostics summary, and failed-document isolation.
  - Main validation passed `pnpm --filter @chemd/language-service test` with
    22 tests, `pnpm --filter @chemd/language-service typecheck`, and
    `git diff --check`.
