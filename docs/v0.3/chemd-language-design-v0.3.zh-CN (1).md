# chemd-lang v0.3：在不改变现有语法前提下的语言内核设计

> 2026-04-18 状态说明：本文是 v0.3 历史设计稿，不再代表当前 canonical surface。当前实现已推荐 `:::chemd` 内显式 `kind: molecule | reaction`，并支持显式 `step:` / `event:` 及嵌套 `:::step` / `:::event`。当前合同以 `docs/chemd_concrete_design_checklist.md` 与 `.trellis/spec/compiler/backend/language-v03-contracts.md` 为准。

副标题：保持 `chemd v0.1` Markdown / block 表层不变，把内部语义层做成真正可编译、可检查、可训练的实验语言
状态：修订版（非破坏式）
适用范围：`docs/`、`packages/*`、`apps/web`、`services/chem-service`

---

## 0. 文档摘要

这份修订版只做一件事：**把此前“把实验记录设计成编程语言”的想法，改写成不破坏当前代码库表层语法的版本。**

新的核心判断如下：

1. `chemd` 的作者输入面继续是当前 `v0.1` 已有的 Markdown / frontmatter / `:chem[...]` / `:::block` / 引用 / `template/use`。
2. `chemd-lang` 不再被定义成一套新的作者手写 DSL，而是被定义成 **从现有 chemd 文档编译出来的内部语义语言层**。
3. 类型系统、步骤本体、运行时、诊断码、LNF、训练导出都建立在这个内部语义层之上，而不是要求作者改写现有文档语法。
4. `procedure` 与 `observation` 仍然优先保持自然语言和 Markdown 可读性；系统通过 lowering、抽取、规范化和诊断，把它们转成机器可消费的 typed object。

一句话总结：

> **对人保持 Markdown 文档，对机器编译成实验程序。**

---

## 1. 重新校准后的基本判断

### 1.1 什么不能再做

本版设计明确放弃以下路线：

- 不新增第二套默认作者语法。
- 不要求普通研究者手写 `let / step / require / result {}` 之类的代码式表层。
- 不把当前 `v0.1` 已实现的 `:chem[...]`、`:::block`、列表字段、引用系统、模板系统替换掉。
- 不把 `procedure` 和 `observation` 强行改成只有键值对才合法。

### 1.2 什么仍然要做

放弃新表层语法，不等于放弃“语言化”。真正要做的是：

- 把现有文档稳定编译成统一 AST / resolved document。
- 在 resolved document 之上建立 typed semantic graph。
- 把 `procedure` 降解成 canonical step graph。
- 把 `observation`、`analysis`、`result` 接成可校验、可回放、可训练的对象模型。
- 让 LLM 学习的是“现有 chemd 表层 + 内部正规形”的双视图，而不是凭空学一门新语法。

### 1.3 修订后的定义

`chemd-lang v0.3` 的定义应改写为：

> **建立在现有 chemd Markdown 语法之上的内部实验语义语言层。**

它的职责不是替代作者输入，而是为以下能力提供统一真相源：

- 类型检查
- 步骤抽取与标准化
- 运行时计划与 trace
- 诊断与修复
- LNF 与训练导出
- 检索、比较、失败分析、轨迹学习

---

## 2. 非破坏式设计原则

### 2.1 表层语法冻结

`v0.3` 设计默认冻结以下表层合同：

- Markdown 作为源文本
- frontmatter
- `:chem[...]`
- `:::block_name #id ... :::`
- 列表字段用 `|`
- `@id` / `@id.field` / `@meta.*` / `@param.*`
- `template` / `use`
- `procedure` / `observation` 以自然语言正文为主

### 2.2 内核增强，不是表层扩张

新增能力优先以下沉方式出现：

- 新类型先出现在内部 IR，不先暴露为作者必写语法。
- 新步骤先出现在 lowering 和 registry，不先出现在作者 DSL。
- 新 validator 先给出现有 Markdown 的错误码和 quick fix，不先要求作者学习新关键字。
- 新 runtime 先消费 typed semantic graph，不直接消费作者源码。

### 2.3 原文保留

任何结构化或规范化都不覆盖原文，而是并存：

- raw value
- normalized value
- source span
- lowered object

### 2.4 渐进结构化

优先级如下：

1. 继续稳定 `molecule / reaction / result / analysis / sample / template / use`
2. 从 `procedure` 的标题、列表、句式中抽取步骤
3. 从 `observation` 正文中抽取事件
4. 必要时给出“建议性结构化写法”，但不把它升级成唯一合法语法

