# 完善真实 SI procedure 自然语言导入

## 目标

- 让真实英文 SI 操作段能生成可通过 Chemd compiler error 检查的草稿。
- 保持 Chemd 语言层不变，只增强导入 / lowering 层。
- 用用户给出的 SI 段作为回归样例，防止后续退化。

## 范围

- 修复 procedure 文本切分：保护小数、常见英文缩写和换行折行。
- 规范化 Unicode minus，使 `−78 °C` 按负温度处理。
- 增强英文 SI 操作句型：`to a solution of ... was added ...`、passive addition、extraction、drying、concentration、chromatography purification。
- 收紧 observation 事件触发，避免 `reduced` 误触发 `red` / `color_change`。
- 不修改 core/parser/resolver/typechecker schema。

## 验收

- 用户给出的真实 SI 文本经 `importProseToChemd` 后 `valid === true`。
- 生成步骤包含 charge/cool/add/hold/quench/extract/dry/concentrate/purify 等关键操作。
- `extract` 有 solvent，`add` 有 materials，温度保留负号。
- 相关 package 测试与 typecheck 通过。
