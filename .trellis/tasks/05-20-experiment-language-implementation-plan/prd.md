# Chemd Experiment Language Implementation Plan

Source: `D:\download\chemd_experiment_language_implementation_plan.md`.

## Goal

Implement the full current-language plan in staged Trellis loops. The source
language has no author-selectable compatibility/version/mode fields; source code
must converge directly to the current standard.

## Stage Tasks

1. `05-20-language-contract-schema-registry`
   - Language contract, block schema registry, diagnostic policy, CLI check, language fixtures.
2. `05-20-quantity-material-reaction-semantics`
   - Quantity v2, material/batch/sample semantics, reaction participants and stoichiometry.
3. `05-20-condition-outcome-analysis-schemas`
   - factor/outcome/attempt DSL and per-analysis schemas/templates.
4. `05-20-procedure-runtime-trace`
   - Step schema, brace control flow, runtime preflight, trace/replay.
5. `05-20-interop-governance-language-service-templates`
   - Interop contracts, governance projection, language-service/template/docs/CLI closeout.

## Guardrails

- Prefer existing packages over parallel implementations.
- Treat alias support as current language surface, not compatibility.
- Escalate meaning-affecting ambiguity, content loss, and unresolved references to errors.
- Every stage must pass focused tests, receive a logic review, commit, record a session, then continue.
