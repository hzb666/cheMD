# Phase 0: Language Platform Feature Matrix and Spec Alignment

## Goal

Produce the source-of-truth feature matrix for the Chemd language platform and
align the Trellis development specs with the current program-first architecture.
This phase prepares the later implementation phases by making the current state,
gaps, and verification commands explicit.

## Scope

- Create a matrix that classifies AST, parser, diagnostics, references,
  typechecking, compiler, runtime state, diff, exports, storage, CLI, workspace
  indexing, and docs as implemented, partial, missing, or intentionally out of
  scope.
- Update stale `.trellis/spec/**` guidance that still describes Chemd as a
  Markdown-first parser/compiler pipeline.
- Preserve the parent task roadmap and clarify per-phase validation commands.

## Non-Goals

- No IDE UI work.
- No product behavior change.
- No public API rewrite in this phase.
- No attempt to solve all missing language features before the matrix is stable.

## Acceptance Criteria

- A feature matrix exists in this task directory and can be used by later child
  tasks as the checklist for completion.
- Parser, resolver, and compiler backend specs describe program-v1 and
  `ChemdProgramDocument` rather than Markdown/frontmatter/block-schema as the
  primary contract.
- Stale wording is removed or explicitly quarantined as legacy compatibility.
- Phase 1 through Phase 9 have concrete next actions and verification commands.
- Validation includes whitespace checks and targeted grep checks for stale
  Markdown-first guidance.

## Verification

- `python ./.trellis/scripts/task.py validate .trellis/tasks/06-03-language-platform-phase-0-matrix-specs`
- `git diff --check`
- `rg -n "Markdown source|frontmatter|structured blocks|parse-frontmatter|ChemdDocument|Language v0\\.3|:::chemd|:::molecule|:::reaction" .trellis/spec/parser .trellis/spec/resolver .trellis/spec/compiler`

## Notes

This phase intentionally writes durable planning artifacts before feature code.
Later phases may update this matrix when implementation evidence changes, but
they should not claim a feature is complete without tests or source-backed
behavior.
