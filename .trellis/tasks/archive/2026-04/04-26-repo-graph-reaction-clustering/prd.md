# Repo Graph Index and Reaction Clustering

## Goal
Add repository-level graph indexing and stronger reaction clustering foundations while keeping Chemd authoring syntax lightweight.

## Requirements
- Do not require new verbose Chemd syntax for graph or clustering metadata.
- Prefer compiler/exporter inference when reaction family, procedure reuse, route links, and cross-document relations can be derived from existing fields.
- Add deterministic graph-index data that can represent documents, entities, relations, references, routes, evidence, and inferred similarity links.
- Add clustering support based on existing semantic features first: reaction family, reaction signature, procedure signature, route context, variables, and conditions.
- Make room for future chemistry fingerprints without requiring RDKit or atom mapping in the first pass.
- Expose the new graph/index data through existing training/export surfaces and CLI where practical.

## Acceptance Criteria
- [x] Existing training exports can emit repo-level graph index records or a graph index projection.
- [x] Reaction clusters can be built from current Chemd understanding data without requiring additional author syntax.
- [x] Cluster output distinguishes semantic family/procedure/route/condition similarity from future chemical fingerprint similarity.
- [x] CLI has a command path for producing or inspecting graph index/cluster output.
- [x] Tests cover at least route links, cross-document related reactions, and same-family/procedure substrate expansion clustering.
- [x] Documentation explains best-practice authoring stays minimal and inference-driven.

## Technical Notes
- Current code already builds `reaction_taxonomy`, `reaction_routes`, `knowledge_graph`, `condition_variations`, and cross-document trajectories.
- This task should extend those outputs rather than inventing a parallel syntax surface.
- If a true chemical fingerprint is not available, expose an explicit `semantic` clustering basis and leave chemistry fingerprint fields optional.
