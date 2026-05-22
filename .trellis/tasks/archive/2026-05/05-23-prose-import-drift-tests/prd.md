# 补 procedure 导入规则漂移测试

## Goal

Guard the procedure prose import pattern metadata against drifting away from the existing Chemd step ontology.

## Scope

- Add tests for `PROCEDURE_IMPORT_RULES`.
- Assert every rule uses an existing step family.
- Assert every produced parameter is known by `getStepParamSchema`, including aliases.
- Keep language schemas unchanged.

## Acceptance

- Drift tests fail if import metadata invents a family or parameter.
- Existing lowering tests keep passing.
- `@chemd/step-ontology` typecheck passes.
