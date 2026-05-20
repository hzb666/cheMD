# Language Contract And Schema Registry

## Scope

- Add a current language contract without author-facing `chemd_version`,
  `chemd_mode`, `language`, or `mode` fields.
- Move parser/language-service block fields to a shared core schema registry.
- Support formal field/value aliases required by the current plan.
- Make stable omitted `kind` inference diagnostic-free; make ambiguous/invalid
  kind an error.
- Tighten diagnostic severity where invalid input can change meaning, create
  ambiguity, or drop content.
- Add user-facing `chemd check` and root `fixtures/language` acceptance assets.

## Non-Goals

- Do not implement Quantity v2, material/batch, control flow, governance, or
  interop in this stage.
- Do not add compatibility modes or author-selectable language settings.

## Verification

- Focused package typechecks and tests for core/parser/compiler/cli/diagnostics/
  language-service.
- CLI fixture smoke through `pnpm chemd check` and `pnpm chemd validate`.
