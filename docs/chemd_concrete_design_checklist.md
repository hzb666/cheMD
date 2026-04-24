# cheMD 具体设计清单（仅依据 develop 分支当前代码）

> 目标：回答一个核心问题——**cheMD 是否应该演进成类似 TypeScript 的通用强类型语言**。
>
> 本文结论：**不应该**。更合适的方向是：
>
> - **要加强**：类型、检查、规则、可执行性、运行时追踪、LLM 友好的结构化输出
> - **有限增加**：模板参数类型、纯函数式派生表达式、受控工作流运行时
> - **不要增加**：通用函数定义、任意控制流、可变状态脚本、图灵完备能力
>
> cheMD 应该成为：**强类型、强校验、有限可执行、可追溯的化学 DSL**。

> 2026-04-18 状态更新：主链路已实现 `:::chemd + kind:`, explicit `step/event`, typedGraph, LNF v0.3/v0.4, runtime-lab/runtime-trace adapter, training export 与 Web diagnostics 面板。Quick-fix 当前只有 `insert_chemd_kind` 是可执行写回；`normalize_unit`、`split_procedure_sentence`、`convert_legacy_block` 等仍是诊断建议元数据或脚本/后续 UI 能力。派生 step/event 已带 source、confidence 与 provenance；作者级 source span 仍以已有 parser span 能力为准，不等同于所有字段完整精确 span。

> 2026-04-20 状态更新：training export 已进一步补齐 `semantic_layer.links` 与 retrieval chunks，能表达 reaction/result/analysis/sample/markdown 的基本事实关系。当前方向不引入通用 branch/if/else；实验变体应优先建模为 `trial` / `variant`，且应在 sample lineage 与 evidence/artifact 语义稳定后再扩展表层 DSL。

---

## 1. 当前代码基线

本文只依据当前 `develop` 分支代码，不参考 README。

### 1.1 表层语法基线

当前 parser 注册的 block 是：

- `chemd`
- `result`
- `analysis`
- `sample`
- `procedure`
- `observation`
- `use`
- `col`

也就是说，**`:::chemd` 是当前主表层块**。`molecule` 和 `reaction` 不是 parser 注册的表层 block，而是 `parseChemdBlock()` 根据字段形状推断出的语义节点。

代码基线：

- `packages/parser/src/body/block-parsers/index.ts`
- `packages/parser/src/body/block-parsers/chemd.ts`

### 1.2 AST 基线

当前 core AST 暴露的核心节点包括：

- `MoleculeNode`
- `ReactionNode`
- `ResultNode`
- `AnalysisNode`
- `ProcedureNode`
- `ObservationNode`
- `SampleNode`
- `TemplateNode`
- `UseNode`
- `ColNode`

`ProcedureNode` 与 `ObservationNode` 当前仍保留 `ref + body` 兼容形态，
并已开始支持行式显式结构：

- `procedure` 可解析 `step: ...` 为 `ProcedureStepNode[]`
- `observation` 可解析 `event: ...` 为 `ObservationEventAuthorNode[]`
- `procedure` 可解析嵌套 `:::step ... :::` 子块
- `observation` 可解析嵌套 `:::event ... :::` 子块

source span 已有基础字段，provenance 已覆盖 lowered procedure/observation/analysis 与显式 step/event 主链路；字段级完整 source span 仍是后续精化项。

代码基线：

- `packages/core/src/ast.ts`

### 1.3 过程逻辑基线

`procedure` 当前支持两条路径：

- 显式 `step: ...` 行会进入 `ProcedureStepNode[]`，typechecker 直接生成 canonical step
- 嵌套 `:::step` 子块同样会进入 `ProcedureStepNode[]`
- 自由文本 `body` 继续在 typechecker 阶段调用 `lowerProcedureToSteps()`，由 `step-ontology` 把自然语言句子降成 canonical step

当前 step family 已经有：

