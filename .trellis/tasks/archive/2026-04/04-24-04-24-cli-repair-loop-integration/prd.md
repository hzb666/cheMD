# CLI Repair Loop Integration

## Goal
把 compiler diagnosis 和 repair loop runner 直接接进 CLI，让 `chemd` 可以在命令行里完成 `compile -> diagnose -> apply safe fixes -> recompile`，并输出结构化结果，适合作为 agent loop 的外层执行器。

## Requirements
- 在 `@chemd/compiler` 增加显式 repair loop runner。
- repair loop runner 复用现有 `compileChemd()`、`diagnosis` 和 `applyCompilerDiagnosisSafeFixes()`。
- 在 `@chemd/cli` 增加面向 repair loop 的命令或子命令。
- CLI 输出要能区分：
  - 当前 loop 状态
  - 应用过的 safe fixes
  - remaining required inputs
  - remaining manual review items
- 保持对现有 validate/compile 路径的兼容，不破坏已有命令。

## Acceptance Criteria
- [x] compiler 暴露 `runChemdRepairLoop()` 或等价 runner。
- [x] CLI 能运行 repair loop，并输出清晰的 machine-readable 结果。
- [x] 支持限制最大迭代次数。
- [x] 当只有 safe fixes 时，CLI 能自动写出修复后的 source 或打印结果。
- [x] 当剩余 `requiredInputs` / `manualReviewItems` 时，CLI 输出结构化摘要并以非零状态退出。
- [x] 增加 compiler / cli regression tests。
- [x] 同步更新 compiler / cli 契约文档。

## Technical Notes
- 先只做 deterministic safe-fix loop，不在 CLI 内部再调用外部 LLM。
- repair loop runner 应返回每轮 compile 结果与应用过的 fix 轨迹，便于上层 agent 编排。
- CLI 优先支持文件输入；若已有 stdin 模式，则复用现有约定。
