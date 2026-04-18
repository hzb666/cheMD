# Complete cheMD Language Package Goals

## Goal

Implement the valuable, non-regressive goals from
`docs/chemd_package_task_breakdown_code_corrected.md` in staged slices.

## Requirements

- Keep `:::chemd` as the canonical authoring surface.
- Preserve semantic AST kinds as `molecule` and `reaction`.
- Support explicit `kind:` and legacy surface migration.
- Add explicit procedure steps while preserving prose lowering.
- Move normalized semantic facts out of renderers into typed/LNF/export layers.
- Keep runtime, training, JSON, HTML/DOCX, Web, service DTOs, and scripts aligned.
- After every stage, review the diff, run targeted validation, and fix issues before moving on.
- Do not implement plan items that are already superseded by current code.

## Acceptance Criteria

- [x] New generated molecule/reaction authoring paths use `:::chemd` with `kind:`.
- [x] Legacy `:::molecule` / `:::reaction` parser compatibility is removed; migration/audit scripts handle conversion before compile.
- [x] AST, typed graph, LNF, JSON, and training export preserve semantic kind and surface origin.
- [x] Procedure supports explicit steps and falls back to existing prose lowering.
- [x] Renderer JSON does not perform condition/TLC semantic normalization by itself.
- [x] Runtime/run plan can carry step source and explicit/lowered distinction.
- [x] Web and chem-service contracts map molecule/reaction data to canonical `chemd` fields.
- [x] Migration/audit scripts exist for legacy surface syntax.
- [x] Targeted tests, root `pnpm test`, root `pnpm typecheck`, and relevant lint checks pass.

## Technical Notes

- Use phased implementation rather than one broad rewrite.
- Prefer shared core/package contracts over renderer- or UI-local inference.
- Follow existing package tests and strict TypeScript patterns.
- Update `.trellis/spec/` where new cross-layer contracts are established.
