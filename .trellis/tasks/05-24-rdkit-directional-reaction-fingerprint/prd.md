# RDKit directional reaction fingerprint

## Goal

Replace the XOR change block in the RDKit composite reaction fingerprint with directional gained/lost blocks.

## Scope

- Keep side fingerprints as path1024 + Morgan1024.
- Encode reactant, product, gained, and lost blocks.
- Expose an 8192-dimensional sparse vector.
- Compute similarity with per-block Tanimoto and weighted sum.
- Update tests, fixtures, docs, and math appendix.

## Non-goals

- Do not change Chemd language-layer behavior.
- Do not add new providers or external dependencies.

## Acceptance

- Direction is preserved: gained and lost are separate blocks.
- Fingerprint refs report algorithm `rdkit_reaction_directional_8192_v3`.
- Block similarities include reactant/product/gained/lost.
- Service and docs validations pass.
