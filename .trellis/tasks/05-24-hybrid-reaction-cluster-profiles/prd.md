# Hybrid reaction cluster profiles

## Goal

Generate deterministic, LLM-readable profiles for strict reaction clusters without changing any clustering decision.

## Scope

- Add an exporter-training profile builder that consumes the existing graph index and merged reaction intelligence layer.
- Summarize strict clusters with representative reaction, common semantic fields, evidence basis, score summary, and warnings.
- Preserve Chemd language-layer output as the source of truth; do not infer new chemistry from prose.
- Surface missing evidence with warnings instead of silently omitting profile sections.
- Document the profile fields in EN/ZH export docs.

## Non-goals

- Do not change Chemd syntax, compiler, resolver, parser, or language-service behavior.
- Do not change strict cluster membership.
- Do not train or call an external model.
- Do not promote semantic-only groups into strict clusters.

## Acceptance

- Profiles are deterministic for the same graph index and artifact.
- Each profile references an existing `strict_reaction_clusters` entry.
- Missing feature evidence is represented by warnings.
- Existing reaction intelligence merge behavior remains compatible.
- Tests cover common fields, deterministic representative handling, and missing evidence warnings.
