# 导入层数量扫描接入 Chemd 规则

## Goal

Make prose import quantity recognition consume Chemd's existing quantity schema instead of copying unit rules.

## Scope

- Add quantity scanning to `@chemd/importer-prose`.
- Build unit recognition from `@chemd/core` `QUANTITY_UNIT_SCHEMA`.
- Treat compact percent literals like `10%` as one quantity.
- Emit warnings for spaced percent literals like `10 %`.
- Emit warnings for unknown ordinary unit-like tokens.

## Acceptance

- Importer tests cover percent, temperature, volume, and unknown-unit warnings.
- No Chemd language schema files change.
- `@chemd/importer-prose` test/typecheck pass.