- `charge`
- `add`
- `transfer`
- `mix`
- `cool`
- `heat`
- `hold`
- `purge`
- `quench`
- `extract`
- `wash`
- `separate_layers`
- `filter`
- `dry`
- `concentrate`
- `purify`
- `sample`
- `analyze`
- `observe`
- `store`

当 procedure 句子无法匹配 canonical step 时，会生成低置信度 `observe`，并发出 `W805`。

代码基线：

- `packages/parser/src/body/block-parsers/procedure.ts`
- `packages/typechecker/src/index.ts`
- `packages/step-ontology/src/types.ts`
- `packages/step-ontology/src/procedure.ts`

### 1.4 类型系统基线

当前 typechecker 已经有基础类型化：

- `TypedMoleculeNode`
- `TypedReactionNode`
- `TypedResultNode`
- `TypedAnalysisNode`
- `TypedProcedureNarrativeNode`
- `TypedObservationNarrativeNode`
- `TypedSampleNode`

同时已经有 `QuantityType`，支持：

- `amount`
- `mass`
- `volume`
- `temperature`
- `time`
- `pressure`
- `concentration`
- `equivalent`
- `percent`

procedure 和 observation 已开始支持作者提供的显式 step/event，
但 typed graph 中仍保留 narrative 兼容节点，尚未完全收敛为强类型一等节点。

代码基线：

- `packages/typechecker/src/types.ts`
- `packages/typechecker/src/index.ts`

### 1.5 模板与解析基线

当前 resolver 已支持：

- object / field / alias / param 级引用
- `template/use` 展开
- primary alias（如 `primary_reaction`、`primary_result`、`primary_product`）

同时 resolver 对模板展开明确做了**有界限制**：

- 最大深度：`32`
- 最大展开节点：`2000`
- 模板环：`E_TEMPLATE_CYCLE`

这说明当前模板系统定位是：**受限宏系统**，不是通用计算模型。

代码基线：

- `packages/resolver/src/index.ts`

### 1.6 编译与运行时基线

当前编译主链已经非常完整：

`parse -> resolve -> typecheck -> run plan -> runtime preflight -> LNF -> training export -> render`

运行时目前是 workflow runtime，而不是通用 VM：

- 为 step 生成 `requiredCapabilities`
- 对 `add / quench / purge / heat / cool` 标记 `requiresConfirmation`
- 默认 capability 包括 `stirring / cooling / heating / inert_gas / vacuum / filtration / chromatography / analytical_tlc / nmr / hplc`

代码基线：

- `packages/compiler/src/index.ts`
- `packages/runtime-lab/src/index.ts`
- `packages/lnf/src/index.ts`

### 1.7 当前最明显的问题

当前最需要解决的，不是“缺函数”，而是以下三个结构问题：

1. `:::chemd` 仍靠 shape inference 决定是 molecule 还是 reaction，作者和 LLM 都不够直观。
2. `procedure` 已支持显式 step AST，但旧 prose 路径仍大量依赖 lowering。
3. 一部分归一化语义还在 renderer 层补，例如 `renderer-json` 会额外生成 `normalized_conditions` 和 `normalized_tlc`。

---

## 2. 总体设计决策

### 2.1 结论

**cheMD 不应该演进成 TypeScript 式通用编程语言。**

它应该演进成：

> **化学领域的强类型声明式语言 + 受限模板系统 + 规则检查系统 + 工作流运行时**

### 2.2 允许增加的能力

应该补强：

- 强类型对象模型
- 强类型步骤模型
- 数量与单位系统
- 交叉引用校验
- 规则诊断系统
- provenance / confidence
- 工作流运行时状态与 trace
- 纯函数式派生表达式（有限、可静态分析）

### 2.3 明确不做的能力

**不做**：

- 用户自定义通用函数定义
- 变量赋值与可变状态脚本
- 条件分支语言（if/else）作为通用控制流
- 循环（for/while）
- 递归
- 闭包
- 动态 eval
- 图灵完备执行模型

