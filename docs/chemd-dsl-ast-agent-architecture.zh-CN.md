# Chemd DSL、AST 与 Agent 知识更新架构

状态：架构说明稿
适用范围：Chemd 作者体验、编译管线、Agent 写入与修复、实验聚类、专家路由、语义 diff、训练记忆与知识更新

## 1. 核心结论

Chemd 不应该被理解成“让用户手写一门复杂化学编程语言”。更准确的定义是：

```text
用户写低心智实验记录；
Chemd 编译器把它变成可检查、可追溯、可训练、可持续更新的实验语义系统。
```

所以 Chemd 有两张面：

- 作者面：Markdown、frontmatter、`:::reaction`、`:::procedure`、自然语言、表格、OCR 转写结果。
- 机器面：AST、ResolvedDocument、TypedSemanticGraph、StepGraph、RunPlan、LNF、trainingExport、ragExport、trainingUnderstanding、task dataset、semantic memory。

Agent 架构也必须围绕这个边界设计。Agent 不能直接把自由文本当成训练事实，也不能绕过 compiler 自己判断实验语义。正确链路是：

```text
user input
  -> intent router
  -> Chemd writer / retriever / expert router
  -> compileChemd()
  -> diagnostics + repair loop
  -> verifier
  -> user confirmation or save
  -> source diff / structural diff / semantic diff
  -> knowledge graph / cluster / memory / dataset update
```

## 2. Chemd DSL 分层

### 2.1 作者 DSL

作者 DSL 是用户真实接触的层。它应该稳定、少字段、允许自然语言，并保留原文。

示例：

```md
---
entry_type: experiment
id: exp-001
title: Buchwald-Hartwig 条件尝试
primary_reaction: rxn-main
primary_result: res-main
---

:::reaction #rxn-main
reactants: aryl_bromide_01 | piperazine_02
catalyst: Pd2(dba)3
solvent: dioxane
temperature: 100 °C
time: 16 h
atmosphere: nitrogen
:::

:::procedure #proc-main
1. 将底物、胺和碱加入反应瓶。
2. 氮气置换 15 min。
3. 加热到 100 °C 反应 16 h。
:::

:::result #res-main
status: partial
yield: 23%
purity: 91%
notes: 转化不足
:::
```

作者面不默认引入这类语法：

```text
let scale = 0.5 mmol
step heat(v1, 100 °C, 16 h)
require inert()
```

这些能力应该留在内部 canonical form、runtime plan 或自动化接口层。

### 2.2 Canonical DSL

Canonical DSL 是后台内部结构。它可以严格，但不能成为普通用户的日常负担。

它负责表达：

- 稳定实体 ID
- typed references
- normalized quantities
- canonical steps
- observation events
- field evidence
- provenance
- confidence
- diagnostics
- quality tiers

### 2.3 下游 DSL 视图

同一份 Chemd 文档会派生多个视图：

- `html`：预览和展示。
- `json`：检查 AST 和 typed graph。
- `docxBridge`：文档导出。
- `lnf`：LLM 正规形，稳定给模型和训练系统。
- `trainingExport`：full audit export，用于追溯和重新投影。
- `ragExport`：检索视图，用于 embedding 和 RAG。
- `trainingUnderstanding`：实验理解母数据，用于任务样本、专家路由和知识图谱。

关键原则：

```text
full audit export != RAG chunks
RAG chunks != LoRA data
trainingUnderstanding != final SFT JSONL
```

最终训练样本必须经过任务化投影和质量过滤。

## 3. AST 与内部表示

### 3.1 AST 主体

当前 `ChemdDocument` 是编译器入口对象：

```ts
interface ChemdDocument {
  type: "document";
  meta: ChemdMeta;
  children: ChemdNode[];
  diagnostics: Diagnostic[];
  source?: string;
  renderSelection?: RenderSelection;
}
```

`children` 里包含：

- `markdown`
- `molecule`
- `reaction`
- `result`
- `analysis`
- `procedure`
- `observation`
- `sample`
- `artifact`
- `condition_varies`
- `template`
- `use`
- `col`

AST 的责任是保存作者写了什么、块在哪里、字段是什么、引用 token 是什么。它不应该承担全部化学推断。

### 3.2 ResolvedDocument

`resolveChemd()` 在 AST 上完成：

- object index
- duplicate id 诊断
- template expansion
- `use` 展开
- reference resolution
- frontmatter `primary_*` 绑定
- 缺必需字段诊断

这层回答的是：“文档里的名字、引用和对象边界是否稳定？”

### 3.3 TypedSemanticGraph

`typecheckDocument()` 把文档事实 typed 化：

- `QuantityType`
- `ReferenceType`
- `NormalizedReactionConditions`
- `TypedReactionNode`
- `TypedResultNode`
- `TypedStepNode`
- `TypedObservationEventNode`

