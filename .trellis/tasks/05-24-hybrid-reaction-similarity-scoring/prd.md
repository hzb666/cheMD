# PRD: Hybrid Reaction Similarity Scoring

## Background

Reaction intelligence currently merges semantic and computed similarity edges,
but the hybrid score does not expose contribution-level evidence or hard-gate
signals needed by strict clustering. This phase upgrades the Python service
hybrid scoring while preserving provider optionality.

## Requirements

1. Keep computed chemistry evidence above semantic context.
2. Preserve contribution-level scores and weights for semantic, RDKit, RXNFP,
   and reaction center support.
3. Normalize over available evidence only; missing providers must not count as
   zero.
4. Emit strict clustering gate warnings when reaction center conflicts with low
   RDKit support.
5. Keep semantic-only edges explicit and low confidence.

## Non-goals

- No strict cluster generation in this phase.
- No new Chemd language fields.
- No provider dependency installation or lockfile changes.
- No FAISS or trained model integration.

## Acceptance Criteria

- Python hybrid similarity tests cover weighted contribution output, semantic
  fallback, and hard reject warnings.
- Existing provider and pipeline tests still pass.
- Docs mention contribution-level hybrid scoring and hard gates.
