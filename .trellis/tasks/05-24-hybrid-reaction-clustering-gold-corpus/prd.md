# Hybrid reaction clustering gold corpus

## Goal

Add regression fixtures that lock the intended hybrid reaction clustering behavior across service and exporter layers.

## Scope

- Add service-level gold cases for strict computed clusters, semantic-only groups, hard rejects, and skipped providers.
- Keep cases deterministic and independent of optional chemistry dependencies.
- Assert warnings are preserved when evidence is missing or providers skip.
- Document that gold cases protect the current Chemd-optimal strict clustering logic.

## Non-goals

- Do not add real RDKit/RXNFP/RXNMapper dependency requirements.
- Do not change Chemd language-layer behavior.
- Do not introduce trained classification models.

## Acceptance

- Gold cases fail if semantic-only evidence becomes a strict cluster.
- Gold cases fail if hard-rejected reaction-center conflicts become strict clusters.
- Gold cases fail if skipped provider warnings disappear.
- Existing service and exporter tests remain passing.
