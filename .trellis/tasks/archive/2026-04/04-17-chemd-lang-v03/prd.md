# Implement chemd-lang v0.3 Semantic Core

## Goal
Implement the v0.3 internal chemd language layer described in `docs/v0.3` without changing the existing Markdown/block authoring surface.

## Requirements
- Preserve current v0.1 author syntax and parse/resolve/render behavior.
- Add an internal diagnostics contract with stable v0.3 codes and quick-fix metadata.
- Add a step ontology that lowers `procedure`, `analysis`, and `observation` content into canonical step/event nodes.
- Add a typechecker that builds a typed semantic graph from a resolved chemd document.
- Add runtime planning, preflight, trace event, and replay support over typed graph and step graph inputs.
- Add LNF output that represents typed objects, lowered steps, observations, diagnostics, and optional trace.
- Extend training export to include v0.3 LNF and procedure/observation task pairs.
- Integrate compiler output so callers can inspect typed graph, step graph, run plan, preflight, LNF, and training export.

## Acceptance Criteria
- [ ] Existing Markdown/block syntax remains valid and renderable.
- [ ] `compileChemd` exposes v0.3 semantic artifacts while keeping existing result fields.
- [ ] Procedure lowering handles Chinese and English ordered/prose steps with raw text retained.
- [ ] Quantity and status normalization preserve raw values and emit diagnostics on invalid values.
- [ ] Runtime preflight emits v0.3 diagnostics for missing capabilities/resources.
- [ ] LNF and training export use the compiled internal layer, not a new author DSL.
- [ ] Unit tests cover good, base, and bad cases for the v0.3 chain.
- [ ] Relevant package tests and typechecks pass.

## Technical Notes
- Implement as additive workspace packages: `diagnostics`, `step-ontology`, `typechecker`, `runtime-lab`, `runtime-trace`, and `lnf`.
- Keep cross-package contracts exported from package public entry points.
- Prefer pure transforms and diagnostics over thrown errors.
- Do not modify unrelated existing user changes.
