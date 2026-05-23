# PRD: Hybrid Reaction Evidence Contract

## Background

Stage 1 introduced canonical reaction intelligence input in TypeScript. Stage 2
must bridge that input to the Python `chem-cluster-service` job contract without
allowing semantic-only reactions to masquerade as computed chemistry inputs.

## Requirements

1. Convert canonical reaction intelligence input into a service job only for
   reactions that have `canonical_rxn_smiles`.
2. Preserve source hash, participant signature, reaction family, procedure
   signature, and condition signature in each service reaction input.
3. Emit explicit warnings for reactions skipped from the computed job because
   canonical reaction SMILES are unavailable.
4. Keep provider policy explicit: no network by default, missing dependencies
   skipped unless configured by the caller.
5. Keep Python contract validation strict for service jobs.

## Non-goals

- No provider scoring or clustering changes.
- No new language syntax.
- No remote API dependency.
- No trained model integration.

## Acceptance Criteria

- TypeScript tests cover job conversion and skipped-reaction warnings.
- Python contract tests still pass unchanged or with aligned fixture updates.
- Exporter-training typecheck and tests pass.
- Chem cluster service contract tests pass.
