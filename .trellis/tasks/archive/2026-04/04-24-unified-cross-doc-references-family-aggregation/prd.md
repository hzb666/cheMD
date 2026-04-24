# Unified Cross-Doc References And Family Aggregation

## Goal

Make scoped cross-document references a first-class contract across structured chemd fields, then add a family/campaign aggregation export so training can explicitly see both authored cross-report links and higher-level "same procedure/template with changed substrate or outcome" relationships.

## Requirements

- Generalize scoped `doc-id#node-id` reference handling beyond `reaction.prev`.
- Keep field-level target-kind checking strict; cross-document refs must fail closed.
- Preserve current local-reference behavior and current `condition-varies` behavior.
- Allow structured fields such as `ref`, `reaction`, `standard`, sample lineage refs, artifact refs, and participant refs to resolve scoped refs when an external context supplies compatible targets.
- Export resolved cross-document structured references into semantic and understanding layers without inventing unsupported links.
- Add family/campaign aggregation output that can group multiple document-scoped understandings into stronger cross-document relations such as same route family, same procedure template, or same substrate-expansion family.
- Keep single-document export document-scoped; family/campaign relations must come from the aggregation layer, not from single-document heuristics alone.

## Acceptance Criteria

- [x] Scoped cross-document refs resolve through a shared reference contract, not a route-only special case.
- [x] Typechecker validates target kind for scoped refs across supported structured fields.
- [x] Single-document exports preserve explicit cross-document structured references and external placeholder nodes where appropriate.
- [x] Campaign/family aggregation emits grouped relations or summaries for same-procedure / same-template / substrate-expansion style document sets.
- [x] New training projections make the distinction clear: explicit authored cross-doc refs vs derived family-level grouping.
- [x] Regression tests cover good/base/bad cross-document reference cases and family aggregation cases.
- [x] Relevant Trellis specs are updated.

## Technical Notes

- Reuse `parseReferenceId()` and scoped lookup helpers instead of creating a second cross-doc parsing path.
- Prefer an external typed-object context keyed by scoped ref id so target-kind checking stays deterministic.
- Family aggregation should consume `ChemdTrainingUnderstandingV1` outputs and remain separate from document compilation.