这层回答的是：“字段的类型、单位、数量、引用和实验对象关系是否能被机器稳定理解？”

### 3.4 StepGraph

`StepGraph` 把 `procedure`、`analysis`、`observation` 降解为：

- `CanonicalStepNode[]`
- `ObservationEventNode[]`
- lowering diagnostics
- lowering confidence

示例：

```text
procedure prose
  -> add
  -> purge
  -> heat
  -> hold
  -> analyze

observation prose
  -> color_change
  -> precipitation
  -> gas_evolution
```

这层回答的是：“实验记录能不能成为有顺序、有依赖、有证据的步骤图？”

### 3.5 RunPlan 与 LNF

`runtime-lab` 从 `StepGraph` 生成 `RunPlan`，并做 `preflightRun()`：

- step order
- required capabilities
- confirmation strategy
- blocking diagnostics

`lnf` 则把 typed graph、step graph、run plan、diagnostics 汇总为 `chemd-lnf/v0.5`。

LNF 是给 LLM 和训练系统看的稳定正规形，不是新的作者写法。

## 4. 当前编译管线

当前 `compileChemd()` 的实际顺序是：

```text
parseChemd(source)
  -> resolveChemd(parsed)
  -> typecheckDocument(resolved)
  -> resolveRenderProfileWithDiagnostics()
  -> buildRunPlan()
  -> preflightRun()
  -> buildCanonicalLnf()
  -> exportTrainingRecordFromDocument()
  -> buildRagExportFromTrainingRecord()
  -> buildTrainingUnderstandingFromRecord()
  -> buildAuthoringAssistance()
  -> buildAuthoringDiagnostics()
  -> renderHtml / renderJson / renderDocxBridge
```

这条链路意味着 compiler 是所有 agent、训练、RAG、导出能力的统一裁判。

## 5. Agent 总体架构

Agent 系统建议拆成 10 个角色。

### 5.1 Input Router

识别用户输入类型：

- 纯问答：解释、检索、对比。
- 原始实验记录：需要转成 Chemd。
- Chemd 草稿：需要 repair、lint、补引用。
- 修改请求：需要 patch 某些块。
- 实验建议：需要 RAG、聚类和专家路由。
- 训练/评估任务：需要投影 dataset。

Router 输出一个任务上下文：

```json
{
  "intent": "write_chemd | repair_chemd | ask_rag | compare_experiments | suggest_condition",
  "source_kind": "raw_note | chemd | ocr | table | diff | query",
  "requires_compile": true,
  "requires_user_confirmation": true
}
```

### 5.2 Chemd Writer

把自然语言、OCR、表格或聊天记录转成 Chemd draft。

它只能生成候选文档，不能宣布事实已成立。所有输出必须进入 `compileChemd()`。

### 5.3 Compiler Judge

Compiler Judge 不是一个模型，而是 `compileChemd()` 及其诊断系统。

它负责：

- parse / resolve / typecheck
- runtime preflight
- training export quality
- authoring assistance
- diagnosis
- safe fixes

Agent 不能绕过它。

### 5.4 Repair Loop

`runChemdRepairLoop()` 只应用 deterministic safe fixes。

适合处理：

- 可机械补齐的字段
- 可确定的 frontmatter 建议
- 可稳定应用的 quick fix

不适合处理：

- 缺实验事实
- 语义冲突
- 多个可能答案
- 需要实验员判断的内容

### 5.5 Agent Loop Driver

`runChemdAgentLoop()` 在 repair loop 之后，把 unresolved diagnosis 发给外部 driver。

driver 输入包括：

- `source`
- `diagnosis`
- `diagnostics`
- `repair.finalDiagnosis`
- `repair.stoppedReason`
- `history`

driver 只能返回：

```json
{ "action": "rewrite", "nextSource": "..." }
```

或：

```json
{ "action": "stop", "note": "need more facts" }
```

核心原则：

```text
缺结构可以 rewrite；
缺真相就 stop。
```

### 5.6 RAG Retriever

RAG 只从 `ragExport` 和 `chemd_rag_chunks` 工作。

它服务：

- 相似实验召回
- 失败案例检索
- 条件案例检索
- 证据上下文补充

它不能直接作为 LoRA 样本来源。

### 5.7 Expert Router

专家路由基于 `trainingUnderstanding` 派生结构，而不是直接读自然语言。

三层专家：

- 任务专家：`record_to_chemd_expert`、`chemd_repair_expert`、`yield_prediction_expert`、`condition_recommendation_expert`。
- 反应家族专家：`cross_coupling_expert`、`oxidation_expert`、`reduction_expert`、`protection_expert`。
- 决策专家：`yield_optimization_expert`、`condition_screening_expert`、`failed_reaction_diagnosis_expert`、`safety_risk_expert`。

