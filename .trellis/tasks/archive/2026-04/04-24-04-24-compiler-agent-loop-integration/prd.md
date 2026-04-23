# Compiler Agent Loop Integration

## Goal
把 compiler diagnosis 驱动的 repair loop 升级为真正可编排的 agent loop，并在 CLI 里提供标准化 driver 协议，方便外部 LLM/agent 进程完成定向续写。

## Requirements
- 在 `@chemd/compiler` 增加显式 `runChemdAgentLoop()`。
- agent loop 必须先复用现有 `runChemdRepairLoop()` 处理 deterministic safe fixes。
- 当仍有 `requiredInputs` / `manualReviewItems` 时，把当前 source 与 diagnosis 通过 callback 交给外部 agent。
- 在 `@chemd/cli` 增加 `agent-loop` 子命令，支持外部 driver 进程 stdin/stdout JSON 协议。
- CLI 输出要能区分 repair 阶段、agent 重写阶段、最终诊断状态、停止原因与写回状态。
- 保持现有 `validate / export / diff / changed / repair` 行为不变。

## Acceptance Criteria
- [x] compiler 暴露 `runChemdAgentLoop()` 与稳定的 request/response 类型。
- [x] agent loop 可记录每轮 repair 结果与 agent 响应轨迹。
- [x] CLI 能通过 driver 进程运行 `agent-loop` 并输出 machine-readable 结果。
- [x] 支持 agent 迭代上限与 repair 迭代上限。
- [x] 当 driver 返回停止或无变化时，CLI 以非零状态退出并输出结构化摘要。
- [x] 当最终状态 `clean` 且指定 `--write` 时，CLI 能写回文件。
- [x] 增加 compiler / cli regression tests。
- [x] 同步更新 compiler / cli 契约文档。

## Technical Notes
- 只做 driver 协议，不在仓库里直接绑定具体 LLM SDK。
- driver 进程必须走非 shell 拼接的参数数组执行。
- compiler 侧保持纯函数式，不引入 Node-only IO。
