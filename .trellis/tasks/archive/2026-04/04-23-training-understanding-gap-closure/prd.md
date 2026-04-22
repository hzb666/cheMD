# Training Understanding Gap Closure

## Goal

Close the practical gaps between the current Chemd parser/AST/export pipeline and a training-ready experiment-understanding data foundation.

## Requirements

- Add golden fixtures that verify `compileChemd()` emits stable `lnf`, `trainingExport`, `ragExport`, `trainingUnderstanding`, and task dataset projections.
- Strengthen procedure and observation logic without making author-facing Markdown heavy.
- Preserve field-level evidence and source positions for training-relevant facts.
- Add sample lineage and artifact/evidence representation so outcomes can be traced to physical and analytical evidence.
- Add chemistry feature references as optional training/export metadata without binding the exporter to a chemistry backend.
- Strengthen quality gates so weak, missing, inferred, or conflicting facts are routed to the right training use.
- Expand task dataset projections from `trainingUnderstanding`, not from the full audit export.

## Acceptance Criteria

- [x] Golden fixture tests cover explicit procedure, observation, analysis, sample, artifact, source-span, and projection cases.
- [x] Procedure steps support explicit reaction linkage and richer step metadata, and preserve confidence/source provenance.
- [x] Observation events support explicit step linkage and evidence/time metadata.
- [x] Training field evidence includes source span metadata where parser source positions are available.
- [x] Sample lineage and artifact/evidence links are represented in AST, typed graph/export projections, and training understanding.
- [x] Chemistry feature references can be exported and projected without requiring RDKit or chem-service at runtime.
- [x] Training quality separates RAG, SFT, eval, regression, and review-only eligibility.
- [x] Task dataset includes additional examples for repair, normalization explanation, procedure reasoning, observation events, evidence tracing, and QA/context where data exists.
- [x] Package-level tests and typechecks pass for changed packages.
- [x] Cross-layer documentation/spec notes are updated.

## Verification Notes

- `pnpm --filter @chemd/parser test` passed.
- `pnpm --filter @chemd/typechecker test` passed.
- `pnpm --filter @chemd/exporter-training test` passed.
- `pnpm --filter @chemd/compiler test` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed across all 18 workspaces.
- `pnpm test` passed across workspace tests and script tests.

## Technical Notes

- Keep `trainingExport` as the full audit asset.
- Keep `ragExport` as the retrieval-only projection.
- Keep LoRA/SFT/task examples derived from `trainingUnderstanding`.
- Do not re-parse raw source inside `@chemd/exporter-training`.
- Prefer additive schema extensions; avoid breaking existing consumers.
- Treat auto-lowered procedure/observation logic as inferred and quality-gated unless explicitly authored.
