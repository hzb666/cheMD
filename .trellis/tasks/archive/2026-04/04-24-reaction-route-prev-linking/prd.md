# Reaction Route Prev Relation And Cross-Doc Linking

## Goal

Add first-class reaction route semantics so a reaction can declare its route membership and predecessor reactions. The compiler must infer successor links, diagnose broken route topology, and improve cross-document reaction reference association for route graphs.

## Requirements

- Support reaction-level `route` and `prev` authored fields.
- Allow `prev` to reference one or more predecessor reactions.
- Keep authored input minimal: users write `prev`; compiler infers `next`.
- Preserve existing `condition-varies` semantics; route graphs are separate from optimization graphs.
- Improve cross-document reaction reference resolution so route edges can point to reactions outside the current document.
- Export route semantics into training export / understanding layers without mutating source truth.
- Emit compiler/typechecker diagnostics for unresolved predecessors, cycles, orphan steps, and route graph ambiguities.

## Acceptance Criteria

- [x] Parser and AST preserve `route` and `prev` on reaction nodes.
- [x] Typechecker resolves reaction `prev` references, including supported cross-document refs.
- [x] Compiler output contains inferred `next` route relations and route diagnostics.
- [x] Training export includes route entities/links or route logic sufficient for downstream learning.
- [x] Existing condition variation behavior stays intact.
- [x] Regression tests cover good/base/bad route cases and cross-document refs.
- [x] Relevant Trellis specs are updated.

## Technical Notes

- Prefer `prev` as the single authored dependency edge; infer `next` from reverse edges.
- Treat route topology as a DAG-oriented graph with diagnostics for cycles and disconnected steps.
- Do not overload `condition-varies` or sample lineage fields for reaction route semantics.