### 2.4 为什么不做图灵完备

因为 cheMD 的价值在于：

- 文档语义显式化
- 实验流程可校验
- 输出给 LLM 时结构稳定
- 编译结果可追溯、可审计、可比较

一旦引入通用脚本化能力，表达力虽然增强，但会明显削弱：

- 静态可判定性
- 规则可检查性
- 结构可视化程度
- LLM 读取时的确定性
- 审计和导出稳定性

---

## 3. 设计目标状态

目标状态不是“写程序”，而是“写一份可编译的实验语义文档”。

### 3.1 语言定位

cheMD 的目标定位应明确为：

- **文档即语义源**
- **对象 + 步骤 + 结果 + 分析 + 观察** 共同构成实验图
- **编译结果是 typed graph / step graph / run plan / LNF**
- **运行时执行的是实验工作流，不是用户脚本**

### 3.2 设计原则

1. **显式优于推断**
   能直接写成结构的，不继续依赖后处理猜。

2. **类型优于字符串**
   能结构化的字段，不停留在自由文本里。

3. **规则优于脚本**
   能通过静态规则表达的，不引入用户代码。

4. **有界优于图灵完备**
   模板、表达式、运行时都保持有界。

5. **provenance 优于黑箱归一化**
   每个派生字段都应保留来源与置信度。

6. **编译链单一真相源**
   语义只在 parser/resolver/typechecker/lnf/compiler 中定义，不在 renderer 里偷偷补。

---

## 4. 具体设计清单

下面按“必须做 / 建议做 / 不做”给出清单。

---

## 5. 语法层设计清单

### 5.1 `:::chemd` 继续保留为 canonical surface syntax

**必须做**

- [x] 保留 `:::chemd` 作为当前 canonical 表层块
- [x] 在 `:::chemd` 内增加显式字段：`kind: molecule | reaction`
- [x] parser 优先读取 `kind`
- [x] 若未写 `kind`，仍允许 fallback 到当前 shape inference
- [x] fallback 时发出 warning：`W_CHEMD_KIND_INFERRED`
- [x] 提供 auto-fix：自动插入 `kind`

**理由**

当前 `:::chemd` 已是主表层语法，直接改成别的主块会制造迁移成本；但继续完全依赖 shape inference 也会降低可读性、校验能力和 LLM 可靠性。

**建议语法**

```md
:::chemd rxn_main
kind: reaction
reactants: @a, @b
products: @p1
solvent: THF
temperature: 65 C
time: 4 h
:::
```

```md
:::chemd boronic_1
kind: molecule
smiles: B(c1ccccc1)(O)O
name: phenylboronic acid
amount: 1.2 mmol
:::
```

### 5.2 `procedure` 引入显式 step 子语法

**必须做**

- [x] `procedure` 支持嵌套 `step` 子块
- [x] `ProcedureNode` 从单一 `body` 扩展为 `children: ProcedureStepNode[] | MarkdownNode[]`
- [x] 兼容期保留 `body`
- [x] 若存在显式 `step`，typechecker 不再对该 procedure 做 NLP lowering
- [x] 仅对自由文本 procedure 使用当前 lowering 路径

**阶段性实现**

- [x] 兼容期支持行式 `step: family | id=s1 | key=value` 语法
- [x] 支持嵌套 `:::step s1` / `:::step #s1` 子块语法
- [x] 支持 `inputs / outputs / dependsOn` 结构字段
- [x] 显式 step 参数中的核心 quantity 字段进入 typechecker 归一化

**建议语法**

```md
:::procedure proc_1
ref: rxn_main
:::step s1
family: charge
inputs: @a, @b
vessel: reactor_1
:::
:::step s2
family: purge
atmosphere: nitrogen
duration: 5 min
:::
:::step s3
family: heat
temperature: 65 C
duration: 4 h
:::
:::
```

### 5.3 `observation` 可选引入显式 event 子语法

