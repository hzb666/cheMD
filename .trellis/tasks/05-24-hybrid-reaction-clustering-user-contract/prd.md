# Hybrid reaction clustering user contract

## Goal

Make user-facing CLI and docs distinguish semantic graph-index clusters from computed strict reaction clusters, candidate neighbors, semantic groups, and strict-cluster profiles.

## Scope

- Update CLI text formatting to label graph-index clusters as semantic source truth.
- When a graph index already contains a `reaction_intelligence` layer, show counts for strict clusters, candidate neighbors, semantic groups, profiles, provider statuses, and reaction-intelligence warnings.
- Add CLI tests for the text formatter contract.
- Keep JSON output unchanged: it remains the exact graph index object.
- Update EN/ZH docs with text output examples and the distinction between semantic graph-index clusters and computed reaction-intelligence clusters.

## Non-goals

- Do not add a new provider execution command.
- Do not change `chemd graph --format json` schema.
- Do not change Chemd language-layer behavior.

## Acceptance

- Text output no longer implies `reaction_clusters` are strict computed clusters.
- Optional reaction-intelligence summary is displayed only when present.
- Tests lock the user-facing labels and counts.
