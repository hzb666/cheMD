# PRD: Hybrid Reaction Strict Clusters

## Background

Hybrid similarity edges now expose weighted contributions and hard-reject
warnings. The service needs an explicit grouping layer so strict computed
clusters are not mixed with candidate neighbors or semantic-only groups.

## Requirements

1. Build strict reaction clusters from strong computed similarity edges.
2. Keep candidate computed neighbors separate from strict clusters.
3. Keep semantic-only groups separate and never label them strict clusters.
4. Preserve edge warnings and evidence summaries.
5. Expose these groups from the reaction intelligence pipeline artifact.

## Non-goals

- No LLM-readable profile generation in this phase.
- No CLI rendering changes in this phase.
- No new Chemd language fields.
- No provider dependency changes.

## Acceptance Criteria

- Python tests cover strict clusters, candidate neighbors, semantic-only
  groups, and hard-reject exclusion.
- Pipeline artifacts include the three group categories.
- Existing provider, contract, and layout tests still pass.
