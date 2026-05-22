# 导入层复用 step ontology 生成 frames

## Goal

Convert prose into preliminary step and observation frames by reusing `@chemd/step-ontology` lowering rather than duplicating Chemd action rules.

## Scope

- Add step frame extraction in `@chemd/importer-prose`.
- Add observation frame extraction in `@chemd/importer-prose`.
- Validate produced step params against `getStepParamSchema` where possible.
- Keep Chemd language schemas unchanged.

## Acceptance

- Procedure prose can produce `charge`, `cool`, and `add` frames.
- Observation prose can produce event frames with linked step hints.
- Drift diagnostics are warnings, not new language semantics.