**建议做**

- [x] observation 支持显式 `event` 子块
- [x] 兼容期支持行式 `event: event_type | id=e1 | key=value` 语法
- [x] 支持嵌套 `:::event e1` / `:::event #e1` 子块语法
- [x] 若 observation 仍是 prose，则使用当前 lowering 路径
- [x] 常见事件先收敛为有限集合：`color_change / precipitation / gas_evolution / phase_change`

### 5.4 `template/use` 保留，但升级为“强类型模板”

**必须做**

- [x] 模板参数支持声明类型
- [x] use 时进行参数类型检查
- [x] 模板缺参 / 错参时给出结构化 diagnostics
- [x] 模板继续保持有界展开，不改成函数系统

**建议语法**

```md
:::template charge_pair
params:
  - reagent_a: ref<molecule>
  - reagent_b: ref<molecule>
body:
  :::step
  family: charge
  inputs: @param.reagent_a, @param.reagent_b
  :::
:::
```

---

## 6. AST / Core 设计清单

### 6.1 新增步骤与事件 AST

**必须做**

- [x] 新增 `ProcedureStepNode`
- [x] 新增 `ObservationEventAuthorNode`
- [x] 每个 step/event 都带 `id`
- [x] 每个 step/event 都带 `source span`
- [x] 每个作者提供的 step/event 都带 `authorProvided: boolean`

**建议字段**

```ts
interface ProcedureStepNode {
  type: "step";
  id?: string;
  family: StepFamily;
  params: Record<string, unknown>;
  inputs?: string[];
  outputs?: string[];
  dependsOn?: string[];
  note?: string;
  provenance?: ProvenanceInfo;
}
```

### 6.2 在 core 层加入 provenance 数据结构

**必须做**

- [x] 定义 `ProvenanceInfo`
- [x] 区分 `author | lowered | normalized | inferred`
- [x] 保存 source node id / field / span / rule id / confidence

**建议结构**

```ts
interface ProvenanceInfo {
  origin: "author" | "lowered" | "normalized" | "inferred";
  sourceNodeType?: string;
  sourceNodeId?: string;
  sourceField?: string;
  ruleId?: string;
  confidence?: number;
}
```

### 6.3 不引入通用表达式 AST 到核心对象层

**不做**

- [x] 不在 core AST 中加入通用 `IfExpression`
- [x] 不加入 `ForStatement`
- [x] 不加入 `FunctionDeclaration`
- [x] 不加入 `VariableDeclaration`

**说明**

即使后面加入“派生表达式”，也应该把它限制在字段计算层，而不是扩展成通用语句语言。

---

## 7. 类型系统设计清单

### 7.1 把 narrative 节点进一步收敛为结构节点

**必须做**

- [x] `TypedProcedureNarrativeNode` 仅作为兼容态
- [x] 新文档优先生成显式 `TypedStepNode[]`
- [x] `TypedObservationNarrativeNode` 仅作为兼容态
- [x] 显式 event 成为优先形态

### 7.2 扩展 QuantityType 使用范围

**必须做**

- [x] 对 molecule amount / equivalents 保持 typed quantity
- [x] 对 reaction temperature / time / pressure 保持 typed quantity
- [x] 对 step params 中的 `temperature / duration / pressure / volume / mass / amount` 统一做 typed quantity
- [x] 所有 quantity 都记录 `sourceNodeId + sourceField`

### 7.3 补全领域枚举与受限字符串

**必须做**

- [x] `status` 改成受限枚举
- [x] `analysisType` 改成受限枚举 + 允许扩展字符串
- [x] `atmosphere` 改成受限枚举
- [x] `step.family` 完全走 `StepFamily`
- [x] `eventType` 完全走 `ObservationEventType`

### 7.4 增加 typed reference 层

**必须做**

