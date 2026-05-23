# PRD: Hybrid Reaction Canonical Input

## Background

Chemd reaction intelligence already has semantic graph features and optional
computed chemistry providers. The next clustering architecture needs a stable
canonical reaction input layer so computed providers can operate from Chemd
exports without duplicating parser or language rules.

## Requirements

1. Build canonical reaction intelligence inputs from existing
   `ChemdTrainingGraphIndexV1` reaction features.
2. Preserve Chemd semantic context fields such as reaction family, procedure
   signature, condition signature, route id, changed variables, and controlled
   variables.
3. Carry canonical reaction SMILES only when an existing chemistry feature ref
   can provide it; do not infer reaction SMILES from prose or author text.
4. Emit explicit warnings when computed chemistry input is unavailable.
5. Keep this stage inside `@chemd/exporter-training`; do not change Chemd
   language syntax, parser, resolver, or compiler behavior.

## Non-goals

- No new Chemd language fields.
- No RDKit, RXNFP, RXNMapper, FAISS, or trained model integration.
- No strict cluster generation in this stage.
- No CLI or desktop UI changes in this stage.

## Acceptance Criteria

- Unit tests cover reactions with and without external chemistry feature refs.
- The exported input shape is typed and re-exported from `@chemd/exporter-training`.
- Missing computed input produces warnings rather than silent omission.
- `pnpm --filter @chemd/exporter-training test` passes.
- `pnpm --filter @chemd/exporter-training typecheck` passes.
