# PRD: Workspace Reaction Graph

## Goal

Extend the existing training graph index into a workspace-level reaction graph
superset that connects Chemd reaction documents, shared library documents,
reaction templates, route relations, condition screens, and cross-document
references into one directed chemical semantic graph. Runtime traces may be
attached to the same graph so execution events and state snapshots can be
ordered alongside the static reaction plan.

## Scope

- Preserve existing training graph fields and consumers:
  `nodes`, `edges`, `reaction_features`, `reaction_clusters`,
  `reaction_similarity_edges`, and `warnings`.
- Extend the existing graph-index path rather than creating a parallel graph
  pipeline.
- Add workspace/linker-aware graph input so imported references can resolve
  across documents.
- Emit stable nodes for workspace, documents, declarations, procedure steps,
  controls, runtime symbols, runtime trace events, runtime state snapshots, and
  templates when present.
- Emit directed edges for imports, declarations, chemical references,
  condition-screen links, route `prev`/`next`, procedure step order, dynamic
  control reads, runtime event order, state snapshot order, runtime event
  targets, and template instantiation.
- Keep `chemd graph` as the main command and make its JSON output a superset of
  the existing training graph.

## Acceptance

- Cross-document references produce graph edges rather than isolated nodes.
- `prev` creates both source-field and canonical route direction edges.
- `condition_screen` connects to both compared reaction and standard.
- Template declarations and template references are represented as first-class
  graph nodes and edges.
- Procedure steps expose execution-order edges in forward order.
- Runtime trace events and replay-derived state snapshots expose directed
  ordering edges.
- Runtime trace events can target existing procedure step and control nodes.
- `chemd graph --trace <json>` merges runtime trace input into the same JSON
  graph output.
- CLI can print text and JSON summaries for the extended graph while preserving
  existing summary fields.
- Targeted compiler and CLI tests pass.