### 2.5 训练面与作者面分离

- 作者默认写当前 chemd Markdown。
- 编译链生成 AST / resolved document / typed graph / LNF。
- LLM 主要学习内部正规形和双视图映射。

---

## 3. 冻结的表层语法合同

### 3.1 当前作者输入面

作者继续使用如下结构：

```md
---
entry_type: experiment
id: exp-2026-04-11-014
title: 芳基溴与哌嗪偶联尝试
project: alpha
status: completed
primary_reaction: rxn-main
primary_result: res-main
---

# Objective

测试 Buchwald–Hartwig 条件是否适用于该底物。

:::reaction #rxn-main
reactants: aryl_bromide_01 | piperazine_02
catalyst: Pd2(dba)3
solvent: dioxane
temperature: 100 °C
time: 16 h
atmosphere: nitrogen
:::

## Procedure

:::procedure #proc-main
1. 将 aryl_bromide_01、piperazine_02 和 Cs2CO3 加入反应瓶。
2. 氮气置换 15 min。
3. 加入 Pd2(dba)3 和 XPhos。
4. 加热到 100 °C 反应 16 h。
:::

:::observation #obs-1
加热后体系呈深黄色，TLC 显示原料仍有残留。
:::

:::analysis #ana-tlc
type: tlc
eluent: PE/EtOAc 3:1
result: partial_conversion
:::

:::result #res-main
status: partial
yield: 23%
purity: 91%
notes: 转化不足
:::
```

### 3.2 明确不新增的作者默认语法

本版设计不把以下形式纳入作者默认合同：

```chemd
let scale = 0.5 mmol;
step heat(v1, 100 °C, 16 h);
require inert();
```

如果未来需要类似表达，也只能作为：

- 内部 canonical form
- 调试视图
- 机器生成的中间表示
- 实验自动化接口层

而不是作者日常书写面的默认入口。

### 3.3 允许增强的只有两类东西

第一类是 **写作约定增强**，不是语法增强，例如：

- 在 `procedure` 中更推荐编号列表而不是大段无分句文字。
- 在 `observation` 中更推荐按阶段分段描述。
- 在 `analysis` 中更推荐显式填写 `type/result/method`。

第二类是 **内部解析增强**，例如：

- 更强的列表识别
- 更强的量纲识别
- 更强的步骤抽取
- 更强的 references linking

---

## 4. 程序模型：文档即程序源，语义图即程序内核

### 4.1 三层模型

`chemd` 的程序模型应改成以下三层：

```text
作者层（Author Surface）
  Markdown + frontmatter + chemd blocks + prose

语义层（Semantic Core）
  AST -> resolved document -> typed semantic graph -> step graph

执行层（Execution Core）
  run plan -> runtime trace -> replay/export/LNF
```

### 4.2 一等对象

内部语义层的一等对象仍然来自当前文档体系：

- Document
- Molecule
- Reaction
- Result
- ProcedureNarrative
- ObservationNarrative
- Analysis
- Sample
- Template
- Use
- MarkdownBlock
- TrajectoryLink

在这之上，再生成内部对象：

- Quantity
- ConditionSet
- Step
- ObservationEvent
- Outcome
- ExperimentRecord
- RunPlan
- Trace
- DiagnosticFact
- LNFNode

### 4.3 程序化不是“长得像代码”

这里的“程序化”指的是：

- 有确定的对象边界
- 有稳定引用
- 有依赖和顺序
- 有可检查的前置条件
- 有运行时状态变化
- 有结果和失败信号

而不是“表面看起来像 C / Rust / Python”。

---

## 5. 内部表示栈

### 5.1 推荐表示链

```text
Markdown source
  -> CST
  -> AST
  -> ResolvedDocument
  -> TypedSemanticGraph
  -> StepGraph
  -> RunPlan
  -> Trace
  -> LNF / Training Export Views
```

### 5.2 每一层的职责

#### CST
保留源文本结构和位置。

#### AST
表达块、字段、正文、引用、模板调用。

#### ResolvedDocument
完成模板展开、引用解析、主对象绑定。

#### TypedSemanticGraph
把数量、单位、条件、结果、分析、对象关系 typed 化。

#### StepGraph
把 `procedure` / `analysis` / `observation` 降到 canonical step 与 event。

#### RunPlan
给 runtime 的可执行计划。

#### Trace
记录实际执行和观测反馈。

#### LNF
给 LLM 和训练系统的稳定正规形。

### 5.3 关键点

**只有表层是 Markdown；内部所有层都应该是强结构。**