- [x] 区分 `ref<molecule>` / `ref<reaction>` / `ref<result>` / `ref<analysis>` / `ref<sample>`
- [x] 显式 step `inputs` 解析为 `{ raw, reference }` typed reference
- [x] 显式 step `inputs` 引用不存在或目标类型不匹配时发出 `E_TYPED_REFERENCE_MISMATCH`
- [x] 步骤参数里凡是对象引用都必须类型化
- [x] `inputs`、`outputs`、`ref` 等不得再长期保留为自由字符串数组

### 7.5 增加 step-level type rules

**必须做**

- [x] `heat` 必须允许 `temperature` 或 `duration` 至少一个
- [x] `cool` 必须允许 `temperature` 或 `method` 至少一个
- [x] `purge` 需要 `atmosphere` 或默认 `nitrogen`
- [x] `analyze` 需要 `analysisType`
- [x] `extract` 建议有 `solvent`
- [x] `filter` 可无参数，但应允许 `medium / wash`

---

## 8. 规则与检查系统设计清单

### 8.1 交叉引用规则

**必须做**

- [x] reaction 的 `reactants/products` 引用必须存在
- [x] result 若声明对应 product，必须落在该 reaction products 范围内
- [x] analysis.ref 必须指向已存在对象
- [x] sample/ref/result/analysis 间的交叉关系必须可闭合

### 8.2 一致性规则

**必须做**

- [x] result.yield / isolatedMass / purity 类型必须正确
- [x] reaction 与 result 的核心指标不能明显冲突
- [x] primary aliases 必须指向存在对象
- [x] template 参数类型必须匹配

### 8.3 过程规则

**必须做**

- [x] `dependsOn` 不允许形成环
- [x] step id 必须唯一
- [x] step family 与参数集应匹配
- [x] observation linked step 若存在，应可在 stepGraph 中定位

### 8.4 诊断体系

**必须做**

- [x] diagnostics 按 layer 分层：`parser / resolver / typechecker / lowering / runtime_preflight / export`
- [x] diagnostics 带 `sourceNodeType / sourceNodeId / sourceField`
- [x] diagnostics 可提供 quick fix 元数据；Web 当前可执行 `insert_chemd_kind`

**建议新增诊断**

- [x] `W_CHEMD_KIND_INFERRED`
- [x] `W_PROCEDURE_PROSE_LOWERED`
- [x] `W_OBSERVATION_PROSE_LOWERED`
- [x] `E_STEP_PARAM_MISSING`
- [x] `E_STEP_PARAM_INVALID`
- [x] `E_STEP_DEPENDENCY_CYCLE`
- [x] `E_TYPED_REFERENCE_MISMATCH`

---

## 9. 模板 / “函数” 设计清单

这个部分最容易误入“通用语言化”。这里要明确边界。

### 9.1 继续保留模板，但它是“宏”，不是函数

**必须做**

- [x] `template/use` 继续保留
- [x] 模板展开仍走 resolver
- [x] 继续保留展开深度和节点上限
- [x] 保留模板循环检测

### 9.2 可以增加“纯派生表达式”，但仅限字段计算

**建议做**

- [x] 引入一个极小表达式子语言，仅用于字段派生
- [x] 仅允许纯计算，不允许副作用
- [x] 仅允许静态可判定的白名单函数

**允许的表达式能力**

- [x] 数字字面量
- [x] 数量字面量
- [x] 引用字段，如 `@rxn_main.temperature`
- [x] 四则运算
- [x] 单位归一
- [x] 比例、百分比、理论收率等派生计算
- [x] `coalesce()` 这类简单纯函数

**不允许的表达式能力**

- [x] 用户自定义函数
- [x] 递归调用
- [x] 任意函数调用
- [x] 可变赋值
- [x] if/else 语句级控制流
- [x] 循环

### 9.3 建议的内建函数白名单

**建议做**

- [x] `to_unit(quantity, unit)`
- [x] `percent(numerator, denominator)`
- [x] `ratio(a, b)`
- [x] `sum(...)`
- [x] `coalesce(...)`
- [x] `theoretical_yield(...)`

