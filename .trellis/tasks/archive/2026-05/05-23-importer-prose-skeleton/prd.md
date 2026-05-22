# 建立 prose importer 包骨架

## Goal

Create a prose import package that can consume Chemd rules and local recognition packages without becoming a second language layer.

## Scope

- Create `@chemd/importer-prose`.
- Define import IR for materials, quantities, steps, observations, and diagnostics.
- Add a small pipeline that extracts local chemical mentions.
- Do not render Chemd text yet.
- Do not change parser, schemas, or typechecker behavior.

## Acceptance

- The importer package builds and tests independently.
- The default pipeline works offline.
- The pipeline exposes provider hooks for future PubChem/CDE2 integrations.
