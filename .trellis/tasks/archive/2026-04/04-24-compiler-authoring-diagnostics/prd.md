# Compiler Authoring Diagnostics

## Goal

让 `compileChemd()` 对 LLM 自动生成的 chemd 给出更直接、可执行的结构质量诊断，而不是只依赖 authoring assistance 面板。

## Requirements

- compiler 需要把安全可推断的 authoring suggestion 转成真实 diagnostics
- diagnostics 必须能通过现有 quick-fix 面板直接应用保守 patch
- compiler 需要对无法安全推断、但记录明显不完整的情况给出 summary warning
- 不能把带占位内容的 scaffold 当成诊断 quick-fix，避免编译器伪造实验事实
- 诊断输出必须进入 `CompileResult.diagnostics`，供 CLI / web 统一消费

## Acceptance Criteria

- [ ] 安全 suggestion 会出现在 `CompileResult.diagnostics` 中
- [ ] 这些 diagnostics 能通过 `applyDiagnosticQuickFix()` 应用
- [ ] 缺少关键信息但无法安全推断时，会出现 summary warning
- [ ] scaffold 模板不会被当成诊断 quick-fix
- [ ] compiler 测试覆盖新增诊断与 quick-fix 行为
- [ ] 相关 Trellis spec 已同步

## Technical Notes

- 复用现有 `AuthoringAssistance.suggestions`，不要重新实现一套推断逻辑
- 诊断层只接 suggestion，不接 template
- 新 quick-fix kind 只负责应用 authoring patch，不负责生成 patch
