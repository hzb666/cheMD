# RDKit composite reaction fingerprint

## Goal

Replace the current RDKit Morgan side-XOR reaction fingerprint with a directional composite fingerprint.

## Scope

- Use per-side RDKit path fingerprint 1024 bits plus Morgan radius-2 fingerprint 1024 bits.
- Encode reaction features as reactant side, product side, and product-minus-reactant change blocks.
- Expose a 6144-dimensional inline sparse vector.
- Compute pairwise similarity from block contributions instead of a single flattened Tanimoto.
- Preserve provider skip/error behavior and existing `rdkit_fingerprint_tanimoto` basis contract.
- Update tests and docs.

## Non-goals

- Do not change Chemd language-layer behavior.
- Do not add new external providers.
- Do not require RDKit in tests; fake adapters remain sufficient.

## Acceptance

- Fingerprint refs report dimension 6144 by default.
- Feature metadata exposes block dimensions and bit indices.
- Similarity uses weighted reactant/product/change block scores.
- Existing hybrid clustering tests continue to pass.
