# chemd-lang v0.3：运行时实现文档（表层语法冻结版）

副标题：保持当前 Markdown / block 写法不变，把解析后的实验语义变成可计划、可执行、可回放的运行时
状态：修订版（实现级）
适用范围：`packages/runtime-lab`、`packages/runtime-trace`、`packages/validator-runtime-plan`、`apps/web` 的 operator UI / trace viewer

---

## 0. 文档定位

本修订版重新明确 runtime 的定位：

> **runtime 消费的是从现有 chemd 文档 lowering 出来的 typed semantic graph / step graph，而不是一套新的作者 DSL。**

这意味着：

- 作者仍然编辑 Markdown 和现有 block。
- `procedure` / `observation` 仍可保持自然语言。
- runtime 只看编译后的计划和状态机。

---

## 1. 运行时范围与非目标

### 1.1 运行时负责什么

runtime 负责：

1. 从 typed semantic graph / step graph 生成 `RunPlan`
2. 做 preflight
3. 驱动 step 状态机
4. 采集 observation / analysis artifact
5. 记录 trace
6. 支持 resume / replay / export

### 1.2 运行时不负责什么

- 不替代现有 `chem-service` 的结构 normalize/render/OCR
- 不要求作者写新的执行语法
- 不做完整化学机理模拟
- 不假设实验必须全自动机器人执行

---

## 2. 与当前代码库的边界对齐

### 2.1 继续保留当前主链

```text
Markdown source
  -> parser
  -> resolver
  -> render-profile
  -> preview/export
```

### 2.2 runtime 插入点

在 resolver 之后新增：

```text
resolved document
  -> typed semantic graph
  -> step graph
  -> run planner
  -> runtime execution / replay
```

### 2.3 关键意义

runtime 是新增的内部执行层，不会改掉作者已有的 `Editor + Preview` 工作方式。

---

## 3. 输入边界：从现有文档到 RunPlan

### 3.1 输入链条

```text
procedure / reaction / analysis / observation blocks
  -> lowering
  -> step graph
  -> run plan
```

### 3.2 输入对象

推荐输入：

```ts
interface RunPlanInput {
  document: ResolvedChemdDocument;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
}
```

### 3.3 关键原则

- `RunPlan` 不反向定义作者语法。
- `RunPlan` 里的 step 是 canonical step，不等于原文句子。
- `RunPlan` 必须保留 source span / source block / source sentence 索引。

---

## 4. Planner：如何从 narrative 生成计划

### 4.1 规划来源

planner 综合以下输入：

- `reaction` 中的条件
- `procedure` lowering 后的步骤
- `analysis` 中的检查点
- `result` / `observation` 中的阶段提示
- validator 的 preflight 规则

### 4.2 计划生成的最低要求

一个最小 `RunPlan` 至少要包含：

- ordered steps
- expected inputs
- expected stage boundaries
- observation hooks
- optional analysis checkpoints

### 4.3 示例

源文档：

```md
:::procedure #proc-main
1. 氮气置换 15 min。
2. 加入 Pd2(dba)3 和 XPhos。
3. 加热到 100 °C 反应 16 h。
4. 取样做 TLC。
:::
```

规划结果：

```yaml
run_plan:
  - step_id: s1
    op: purge
    params: { atmosphere: nitrogen, duration: 15 min }
  - step_id: s2
    op: add
    params: { materials: [Pd2(dba)3, XPhos] }
  - step_id: s3
    op: heat
    params: { temperature: 100 °C, duration: 16 h }
  - step_id: s4
    op: sample
  - step_id: s5
    op: analyze
    params: { type: tlc }
```

---

## 5. LabState：运行时状态模型

### 5.1 顶层状态

```ts
interface LabState {
  runId: string;
  mode: "dry-run" | "human-run" | "robot-run" | "replay-run";
  status: "created" | "planned" | "running" | "paused" | "completed" | "failed" | "aborted";
  currentStepId?: string;
  resources: ResourceState[];
  artifacts: ArtifactState[];
  observations: ObservationState[];
  diagnostics: RuntimeDiagnostic[];
}
```

### 5.2 资源状态

- vessel
- atmosphere
- temperature control
- stirring
- chromatography
- analytical device

### 5.3 产物 / 中间物状态

runtime 不需要完整化学模拟，但需要记录：

- 物料是否已加入
- 当前阶段是否已取样
- 是否已进入工作后处理
- 是否已经生成 analysis artifact

---

## 6. Step 状态机

### 6.1 状态

```text
planned -> ready -> running -> waiting_input -> completed
                           -> failed
                           -> skipped
```

### 6.2 典型场景

#### `dry-run`
只检查顺序、资源、能力、诊断。

#### `human-run`
操作员逐步确认执行。

#### `robot-run`
后端执行器消费 step contract。

#### `replay-run`
从 trace 回放，不实际执行。

### 6.3 人工确认点

很多实验步骤并不能全自动化，因此 step 可以有：

- requires_confirmation
- manual_input_required
- evidence_required

这些都不需要作者手写新语法，而是由 lowering / planner / policy 推出。

---

## 7. Run 状态机

顶层运行流程：

```text
created
  -> planned
  -> running
  -> paused / resumed
  -> completed
  -> archived
```

异常分支：

```text
running -> failed
running -> aborted
running -> escalated_for_review
```

---

## 8. Observation 管线

### 8.1 观测来源

观测可以来自：

- 作者在 `observation` block 中已有的文字
- runtime 执行时追加的手动记录
- 仪器 / 图像 / 传感器输入
- analysis 结果衍生事件

### 8.2 Observation 与原文共存

推荐结构：