---

## 6. 从现有语法到内部语义层的 lowering 规则

### 6.1 frontmatter lowering

frontmatter 继续产生：

- document metadata
- primary object binding
- render profile selection
- project / tags / date / status

### 6.2 block lowering

现有 block 继续是主要结构入口：

- `molecule` -> `MoleculeNode`
- `reaction` -> `ReactionNode`
- `result` -> `ResultNode`
- `analysis` -> `AnalysisNode`
- `sample` -> `SampleNode`
- `template/use` -> expanded subtree
- `procedure` -> `ProcedureNarrativeNode`
- `observation` -> `ObservationNarrativeNode`

### 6.3 procedure lowering

`procedure` 不要求作者手写 step 语法；系统负责把正文和列表转成 step candidates。

示例：

```md
:::procedure #proc-main
1. 冰浴冷却至 0 °C。
2. 缓慢滴加 n-BuLi。
3. 保温 20 min 后升至室温。
:::
```

lowering 结果：

```yaml
procedure_id: proc-main
lowered_steps:
  - op: cool
    target_temperature: 0 °C
  - op: add
    material: n-BuLi
    mode: dropwise
  - op: hold
    duration: 20 min
    constraint: keep_below 5 °C
  - op: warm
    target_temperature: room_temperature
```

### 6.4 observation lowering

`observation` 保持自然语言，但系统提取：

- stage
- event_type
- free-text description
- confidence
- possible interpretation

### 6.5 analysis lowering

`analysis` 继续是块对象，但被 lower 成：

- analysis task
- instrument / method
- structured measurements
- normalized result hint

---

## 7. 内部类型系统应增强什么

这份总设计只给高层约束，详细内容见类型系统文档。这里强调三点：

### 7.1 类型系统是内部的

作者不用写：

- `Amount`
- `ConditionSet`
- `Step`
- `ObservationEvent`

但编译器必须在内部为这些对象建立正式类型。

### 7.2 数量与量纲必须正式化

以下字段不应继续只当字符串：

- amount
- equivalents
- temperature
- time
- pressure
- concentration
- yield / conversion / purity

### 7.3 narrative 也有类型

`procedure` 和 `observation` 虽然是 prose，但内部仍需 typed：

- `ProcedureNarrative` 不等于原始字符串
- `ObservationNarrative` 不等于原始字符串
- narrative 与 lowered object 必须共存

---

## 8. 引用、作用域与对象绑定

### 8.1 继续沿用当前引用系统

不新增新风格引用语法，继续使用：

```md
@rxn-main
@res-main.yield
@meta.title
@param.note
```

### 8.2 作用域规则

作用域仍优先围绕当前文档模型：

- frontmatter scope
- block id scope
- template parameter scope
- primary alias scope

### 8.3 新增的是内部绑定，不是表层语法

新增的对象绑定发生在 resolver 与 semantic linker 中，例如：

- result -> reaction
- analysis -> sample/result
- procedure -> reaction context
- observation -> step / stage

---

## 9. 函数、标准库与模板的重新定义

### 9.1 不引入作者函数语法

本版不定义作者手写的：

- `fn`
- `experiment foo(...)`
- `return`

### 9.2 标准库存在，但作为内部注册表和模板库存在

这里的“标准库”应理解为：

- step ontology registry
- unit normalization registry
- token normalization registry
- SOP template library
- validator ruleset registry
- LNF builders

### 9.3 template/use 仍是作者侧复用机制

对作者来说，复用机制还是现有 `template` / `use`。

对机器来说，模板展开后会进入：

- typed semantic graph
- step graph
- diagnostics provenance

---

## 10. 步骤、过程与控制流

### 10.1 控制流不在作者表层出现

作者不需要写：

- `if`
- `for`
- `while`
- `try`

### 10.2 控制流存在于内部语义层

例如，以下叙述：

```md
若 TLC 显示原料未尽，则继续加热 2 h。
```

内部可以被表达为条件分支或 decision note，但这属于：

- lowered control node
- runtime decision point
- validator warning candidate

而不是作者必须手写的新语法。

### 10.3 优先支持的顺序逻辑

最值得优先支持的逻辑不是通用编程结构，而是实验常见顺序逻辑：

- ordered steps
- precondition
- postcondition
- stage boundary
- analysis checkpoint
- retry / repeat note

---

## 11. 静态检查系统

### 11.1 保持对现有源码的诊断友好

所有新增静态检查都应定位到当前 Markdown 源文档中的具体位置，而不是只报内部 IR 错误。