Router 输入示例：

```json
{
  "task_type": "condition_recommendation",
  "reaction_family": "cross_coupling",
  "key_variables": ["base", "ligand", "solvent", "temperature"],
  "failure_modes": ["low_conversion"],
  "outcome_quality": {
    "yield_basis": "isolated",
    "yield_confidence": "confirmed"
  }
}
```

Router 输出示例：

```json
{
  "expert_labels": [
    "cross_coupling_expert",
    "palladium_catalysis_expert",
    "yield_optimization_expert"
  ],
  "routing_basis": [
    "reaction_family=cross_coupling",
    "task_type=condition_recommendation"
  ],
  "confidence": "high",
  "warnings": []
}
```

### 5.8 Expert Adapters

早期不建议直接上重型 MoE。推荐演进：

```text
阶段 1：shared backbone + task heads
阶段 2：shared backbone + LoRA adapters + router
阶段 3：router + domain adapters + verifier
阶段 4：必要时再升级真正 MoE
```

Adapter 的训练数据来自 `ChemdTrainingTaskDatasetV1`，不是 raw source。

### 5.9 Verifier / Critic

Verifier 必须在专家输出后执行。

检查项：

- source entity 是否存在
- 输出是否越过证据边界
- 是否使用了不可训练结果
- 是否泄漏 target 字段
- 是否违反 missing logic
- 是否把推断写成确定事实

早期 verifier 可以是规则和 schema 校验。后续可以加入 critic model。

### 5.10 Knowledge Updater

Knowledge Updater 只在用户确认、保存或人工审查后更新知识。

它负责：

- source diff
- structural diff
- semantic diff
- graph index
- reaction clusters
- training memory
- correction patterns
- dataset projections
- eval set 更新

## 6. 用户输入之后发生什么

### 6.1 用户输入自然语言实验记录

```text
用户输入 raw note / OCR / table
  -> Input Router 判定 write_chemd
  -> RAG Retriever 找相似实验和模板
  -> Chemd Writer 生成 draft source
  -> compileChemd()
  -> Repair Loop 应用 safe fixes
  -> Agent Loop 处理可保守 rewrite 的 diagnosis
  -> Verifier 检查引用、事实边界、泄漏
  -> 返回 Chemd 草稿、diagnostics、需要用户确认的问题
```

如果 compiler clean：

```text
用户确认保存
  -> 写入 revision
  -> 保存 compile artifacts
  -> 建立 semantic entities / relations / field evidence
  -> 建立 rag chunks / embeddings
  -> 更新 trainingUnderstanding
```

如果缺事实：

```text
driver stop
  -> 显示 requiredInputs
  -> 等用户补真实事实
```

### 6.2 用户输入 Chemd 草稿

```text
Chemd source
  -> compileChemd()
  -> diagnosis
  -> repair-loop
  -> agent-loop driver
  -> updated source or stop
```

这里 agent 的最小修改原则非常重要：

- 不重排已有块
- 不重命名已有 ID
- 不删除无关内容
- 不发明 `yield`、`status`、`result`
- 不把 prose 改成 compiler 不支持的私有语法

### 6.3 用户问“下一步条件怎么改”

```text
用户问题
  -> Input Router 判定 suggest_condition
  -> 当前 Chemd 编译为 trainingUnderstanding
  -> RAG 检索相似实验和失败案例
  -> Graph Index 找 reaction clusters / similar edges
  -> Expert Router 选择任务专家 + 反应家族专家 + 决策专家
  -> Expert Adapter 生成建议
  -> Verifier 检查证据、泄漏和不确定性
  -> 输出建议、依据、风险、需要补的信息
```

建议不会直接写入知识库。只有用户采纳、编辑或确认后，才会进入 diff 和 memory。

### 6.4 用户修改已有实验

```text
old source + new source
  -> git diff / source diff
  -> old compile / new compile
  -> structural diff
  -> semantic diff
  -> training uses
  -> memory update
```

三层 diff 分工：

- source diff：用户实际改了哪几行。
- structural diff：哪个 block、entity、field 变了。
- semantic diff：实验事实如何变化。

示例：

```text
changed:
  catalyst: Pd(PPh3)4 -> Pd(dppf)Cl2
  yield: 35% -> 72%

controlled:
  solvent: dioxane
  base: K2CO3
  temperature: 80 C

training_uses:
  experiment_comparison
  optimization_trajectory
  condition_recommendation
```

## 7. 反应聚类架构

反应聚类不应该只靠文本 embedding。

推荐 representation：

```text
reaction representation =
  reaction taxonomy
  + reactant/product graph delta
  + role vector
  + condition vector
  + outcome vector
  + failure mode vector
  + Chemd AST / IR features
  + optimization trajectory features
  + provenance and quality features
```

