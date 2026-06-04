# Fix Language Layer Completeness Gaps

## Goal

Close the language-layer feature gaps found in the June 4 audit without
expanding into IDE or device-control scope.

## Scope

- Validate cross-module reference target kinds during module linking.
- Complete condition expression parsing for quoted strings, percent literals,
  and list literals used by `in`.
- Align the public language contract with the implemented `agent run` syntax
  and preserve required-field diagnostics for agent fields.
- Add runtime-lab control progression APIs for dynamic control state and
  condition decisions at the language runtime layer.
- Surface link diagnostics consistently in CLI text output.

## Out of Scope

- IDE integration.
- Physical device execution or adapter implementations.
- Training export semantics.

## Acceptance

- New regression tests fail before implementation and pass after fixes.
- Existing parser, typechecker, compiler, CLI, language-service, importer,
  step-ontology, runtime-lab, and core tests pass.
- Root typecheck passes if the package-level changes touch exported types.