### 9.4 不做用户自定义函数

**明确不做**

- [x] 不加 `function foo(x) {}`
- [x] 不加 lambda
- [x] 不加 closure
- [x] 不加 higher-order function

**原因**

这会把 cheMD 推向“可编程语言”，而不是“可校验实验 DSL”。

---

## 10. 运行时设计清单

### 10.1 保持 runtime-lab 的定位：工作流运行时

**必须做**

- [x] runtime 只消费 canonical stepGraph
- [x] runtime 不解释用户脚本
- [x] runPlan 的输入保持为 typedGraph + stepGraph
- [x] preflight 继续基于 capability 检查

### 10.2 扩展 runtime step 状态机

**必须做**

- [x] step status 增加：`planned / ready / waiting_confirmation / running / completed / failed / skipped`
- [x] `requiresConfirmation` 与状态机联动
- [x] 支持 `dependsOn` 触发 ready
- [x] 保留 dry-run / human-run / robot-run / replay-run 模式

### 10.3 增加 runtime trace

**必须做**

- [x] 记录 step start/end time
- [x] 记录 operator action
- [x] 记录 generated artifacts
- [x] 记录 observations during execution
- [x] 记录 runtime diagnostics

### 10.4 preflight 继续受控，不允许任意执行

**必须做**

- [x] capability 检查继续保留
- [x] 高风险步骤必须人工确认
- [x] 运行时只能执行已知 step family
- [x] 未知 step family 不得进入 robot-run

---

## 11. LLM 友好设计清单

### 11.1 输出结构统一到 typed graph / step graph / LNF

**必须做**

- [x] LLM 主要消费 typedGraph / stepGraph / LNF
- [x] procedure 的显式步骤应直接输出，不再只给 narrative
- [x] 每个 step 带 source + provenance + confidence
- [x] observation event 带 normalized value 与 linked step

### 11.2 JSON renderer 不再承担语义增强职责

**必须做**

- [x] `normalized_conditions`
- [x] `normalized_tlc`
- [x] 其他派生语义

这些语义必须前移到：

- typechecker
- rule engine
- lnf builder

renderer 只做序列化，不做语义发明。

### 11.3 LNF 升级方向

**必须做**

- [x] 收敛为唯一 `chemd-lnf/v0.5` canonical LNF
- [x] 增加 explicit step provenance
- [x] 增加 event provenance
- [x] 增加 typed references
- [x] 增加 runtime summary / trace summary
- [x] 主输出收敛为 `chemd-lnf/v0.5` canonical LNF，融合 compact entity view 与 typed/workflow/runtime/migration view；旧版本 builder 已删除

---

## 12. 迁移设计清单

### 12.1 对现有 `:::chemd` 文档保持兼容

**必须做**

- [x] 未写 `kind:` 的 `:::chemd` 仍可解析
- [x] 继续支持当前 reaction-shape inference
- [x] 发 warning，而不是直接报错
- [x] Web/CLI 提供 auto-fix

### 12.2 对现有 prose procedure 保持兼容

**必须做**

- [x] 原有 `body` 仍可编译
- [x] lowering 继续可用
- [x] 输出显式提示建议迁移到 `step`
- [x] W805 保留

### 12.3 渐进式迁移策略

**建议路线**

- 第 1 阶段：支持 `kind` 和显式 `step`
- 第 2 阶段：让 Web 默认插入 `kind` 和 `step`
- 第 3 阶段：对老写法给强提示，但不破坏兼容
- 第 4 阶段：JSON/LNF 优先输出新结构

---

## 13. 包级落地映射清单

### `@chemd/core`

- [x] 新增 `ProcedureStepNode`
- [x] 新增 observation event author node
- [x] 新增 provenance 类型
- [x] 给 node 增加 source span 支持

### `@chemd/parser`

