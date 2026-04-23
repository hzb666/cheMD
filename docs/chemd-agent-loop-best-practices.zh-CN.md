# chemd Agent Loop 最佳实践

这份文档面向两类人：

- 想把 `chemd agent-loop` 接到外部 LLM / agent 的实现者
- 想稳定生成高质量 `chemd` 训练数据的人

核心原则只有一句：

> **compiler 是语义裁判，driver 只负责定向 rewrite。**

不要让 driver 猜“什么样的实验记录看起来像对的”，而是让它根据 compiler 给出的 `diagnosis`，只补必要事实、只改必要块、只在能改时改。

## 1. 推荐工作流

推荐始终走这条链：

```text
draft source
  -> chemd repair / runChemdRepairLoop
  -> chemd agent-loop / runChemdAgentLoop
  -> external driver rewrite
  -> compile again
  -> clean or stop
```

对应职责：

- `repair-loop`：只应用 deterministic safe fixes
- `agent-loop`：把 unresolved `diagnosis` 交给外部 driver
- `driver`：决定 `rewrite` 还是 `stop`
- `compiler`：每轮重新判定是否 `clean`

## 2. 最小可运行示例

仓库里自带了一个最小示例 driver：

- [packages/cli/examples/mock-agent-loop-driver.mjs](</D:/Code/chemd/packages/cli/examples/mock-agent-loop-driver.mjs>)

它只做两件事：

1. 如果收到 `stop` 模式，就返回：

```json
{
  "schemaVersion": "chemd-agent-driver-response/v0.1",
  "action": "stop",
  "note": "need more facts"
}
```

2. 否则给当前 reaction 补一个 `result` 和 `analysis`

本地可直接运行：

```bash
pnpm chemd agent-loop record.chemd.md \
  --driver node \
  --driver-arg packages/cli/examples/mock-agent-loop-driver.mjs \
  --format json
```

如果最终 `clean`，并且希望写回原文件：

```bash
pnpm chemd agent-loop record.chemd.md \
  --driver node \
  --driver-arg packages/cli/examples/mock-agent-loop-driver.mjs \
  --write
```

## 3. driver 输入输出协议

当前协议是稳定 JSON：

- request schema: `chemd-agent-driver-request/v0.1`
- response schema: `chemd-agent-driver-response/v0.1`

请求里最关键的字段：

- `source`
- `diagnosis`
- `diagnostics`
- `repair.finalDiagnosis`
- `repair.stoppedReason`
- `history`

你真正要读的是：

1. `diagnosis.status`
2. `diagnosis.requiredInputs`
3. `diagnosis.manualReviewItems`
4. `history`

推荐决策：

- `fixable`：通常不该由 driver 处理，repair loop 已经先跑过；如果还看到它，多半是 budget 问题
- `needs_author_input`：只在你能补真实事实时 `rewrite`
- `manual_review`：默认 `stop`
- `mixed`：优先看 `requiredInputs`，再决定是否能保守重写

## 4. rewrite 的最佳实践

### 4.1 只改 diagnosis 指向的最小范围

不要整篇重写。优先：

- 补缺失 block
- 补缺失 `ref`
- 补必要字段
- 保持已有 block 顺序和 id 不变

错误做法：

- 为了补一个 `result`，重写整个实验记录
- 顺手改 frontmatter
- 重命名已有 `#id`
- 把已有 `reaction` / `sample` 改成别的结构

正确做法：

- 只在缺口附近追加或修正最小文本

### 4.2 保持引用稳定

driver 最容易搞坏的是引用关系。

必须优先保留：

- `#id`
- `ref: ...`
- `standard: ...`
- `reaction=...`
- `res1 / note1 / var1` 这种 attempt 对齐关系

如果你改了这些标识，compiler 下一轮看到的就不是“修复”，而是“新文档”。

### 4.3 只补真实事实，不补占位真相

禁止这类补法：

- `yield: TBD`
- `status: unknown`
- `result: not provided`

这会让 source 看起来更完整，但语义上更脏。

更好的策略：

- 能补就补真实字段
- 不能补就 `stop`

### 4.4 `manual_review` 默认 stop

`manual_review` 往往意味着：

- 语义冲突
- 引用冲突
- 多个目标都像正确答案
- 需要实验员判断，而不是语言模型猜测

默认策略应该是：

```text
manual_review -> stop
```

只有在你明确知道如何保守改写时，才去 `rewrite`。

## 5. prompt 最佳实践

如果你的 driver 后面接的是 LLM，prompt 不要让模型“自由发挥补全文档”，而要限制成：

```text
你会收到：
1. 当前 chemd source
2. compiler diagnosis
3. 已经应用过的 safe fixes

你的任务：
- 只做最小必要 rewrite
- 保持 frontmatter 和已有 id 稳定
- 不要改无关块
- 不要发明缺失事实
- 如果无法在不猜测的情况下修复，返回 stop

输出必须是：
- rewrite: 返回完整 nextSource
- stop: 返回原因 note
```

推荐再加 3 条硬约束：

1. 不删除已有 block，除非 diagnosis 明确指向冲突块
2. 不重排已有 block
3. 不把 prose 改写成 compiler 未支持的私有语法

## 6. 何时 stop

下面这些情况，最佳实践都是 `stop`：

- 缺的是实验事实，而不是结构
- 多个 reaction / sample / result 都可能匹配
- 需要实验意图判断
- 需要人工裁决哪条证据可信
- 需要新增的数据会改变实验结论

简单说：

> **缺结构可以 rewrite，缺真相就 stop。**

## 7. 常见失败模式

### 7.1 一次改太多

表现：

- 下一轮 diagnostics 变多
- 原来好的引用被改坏

原因：

- LLM 被要求“整理整篇记录”

修正：

- 把任务收紧成“只补 diagnosis 指向的最小缺口”

### 7.2 试图处理 compiler 已能自动修的项

表现：

- driver 在做 `safeFixes` 能做的事
- 输出不稳定

修正：

- 始终先跑 repair loop
- driver 只处理 unresolved items

### 7.3 用自然语言 note 代替结构化字段

表现：

- 在 `note` 里写“this belongs to rxn-main”
- 但没有补 `ref: rxn-main`

修正：

- 编译器要的是结构字段，不是解释性 prose

## 8. 推荐落地方式

生产上推荐三层：

1. `chemd repair`
   - 快速吃掉 safe fixes
2. `chemd agent-loop`
   - 只处理 unresolved diagnosis
3. 外层 orchestration
   - 记录 prompt、model、loop 轨迹、人工接管点

也就是说，不要把所有逻辑都塞进一个大 prompt。

## 9. 推荐验收标准

一个 driver 如果要算“可用”，至少满足：

- 对同一 diagnosis 输出稳定
- 不会改坏已有 `#id` / `ref`
- 遇到缺事实时会 `stop`
- 遇到结构缺口时能最小修复
- 可以在 `agent-loop --format json` 里追踪每轮行为

如果做不到这些，就先不要接真实训练数据。

## 10. 结论

最稳的做法不是“让 LLM 直接写完整 chemd”，而是：

```text
compiler 定边界
repair 吃掉确定项
driver 只改 unresolved 缺口
缺真相就 stop
```

这就是 `chemd agent-loop` 的最佳实践。
