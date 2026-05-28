# Phase 5: Renderer, export, and LNF replacement

## Goal

Replace renderer, JSON/DOCX export, training export, RAG, and LNF surfaces
that still depend on legacy `ChemdDocument.children`, `raw_children`,
`markdown_blocks`, or `chemd-lnf/v0.5`.

## Scope

- `packages/semantic-rendering/src/*`
  - Add `ProgramRenderDocument` view model for renderer consumers.
- `packages/renderer-html/src/*`
  - Render program module, meta, doc comments, declarations, procedures,
    diagnostics, and agent audit sections from the program view model.
- `packages/renderer-json/src/*`
  - Emit `chemd-program-json/v1` with `program`, `semantic`, and diagnostics.
  - Remove legacy body serialization from primary output.
- `packages/renderer-docx/src/*`
  - Emit bridge payload `version: "v1.0"` with program sections.
  - Render DOCX markdown from program docs/declarations/agent audit.
- `packages/lnf/src/*`
  - Introduce `chemd-lnf/v1.0` source/program shape and remove legacy
    migration summary as the primary contract.
- `packages/exporter-training/src/*`
  - Introduce `chemd-training-export/v0.3`, `source_layer.program`,
    documentation blocks, declaration facts, agent audit exports, and
    RAG chunk kind/truth-source tagging.
- `packages/compiler/src/index.ts`
  - Remove Phase 4 legacy bridge usage where replaced by program-native
    render/export/LNF APIs.
- `packages/cli/src/*`
  - Update export tests/expectations for v1 LNF and v0.3 training payloads.

## Boundaries

- Do not modify root `docs/`; docs updates belong under `apps/docs`.
- Do not reintroduce `:::` compatibility, legacy lowering, or hidden adapters.
- Keep public outputs explicit about program source truth.
- Storage, language service, and Desktop IDE are Phase 6 except for compile
  fallout caused by changed export shapes.

## Verification

- `pnpm --filter @chemd/semantic-rendering test`
- `pnpm --filter @chemd/renderer-html test`
- `pnpm --filter @chemd/renderer-json test`
- `pnpm --filter @chemd/renderer-docx test`
- `pnpm --filter @chemd/lnf test`
- `pnpm --filter @chemd/exporter-training test`
- `pnpm --filter @chemd/compiler test`
- `pnpm --filter @chemd/cli test`
- Relevant package typechecks
- `pnpm chemd export packages/compiler/fixtures/program-golden-suzuki-screen.chemd --format json`
- `pnpm chemd export packages/compiler/fixtures/program-golden-suzuki-screen.chemd --format lnf`
- `pnpm chemd export packages/compiler/fixtures/program-golden-suzuki-screen.chemd --format training`
- `pnpm chemd export packages/compiler/fixtures/program-golden-suzuki-screen.chemd --format rag`
- `git diff -- docs --name-only`
- `git diff --check`