- [x] `chemd` 支持 `kind`
- [x] `procedure` 支持 nested `step`
- [x] `observation` 可选 nested `event`
- [x] 新增相关 diagnostics

### `@chemd/resolver`

- [x] 模板参数类型检查
- [x] typed reference 解析
- [x] 保留模板展开上限和循环检查

### `@chemd/typechecker`

- [x] 新增显式 step typecheck
- [x] narrative 兼容态与显式 step 并存
- [x] 扩大量纲与 step param type rules
- [x] explicit step `inputs` typed reference v1
- [x] 输出 provenance-aware typed graph

### `@chemd/step-ontology`

- [x] 从“主路径”降为“兼容路径”
- [x] 只服务 prose import / OCR import / 旧文档
- [x] 补 rule ids 与 provenance tags

### `@chemd/runtime-lab`

- [x] runtime step 状态机
- [x] dependsOn 调度
- [x] trace 记录
- [x] 高风险确认机制结构化

### `@chemd/lnf`

- [x] schema 升级
- [x] step/event provenance
- [x] typed refs
- [x] runtime summary

### `@chemd/compiler`

- [x] 保持单一编译总线
- [x] 新结构全部经过 compileChemd 主链输出
- [x] 不在 renderer 里新增语义

### `@chemd/renderer-json`

- [x] 去语义增强化
- [x] 仅做结构序列化

### `apps/web`

- [x] 默认创建 `kind:`
- [x] 默认创建结构化 `step`
- [x] 提供 migrate / auto-fix
- [x] diagnostics 面板支持 quick fix

---

## 14. 优先级路线图

### P0：先修正“显式性”

- [x] `chemd.kind`
- [x] 显式 `step`
- [x] 基本 diagnostics

### P1：再修正“强类型”

- [x] step params typed quantity
- [x] explicit step `inputs` typed refs v1
- [x] typed refs
- [x] rule engine v1
- [x] provenance v1

### P2：再修正“输出一致性”

- [x] JSON 去语义化
- [x] LNF 升级
- [x] compile 总线统一

### P3：最后增强“运行时”

- [x] runtime step status
- [x] trace
- [x] human-run / robot-run 控制边界

---

## 15. 验收标准

### 15.1 语言层验收

- [x] 新文档默认都带 `kind`
- [x] 新 procedure 默认都写显式 `step`
- [x] 不再依赖 shape inference 作为主路径

### 15.2 类型层验收

- [x] 核心 step 参数全部类型化
- [x] 关键 quantity 全部归一化
- [x] typed refs 可静态检查

### 15.3 规则层验收

- [x] reaction/result/analysis/sample 交叉关系可检查
- [x] diagnostics 能定位到 source node / field
- [x] quick fix 元数据覆盖常见错误；当前可执行写回覆盖 `insert_chemd_kind`

### 15.4 运行时验收

- [x] runPlan 仅由 typedGraph + stepGraph 生成
- [x] preflight 对 capability 缺失给结构化错误
- [x] 高风险步骤需要确认
- [x] trace 可回放 step 执行历史

### 15.5 LLM 验收

- [x] 从 LNF/JSON 直接恢复对象图与步骤图
- [x] 每个派生 step 都有 provenance
- [x] 旧 prose 文档与新结构文档都能被统一消费

---

## 16. 最终结论

### 应该强化的能力

- 强类型
- 强检查
- 规则系统
- 结构化步骤
- provenance / confidence
- 工作流运行时
- 对 LLM 友好的图结构输出

### 应该有限引入的能力

- 类型化模板
- 纯函数式字段派生表达式
- 受控 runtime state machine

### 坚决不引入的能力

- 通用函数定义
- 变量和赋值
- 循环与递归
- 图灵完备性
- 通用脚本 VM

> cheMD 的正确演进方向不是“像 TypeScript 一样能编程”，而是“像一门优秀的化学领域 DSL 一样，能表达、能检查、能导出、能执行、能被 LLM 稳定理解”。
