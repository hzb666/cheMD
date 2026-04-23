# Agent Loop Example And Best Practice

## Goal
为 `chemd agent-loop` 增加仓库内可直接运行的 example driver，并写一份最佳实践文档，说明如何让 LLM 在 compiler diagnosis 约束下稳定生成和修复 chemd。

## Requirements
- 增加一个仓库内可直接执行的 example driver。
- example driver 必须使用当前 `chemd-agent-driver-request/response` schema。
- CLI 测试改为尽量复用 example driver，而不是内联临时脚本。
- 新增一份最佳实践文档，覆盖：
  - repair-first loop 思路
  - driver 输入输出协议
  - prompt/续写边界
  - 何时 rewrite，何时 stop
  - 常见失败模式
- 如有必要，同步补充 CLI 契约文档中的示例入口。

## Acceptance Criteria
- [x] 仓库存在可直接运行的 example driver 文件。
- [x] CLI regression tests 复用或覆盖该 example driver 路径。
- [x] 最佳实践文档完成并引用真实命令与真实文件路径。
- [x] 相关验证通过。

## Technical Notes
- 保持 provider-agnostic，不绑定具体 SDK。
- 文档应强调 compiler 是语义裁判，driver 只负责定向 rewrite。