### 11.2 检查分层

推荐分为：

1. Syntax / block / YAML
2. Reference / template
3. Unit / quantity / normalization
4. Reaction / result / analysis semantic consistency
5. Procedure / step logic
6. Safety / capability / policy
7. Runtime planning preflight
8. Retrieval / precedent awareness

### 11.3 quick fix 原则

quick fix 只生成现有语法下的修复建议，例如：

- 补全缺字段
- 规范化单位
- 拆分过长步骤
- 把模糊 observation 建议拆成 stage + event 描述

而不是建议用户“改写成另一种 DSL”。

---

## 12. 运行时设计的重新定位

### 12.1 runtime 不消费作者源码

runtime 的输入应是：

- typed semantic graph
- lowered step graph
- run plan

### 12.2 runtime 的意义

runtime 不是化学模拟器，而是：

- 执行计划管理器
- step 状态机
- observation / analysis 事件采集器
- trace 记录器
- replay / debug 入口

### 12.3 runtime 与源码的关系

runtime 需要能回写：

- structured trace
- deviation
- observation evidence
- result updates

但原则上不篡改原始作者叙述，只在必要时生成补充记录或建议 patch。

---

## 13. LLM 正规形（LNF）的重新定义

### 13.1 LNF 不是新的作者语法

LNF 只是一种给模型看的 canonical representation。

### 13.2 LNF 的输入来源

LNF 建立在：

- resolved document
- typed semantic graph
- step graph
- diagnostics
- optional trace

### 13.3 LNF 的价值

LNF 解决的是：

- prose 粒度不一致
- 同义写法过多
- 条件、步骤、结果漂移
- 模型难以稳定比较实验逻辑

### 13.4 LNF 不向作者暴露为默认写法

编辑器可以在右侧展示 LNF / lowered steps / compiled JSON，但作者仍然默认编辑 Markdown。

---

## 14. 与 LSP / UI / Workspace 的关系

### 14.1 UI 继续维持双视图

推荐长期保持：

- 左侧：Markdown / chemd source
- 右侧：Preview / diagnostics / structured summary / lowered steps / LNF

### 14.2 Workspace 语义继续加强

可以强化：

- diff
- trace
- blame
- nearest experiment
- nearest failure
- trajectory view

但这些都建立在内部对象图之上，而不是建立在新的表层语法之上。

---

## 15. 与当前 monorepo 的对齐实现

### 15.1 不破坏现有主链

继续以当前主链为入口：

```text
Markdown source
  -> parser
  -> resolver
  -> render-profile
  -> preview/export
```

### 15.2 新增层的位置

在 resolver 之后新增：

```text
resolved document
  -> typed semantic graph
  -> step graph
  -> validator bundles
  -> runtime plan / LNF / training export
```

### 15.3 包级建议

推荐新增但不替代现有包：

- `packages/typechecker`
- `packages/step-ontology`
- `packages/runtime-lab`
- `packages/runtime-trace`
- `packages/diagnostics`
- `packages/lnf`

---

## 16. 向后兼容策略

### 16.1 默认兼容旧文档

任何现有合法 `v0.1` 文档都应：

- 继续可 parse
- 继续可 resolve
- 继续可 preview/export

### 16.2 新能力默认是“增强”，不是“破坏”

旧文档即使没有完整 lowering，也应：

- 允许 partial semantic graph
- 允许 partial step graph
- 给出 warning，而不是 fatal error

### 16.3 升级路线

升级优先级应为：

1. 更强 normalize
2. 更强 lower
3. 更强 validator
4. 更强 trace
5. 更强 LNF/exporter

不是“先换语法”。

---

## 17. 示例：同一份现有文档的多层表示

### 17.1 作者源文档

```md
:::reaction #rxn-main
reactants: substrate_1 | reagent_2
solvent: THF
temperature: -78 °C
atmosphere: nitrogen
:::

:::procedure #proc-main
1. 将底物溶于 THF，冷却至 -78 °C。
2. 在氮气下滴加 n-BuLi。
3. 反应 30 min 后加入电荷试剂。
:::

:::observation #obs-main
加入 n-BuLi 后体系逐渐变深红色。
:::
```

### 17.2 lowered step graph

```yaml
steps:
  - id: s1
    op: dissolve
    solvent: THF
  - id: s2
    op: cool
    target_temperature: -78 °C
  - id: s3
    op: add
    material: n-BuLi
    mode: dropwise
    atmosphere: nitrogen
  - id: s4
    op: hold
    duration: 30 min
  - id: s5
    op: add
    material: electrophile
observations:
  - source: obs-main
    event_type: color_change
    stage: after s3
    description: 深红色
```

