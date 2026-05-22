# 集中 procedure 导入规则

## Goal

Move procedure prose import trigger patterns out of the lowering implementation so future import features can reuse the same rule metadata without creating a second Chemd language layer.

## Scope

- Add a `procedure-import-patterns` module in `@chemd/step-ontology`.
- Keep the existing `lowerProcedureToSteps` behavior unchanged.
- Export the import pattern metadata for future importer packages.
- Do not change block schemas, step schemas, parser syntax, or typechecker semantics.

## Acceptance

- Existing procedure lowering tests keep passing.
- `@chemd/step-ontology` typecheck passes.
- No changes are made to Chemd language schema files.
