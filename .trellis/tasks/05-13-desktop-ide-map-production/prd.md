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
- Keep final style refactor and UI componentization as the last productization
  stage after offline/product functionality is complete.
- For the final UI stage, use the user-provided desktop IDE screenshot as the
  visual reference and
  `D:\Code\LabStorageManager\docs\2026-03-24-lint_complexity_summary.md` as
  the large-file/complexity governance reference.

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
- [ ] Final style refactor and UI componentization are completed after the
      functional path is production-ready.
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

- `desktop-ide-monaco-completion-provider` merged through
  `feat(desktop)：合并 Monaco Chemd 补全`.
  - Registered the desktop Monaco completion provider against the
    Monaco-neutral `getChemdCompletions()` core.
  - Provider logic lives in `apps/desktop/src/monaco-chemd-completion.ts`; the
    editor component stays under the file-size boundary.
  - Main validation passed `pnpm --filter @chemd/desktop typecheck`, focused
    desktop ESLint, `pnpm --filter @chemd/desktop build`, and
    `git diff --check`.

- `desktop-ide-current-reference-completion` merged through
  `feat(language-service)：合并当前文档引用补全`.
  - Added `getChemdReferenceCompletions(request, context)` in
    `@chemd/language-service`.
  - The provider suggests local `@symbolId` references only at explicit
    reference trigger positions and degrades to an empty list without
    `compileOutput`.
  - Main validation passed `pnpm --filter @chemd/language-service test` with
    26 tests, `pnpm --filter @chemd/language-service typecheck`, and
    `git diff --check`.

- `desktop-ide-renderable-node-core` merged through
  `feat(renderer-json)：合并可渲染节点 DTO`.
  - Added `buildRenderableNodeTree(document, options?)` plus renderable node,
    directive, tree, and source-ref DTOs in `@chemd/renderer-json`.
  - The DTO layer keeps layout/template containers explicit, marks heavy nodes
    for lazy hydration, and falls back to placeholder directives when render
    data is unavailable.
  - Main validation passed `pnpm --filter @chemd/renderer-json test` with
    9 tests, `pnpm --filter @chemd/renderer-json typecheck`, and
    `git diff --check`.

- `desktop-ide-hover-definition-core` merged through
  `feat(language-service)：合并 hover 和 definition core`.
  - Added Monaco-neutral `getChemdHover(request, context)` and
    `getChemdDefinition(request, context)` in `@chemd/language-service`.
  - Hover now exposes symbol metadata, diagnostics at position, source line,
    and current-document reference target data without app coupling.
  - Definition resolves `@symbolId` and bare symbol tokens to current-document
    symbol ranges; cross-document navigation remains a later integration.
  - Main validation passed `pnpm --filter @chemd/language-service test` with
    33 tests, `pnpm --filter @chemd/language-service typecheck`, and
    `git diff --check`.

- `desktop-ide-renderable-html-shell` merged through
  `feat(renderer-html)：合并可渲染节点 HTML shell`.
  - Added `renderRenderableHtml(tree, options?)` in `@chemd/renderer-html`.
  - The shell emits stable `data-chemd-*` attributes, escaped source refs,
    recursive layout/template/text rendering, and lazy hydration placeholders.
  - Architect integration updated `pnpm-lock.yaml` for the new
    `@chemd/renderer-json` workspace dependency.
  - Main validation passed `pnpm --filter @chemd/renderer-html test` with
    9 tests, `pnpm --filter @chemd/renderer-html typecheck`, and
    `git diff --check`.

- `desktop-ide-workspace-reference-completion` merged through
  `feat(language-service)：合并跨文档引用补全 core`.
  - Added Monaco-neutral `getChemdWorkspaceReferenceCompletions()` in
    `@chemd/language-service`.
  - Completion items read `ChemdWorkspaceSymbolIndex`, preserve document
    identity/source hash/stale metadata, and avoid current-block self
    references.
  - Main validation passed `pnpm --filter @chemd/language-service test` with
    37 tests, `pnpm --filter @chemd/language-service typecheck`, and
    `git diff --check`.

- `desktop-ide-monaco-hover-definition` merged through
  `feat(desktop)：合并 Monaco hover 和 definition`.
  - Registered desktop Monaco hover and definition providers against the
    Monaco-neutral language-service navigation core.
  - Provider state follows the existing per-URI compile output cache pattern
    and keeps `MonacoChemdEditor.tsx` to registration/update/cleanup wiring.
  - Main validation passed `pnpm --filter @chemd/desktop typecheck`, focused
    desktop ESLint, `pnpm exec vitest run
    apps/desktop/src/monaco-chemd-navigation.test.ts`, `pnpm --filter
    @chemd/desktop build`, and `git diff --check`.
  - `pnpm install --frozen-lockfile` was required once after the earlier
    renderer-html dependency addition to refresh local workspace symlinks.

- `desktop-ide-monaco-code-actions` merged through
  `feat(desktop)：合并 Monaco code actions`.
  - Registered a desktop Monaco code action provider over existing
    language-service quick-fix DTOs.
  - Provider state follows the per-URI compile output cache pattern and maps
    quick fixes to Monaco workspace edits with proposal metadata.
  - Main validation passed `pnpm --filter @chemd/desktop typecheck`, focused
    desktop ESLint, the Monaco code-action provider test, desktop build, and
    `git diff --check`.

- `desktop-ide-workspace-symbol-helper` merged through
  `feat(desktop)：合并 workspace symbol index helper`.
  - Added `buildDesktopWorkspaceSymbolIndex(input)` as a pure desktop helper
    for building `ChemdWorkspaceSymbolIndex` from workspace file entries.
  - The helper scans only Chemd markdown documents, records skipped/read/compile
    failures, and delegates symbol extraction to `@chemd/language-service`.
  - Main validation passed `pnpm --filter @chemd/desktop typecheck`, focused
    desktop ESLint, the workspace symbol helper test, desktop build, and
    `git diff --check`.