### 17.3 LNF

```yaml
experiment:
  reaction:
    reactants: [substrate_1, reagent_2]
    solvent: THF
    temperature: -78 °C
    atmosphere: nitrogen
  procedure:
    - dissolve(substrate_1, THF)
    - cool(-78 °C)
    - add(n-BuLi, mode=dropwise, atmosphere=nitrogen)
    - hold(30 min)
    - add(electrophile)
  observations:
    - color_change(after=add:n-BuLi, value=deep_red)
```

重点在于：**作者语法完全没变，机器理解却明显增强。**

---

## 18. 数据与训练接口

### 18.1 训练不学新表层 DSL

训练任务优先学习：

- 现有 chemd source
- AST / resolved document
- lowered steps
- diagnostics
- LNF

### 18.2 关键任务重排

相较此前版本，应把优先级调整为：

1. `raw_to_chemd`（输出现有语法）
2. `chemd_to_ast`
3. `resolved_to_lnf`
4. `procedure_to_steps`
5. `observation_to_events`
6. `diagnostic_to_fix`
7. retrieval / rerank / predictor / SFT

### 18.3 默认输出策略

模型在编辑场景下默认输出：

- 现有 chemd Markdown
- compiled JSON
- LNF
- diagnostics + fix patch

而不是输出新的代码式语法。

---

## 19. 安全与约束模型

### 19.1 安全规则落在内部层

- 危险组合检查
- 温度 / 压力边界
- atmosphere 约束
- quench / addition order 风险

这些都由内部 validator、planner、runtime preflight 承担。

### 19.2 对作者的反馈形式

反馈形式保持当前风格：

- diagnostic code
- source span
- explanation
- suggested fix in current syntax

---

## 20. 版本化与迁移

### 20.1 版本命名

建议把本修订版理解为：

- `chemd-lang v0.3 (surface-preserving)`

### 20.2 迁移策略

后续若真的考虑新增作者语法，也必须满足：

- 完整兼容当前语法
- 有明确用户研究和编辑器支持
- 作为可选高级视图，而不是默认写作入口

在此之前，所有 v0.3 文档均按“表层冻结、内核增强”执行。

---

## 21. 建议的落地顺序

### Phase A：冻结原则

- 在所有 v0.3 设计文档顶部加上“保持 v0.1 表层语法不变”的约束。
- 删除或降级所有默认作者新语法示例。

### Phase B：先做内部层

- `typechecker`
- `step-ontology`
- `diagnostics`
- `lnf`
- `exporter-training`

### Phase C：把 UI 做成双视图

- Markdown 编辑
- 结构化预览
- lowered steps
- diagnostics
- LNF / trace inspect

### Phase D：再做 runtime / trace / retrieval / predictor / SFT

---

## 22. 最终定义

本修订版对 `chemd-lang` 的最终定义是：

> **`chemd-lang` 不是替代现有 chemd Markdown 的第二套作者语法，而是从现有 chemd Markdown 编译出来的内部实验语义语言层。**

它的成功标准不是“作者是否开始写代码式实验记录”，而是：

- 现有文档是否更易结构化
- 现有实验是否更可比较
- 现有流程是否更可校验
- 现有失败是否更可诊断
- LLM 是否更能看清实验逻辑

---

## 23. 推荐直接落到仓库里的后续文件

1. `chemd-markdown-surface-contract.zh-CN.md`
   冻结当前作者语法合同。

2. `packages/lnf/README.md`
   定义 LNF 只作为内部正规形。

3. `packages/procedure-lowering/README.md`
   定义 prose / list -> steps 的 lowering 规则。

4. `tools/training/build_surface_and_lnf_pairs.py`
   构造作者视图与机器视图双表示训练样本。

---

## 24. 附：最小非破坏式示例

### 24.1 作者写法

```md
:::procedure #proc-1
1. 冰浴冷却至 0 °C。
2. 缓慢滴加 n-BuLi。
3. 保温 20 min。
:::
```

### 24.2 编译器内部写法

```yaml
procedure_id: proc-1
steps:
  - op: cool
    target_temperature: 0 °C
  - op: add
    material: n-BuLi
    mode: dropwise
  - op: hold
    duration: 20 min
```

### 24.3 设计含义

- 作者没有学新语法。
- 代码库没有改现有语法。
- 类型系统、运行时、LLM 训练却都有了稳定输入。

---

**End of Document**
