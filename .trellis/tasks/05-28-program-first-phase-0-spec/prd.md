# Phase 0: Program-First Breaking-Change Spec

## Goal

Freeze the Chemd program-first contract before implementation changes begin.
This phase turns `D:\download\chemd-program-rewrite-implementation-plan.md`
into repository-owned specifications for the new language, AST, and export
boundaries.

## Scope

- Publish `apps/docs/content/docs/{en,zh}/program-v1/language.mdx`.
- Publish `apps/docs/content/docs/{en,zh}/program-v1/ast.mdx`.
- Publish `apps/docs/content/docs/{en,zh}/program-v1/exports.mdx`.
- Update README positioning so the repository no longer describes the future
  direction as Markdown-first or legacy-compatible.
- Keep runtime code unchanged in this phase.

## Non-Goals

- Do not replace `parseChemd` yet.
- Do not edit `packages/core/src/ast.ts` yet.
- Do not remove legacy parser files yet.
- Do not update Desktop IDE behavior yet.

Those changes start in later phases once the contract is reviewable.

## Required Decisions

- One `.chemd` file is one `chemd/program-v1` module/program.
- Program declarations are the semantic source of truth.
- Markdown becomes documentation only through doc comments and `/*md */`
  regions.
- Legacy frontmatter, `:::` structured blocks, `template/use`, and column
  layout syntax are removed without compatibility fallback.
- Export payloads distinguish declaration-derived facts from narrative
  documentation and agent audit records.

## Verification

- `rg -n "program-first|chemd/program-v1|E_LEGACY_FENCED_BLOCK_REMOVED|ChemdProgramDocument|raw_children" apps/docs/content/docs/en/program-v1 apps/docs/content/docs/zh/program-v1 README.md README.zh-CN.md .trellis/tasks/05-28-program-first-phase-0-spec/prd.md`
- `git diff --check`

Phase 0 is documentation-only, so package tests are not required unless runtime
files change.