分层：

```text
Level 0: project / source / dataset
Level 1: broad reaction family
Level 2: transformation type
Level 3: reaction center / functional group change
Level 4: condition family
Level 5: substrate or product series
Level 6: optimization trajectory
```

当前 `ChemdTrainingGraphIndexV1` 的方向已经覆盖：

- nodes
- edges
- reaction_features
- reaction_clusters
- reaction_similarity_edges

聚类输出应该能解释：

- 为什么这些 reaction 是一组
- 共享哪些变量
- 哪些是 controlled variables
- 哪些变化影响 outcome
- 质量和置信度如何

## 8. 知识更新与记忆闭环

知识更新不是“把所有聊天都塞进向量库”。Chemd 的知识更新应该是事件化、可审计、可撤回的。

### 8.1 可进入知识库的事件

推荐只让这些事件更新长期知识：

- 用户保存 Chemd 文档
- 用户接受 agent rewrite
- 用户拒绝某条建议
- 用户修正 expert routing label
- 用户标记结果不可训练
- 用户确认 semantic diff
- Git history 中可编译的实验事实变化

### 8.2 Training Memory

`buildTrainingMemoryRecords()` 的链路是：

```text
beforeUnderstanding + afterUnderstanding
  -> memory snapshot comparison
  -> semantic diff
  -> training experience events
  -> correction patterns
  -> experiment pattern memory
  -> dataset projections
```

对应存储：

- `chemd_semantic_diffs`
- `chemd_training_experience_events`
- `chemd_correction_patterns`
- `chemd_experiment_pattern_memory`
- `chemd_dataset_projections`

### 8.3 经验如何升级

知识升级应该分阶段：

```text
single event
  -> repeated correction pattern
  -> experiment pattern memory
  -> validator hint
  -> authoring template
  -> training sample
  -> eval case
  -> optional rule promotion
```

这能避免一次错误修正污染模型。

### 8.4 防污染原则

每条长期知识都要带：

- source document
- source revision
- source span
- entity ids
- semantic diff id
- human verification status
- quality tier
- training uses
- reversible projection version

没有这些 provenance 的内容，只能做短期上下文，不能进入训练母数据。

## 9. Agent 架构边界

### 9.1 Agent 可以做什么

- 把原始记录转成 Chemd draft。
- 根据 diagnosis 做最小 rewrite。
- 查询相似实验和失败案例。
- 解释 diagnostics。
- 生成条件建议。
- 生成 semantic patch 候选。
- 生成 task dataset 候选。
- 帮助人工审查 evidence 和 routing label。

### 9.2 Agent 不应该做什么

- 绕过 compiler 直接写训练数据。
- 把 RAG chunk 当 LoRA 样本。
- 把缺失事实编造成结构字段。
- 在未确认时更新长期知识。
- 因为建议看起来合理就改写实验结论。
- 把推断结果写成无 provenance 的确定事实。

## 10. 建议的落地顺序

短期最有价值的顺序：

1. 固化 Input Router 的 intent 与 source_kind。
2. 把 Chemd Writer 输出收敛成 `rewrite | stop` 协议。
3. 增强 `compileChemd()` diagnosis 到 agent 可消费格式。
4. 完善 source diff / structural diff / semantic diff 三层输出。
5. 将 semantic diff 接入 memory loop。
6. 将 graph index 用于相似实验和反应聚类。
7. 将 expert routing labels 接入 task dataset。
8. 加 verifier gate，防止泄漏和越界结论。

## 11. 当前仓库相关入口

- 编译主链：[packages/compiler/src/index.ts](../packages/compiler/src/index.ts)
- agent loop：[packages/compiler/src/agent-loop.ts](../packages/compiler/src/agent-loop.ts)
- repair loop：[packages/compiler/src/repair-loop.ts](../packages/compiler/src/repair-loop.ts)
- agent driver 协议：[packages/cli/src/agent-driver.ts](../packages/cli/src/agent-driver.ts)
- semantic diff：[packages/cli/src/semantic-diff.ts](../packages/cli/src/semantic-diff.ts)
- AST 定义：[packages/core/src/ast.ts](../packages/core/src/ast.ts)
- typechecker types：[packages/typechecker/src/types.ts](../packages/typechecker/src/types.ts)
- training export types：[packages/exporter-training/src/types.ts](../packages/exporter-training/src/types.ts)
- training understanding types：[packages/exporter-training/src/projection-types.ts](../packages/exporter-training/src/projection-types.ts)
- graph index：[packages/exporter-training/src/graph-index-types.ts](../packages/exporter-training/src/graph-index-types.ts)
- memory loop：[packages/storage-postgres/src/memory-loop.ts](../packages/storage-postgres/src/memory-loop.ts)
