# Compiler Diagnostic Repair Loop

## Goal
让 `@chemd/compiler` 在 `compileChemd()` 结果中直接输出适合 LLM 自动修复循环消费的诊断结构，而不要求调用方自行从原始 `diagnostics`、`authoringAssistance` 和 quick fix 里二次拼装。

## Requirements
- 在 compiler 层新增结构化 diagnosis / repair-loop 输出。
- 归并现有 `diagnostics`、authoring safe quick fixes、required-input summary。
- 明确区分：
  - 可自动应用的安全修复
  - 需要用户补充的缺失事实
  - 仍需人工/LLM改写的诊断
- 提供一个批量应用 diagnosis 安全 quick fix 的 helper，便于 `compile -> fix -> recompile`。
- 不把 scaffold 模板或占位内容伪装成 safe fix。

## Acceptance Criteria
- [ ] `compileChemd()` 返回新的结构化 diagnosis 输出。
- [ ] diagnosis 能告诉调用方当前是 `clean`、`fixable`、`needs_author_input` 还是 `manual_review` / `mixed`。
- [ ] diagnosis 暴露安全 quick fixes、required inputs、manual review items。
- [ ] compiler 提供批量应用 safe fixes 的 helper。
- [ ] 增加 regression tests，覆盖 good/base/bad cases。
- [ ] 同步更新 compiler contracts / quality docs。

## Technical Notes
- 优先复用现有 `Diagnostic` / `DiagnosticQuickFix` / `AuthoringPatch`，避免再造一套并行协议。
- 诊断结构要偏 machine-readable，不依赖 UI 文案解析。
- 先只做 compiler 内闭环，不额外扩展 CLI / Web 交互层。
