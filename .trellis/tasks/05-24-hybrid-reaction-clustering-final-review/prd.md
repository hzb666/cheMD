# Hybrid reaction clustering final review

## Goal

Finish the hybrid reaction clustering rollout with drift checks, final documentation status, and full validation.

## Scope

- Audit Python artifact fields, TypeScript merge fields, CLI labels, and EN/ZH docs for naming consistency.
- Confirm `reaction_clusters` remains semantic graph-index output and is not reused as strict computed clustering.
- Preserve warnings for skipped providers, semantic-only evidence, dropped merge groups, and hard rejects.
- Decide how to handle the generated math TeX artifact.
- Update the persisted Trellis plan status.

## Non-goals

- Do not add new chemistry algorithms.
- Do not change Chemd language-layer behavior.
- Do not change clustering thresholds unless validation exposes a defect.

## Acceptance

- Final checks show no uncommitted drift except intentional final-review updates.
- Full affected test/typecheck suite passes.
- The task is completed, committed, recorded, and the working tree ends clean.