```ts
interface ObservationEvent {
  observationId: string;
  source:
    | "source_block"
    | "runtime_manual"
    | "runtime_device"
    | "analysis_derived";
  eventType?: string;
  stage?: string;
  rawText?: string;
  normalizedValue?: unknown;
  linkedStepId?: string;
}
```

### 8.3 原则

runtime 不能因为有结构化 observation，就丢掉原始文字描述。

---

## 9. Analysis 管线

### 9.1 analysis 仍从现有 block 进入

例如：

```md
:::analysis #ana-tlc
type: tlc
eluent: PE/EtOAc 3:1
result: partial_conversion
:::
```

### 9.2 runtime 的作用

runtime 负责：

- 把 analysis 作为检查点执行
- 记录 analysis artifact
- 把结果接入 trace
- 触发后续 validator / decision support

### 9.3 AnalysisArtifact

```ts
interface AnalysisArtifact {
  artifactId: string;
  analysisType: string;
  rawPayload?: unknown;
  normalizedSummary?: string;
  linkedStepId?: string;
  linkedResultId?: string;
}
```

---

## 10. Trace Schema

### 10.1 事件模型

```ts
interface TraceEvent {
  eventId: string;
  runId: string;
  timestamp: string;
  type:
    | "run_started"
    | "step_started"
    | "step_completed"
    | "step_failed"
    | "observation_recorded"
    | "analysis_recorded"
    | "diagnostic_emitted"
    | "manual_override"
    | "run_completed";
  stepId?: string;
  payload?: Record<string, unknown>;
}
```

### 10.2 关键要求

- trace 必须能回指 source block / source sentence
- trace 必须能附带 diagnostics
- trace 必须能被 replay
- trace 必须能用于 training export

---

## 11. Preflight 与 Runtime 诊断

### 11.1 preflight 检查

至少包括：

- required capability 是否存在
- 关键资源是否缺失
- 低温 / 惰性气氛 / 危险试剂约束是否满足
- step 顺序是否可执行
- unresolved references 是否影响执行

### 11.2 诊断输出原则

所有诊断都应最终指回现有源码位置，并给出当前语法下的建议修复。

例如：

- 缺少 `atmosphere` 字段 -> 建议补到现有 `reaction` block
- `procedure` 句子歧义过高 -> 建议改成更清晰的编号列表

---

## 12. Resource、Capability 与 Policy

### 12.1 资源

```ts
type ResourceKind =
  | "vessel"
  | "cooling"
  | "heating"
  | "stirring"
  | "inert_gas"
  | "vacuum"
  | "filtration"
  | "chromatography"
  | "analytical_device";
```

### 12.2 能力

能力来自：

- 实验室环境
- 操作员权限
- 仪器可用性
- 安全策略

### 12.3 policy 原则

policy 先作用于 runtime preflight，不要求作者去学一套新的 policy 语言。

---

## 13. Deviation、Manual Override 与 Audit

### 13.1 为什么需要 deviation

真实实验执行中常见：

- 实际温度偏离
- 多加 / 少加
- 额外延长时间
- 临时改淬灭剂

### 13.2 记录方式

不要求作者回头改写源文档为另一种语法，而是新增 runtime trace / deviation 记录：

```ts
interface DeviationRecord {
  deviationId: string;
  linkedStepId: string;
  kind: string;
  description: string;
  operatorNote?: string;
}
```

### 13.3 回写原则

可以：

- 写 trace
- 写 audit note
- 提供 source patch 建议

但不应擅自重写作者原始叙述。

---

## 14. Recovery、Resume 与 Replay

### 14.1 resume

适用于：

- 人工中断
- 仪器等待
- 第二天继续

### 14.2 replay

适用于：

- 调试失败
- 教学复盘
- 训练数据导出
- 质量审核

### 14.3 replay 输入

```text
source document + run plan + trace events
```

而不是依赖新的作者执行脚本。

---

## 15. 与 UI、LNF、Training Export 的对接

### 15.1 UI

推荐 UI 呈现：

- Markdown source
- structured summary
- lowered steps
- run timeline
- diagnostics
- trace viewer

### 15.2 LNF

LNF 可以吸收：

- step graph
- runtime trace
- analysis summary
- deviations

### 15.3 training export

training export 可衍生：

- procedure-to-steps pairs
- trace-to-root-cause pairs
- runtime diagnostics
- replay summaries

---

## 16. 建议的包结构与 API

```text
packages/
  runtime-lab/
    src/
      planner/
      state/
      execution/
      policies/
      diagnostics/
  runtime-trace/
    src/
      events/
      replay/
      export/
```

推荐 API：

```ts
export function buildRunPlan(input: RunPlanInput): RunPlan;
export function preflightRun(plan: RunPlan, context: RuntimeContext): PreflightResult;
export function replayTrace(plan: RunPlan, trace: TraceEvent[]): ReplayResult;
```

---

## 17. 测试策略

### 17.1 必测场景

1. 编号 `procedure` -> step plan
2. prose `procedure` -> partial plan
3. `analysis` 检查点插入
4. 缺 capability 的 preflight 失败
5. runtime deviation 记录
6. replay 稳定复现

### 17.2 核验点

- 是否仍可回到源文档位置
- 是否不依赖新表层语法
- 是否支持 partial lowering
- 是否支持 trace 导出

---

## 18. 建议的落地顺序

### Phase 1
- `procedure` / `analysis` -> step graph
- preflight

### Phase 2
- step / run 状态机
- trace events

### Phase 3
- replay
- UI viewer
- exporter / LNF 对接

---

## 19. 最终实现结论

本修订版对 runtime 的最终定义是：

> **在不改变现有 chemd 表层语法的前提下，把解析后的实验语义对象变成可计划、可执行、可记录、可回放的运行时。**

作者继续写现有文档；runtime 负责把这些文档背后的实验逻辑真正跑起来。

---
