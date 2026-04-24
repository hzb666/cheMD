# chemd-lang v0.3：步骤本体实现文档（表层语法冻结版）

副标题：不改变现有 `procedure` / `analysis` / `observation` 写法，把它们 lowering 成统一步骤语义层
状态：修订版（实现级）
适用范围：`packages/step-ontology`、`packages/hir`、`packages/mir`、`packages/runtime-lab`、`packages/validator-procedure`、`packages/lnf`

---

## 0. 文档定位

这份修订版把步骤本体重新定位为：

> **从现有 chemd 文档中抽取出来的内部操作语义层，而不是要求作者直接书写的一套新 step 语法。**

也就是说：

- 作者继续写 `procedure` 的自然语言和编号列表。
- `analysis` 继续写当前 block 字段。
- `observation` 继续写自然语言。
- step ontology 负责把这些内容转成统一操作本体。

---

## 1. 核心判断

### 1.1 Step ontology 的边界

它不是：

- 实验者日常书写语法
- 一部 SOP 手册
- 一个通用化学知识图谱

它是：

- lowering 目标
- validator 共享的操作字典
- runtime 共享的执行指令集
- LNF / training export 共享的 canonical step view

### 1.2 为什么必须做这层

如果 `procedure` 永远只是 prose：

- 无法稳定比较步骤
- 无法做 step diff
- 无法做 runtime plan
- 无法教模型理解实验逻辑

而如果直接让作者写 step DSL：

- 写作门槛太高
- 与当前代码库语法冲突
- 不符合当前 `v0.1` 产品形态

所以最佳路线是：

**保留 prose，内部 lower 到 step ontology。**

---

## 2. 输入边界：只从当前文档语法来

### 2.1 主要输入来源

- `procedure` block 正文
- `procedure` 中的编号列表 / 项目符号
- `reaction` / `result` / `analysis` / `sample` 字段
- Markdown 正文中的 stage 描述
- `observation` prose
- `template/use` 展开后的内容

### 2.2 输入不包含新作者 DSL

本版不假设存在：

```text
step heat(...)
step quench(...)
```

如果未来 UI 内部用这种形式展示，那也只是 inspect 视图，不是作者输入合同。

---

## 3. Step 本体的分层模型

推荐四层：

```text
Surface Narrative
  -> Lowered Step Candidate
  -> Canonical Step Node
  -> Runtime Step Contract
```

### 3.1 Surface Narrative

例如：

```md
1. 氮气置换 15 min。
2. 加入 Pd2(dba)3 和 XPhos。
```

### 3.2 Lowered Step Candidate

初步识别：

- `purge(nitrogen, 15 min)`
- `add([Pd2(dba)3, XPhos])`

### 3.3 Canonical Step Node

对歧义做裁决，补充标准参数名、effect、resource。

### 3.4 Runtime Step Contract

只保留执行所需字段，供 planner / runtime 使用。

---

## 4. 核心类型

```ts
interface CanonicalStepNode {
  stepId: string;
  family: StepFamily;
  params: Record<string, unknown>;
  inputs?: StepEntityRef[];
  outputs?: StepArtifactHint[];
  effects?: StepEffect[];
  source: StepSourceInfo;
  loweringConfidence: number;
}
```

```ts
type StepFamily =
  | "charge"
  | "add"
  | "transfer"
  | "mix"
  | "cool"
  | "heat"
  | "hold"
  | "purge"
  | "quench"
  | "extract"
  | "wash"
  | "separate_layers"
  | "filter"
  | "dry"
  | "concentrate"
  | "purify"
  | "sample"
  | "analyze"
  | "observe"
  | "store";
```

---

## 5. Primitive、Composite、Analysis、Control 的边界

### 5.1 Primitive

最小可执行或可比较动作，例如：

- add
- heat
- hold
- filter
- extract
- sample

### 5.2 Composite

来自高层文本但最终会拆开的动作，例如：

- standard workup
- chromatography purification
- inert setup

### 5.3 Analysis

分析步骤来自 `analysis` block 或 `procedure` 中的分析动作，例如：

- TLC
- NMR
- HPLC

### 5.4 Control

控制节点通常是内部语义，不要求作者手写，例如：

- checkpoint
- repeat suggestion
- decision note

---

## 6. 首批 canonical families

### 6.1 物料进入类

- `charge`
- `add`
- `transfer`

裁决原则：

- 初始装料优先 `charge`
- 已运行过程中再加入优先 `add`
- 两容器之间转移优先 `transfer`

### 6.2 环境与过程控制类

- `mix`
- `cool`
- `heat`
- `hold`
- `purge`

### 6.3 后处理类

- `quench`
- `extract`
- `wash`
- `separate_layers`
- `filter`
- `dry`
- `concentrate`
- `purify`

### 6.4 分析与观测类

- `sample`
- `analyze`
- `observe`

---

## 7. 关键歧义操作的语义裁决

### 7.1 `charge` vs `add`

源文档：

```md
将底物、碱和溶剂加入反应瓶。
```

若这是 procedure 第一条且目标容器是主反应器，裁决为 `charge`。

源文档：

```md
加入 Pd2(dba)3 和 XPhos。
```

若发生在反应过程已开始后，裁决为 `add`。

### 7.2 `heat` vs `hold`

```md
加热到 100 °C 反应 16 h。
```

可 lower 为：

- `heat(target=100 °C)`
- `hold(duration=16 h, temperature=100 °C)`

也可在 LNF 中保留组合表达，但 canonical step graph 应拆开。

### 7.3 `quench` vs `add`

```md
加入饱和 NH4Cl 淬灭。
```

不能简单记成 `add`，应识别为 `quench`。

### 7.4 `filter` vs `separate_layers`

```md
分液，取有机层。
```

裁决为 `separate_layers`，而不是 `filter`。

---

## 8. Lowering 规则：从 prose 和列表抽 step

### 8.1 最优输入形态

虽然不改语法，但强烈推荐作者在 `procedure` 中使用编号列表，因为更利于 lowering。

### 8.2 句式规则示例

#### 中文

- “冷却至 0 °C” -> `cool`
- “缓慢滴加 n-BuLi” -> `add(mode=dropwise)`
- “保温 20 min” -> `hold`
- “加入水淬灭” -> `quench`
- “EA 萃取” -> `extract`
- “Na2SO4 干燥” -> `dry`
- “旋干” -> `concentrate`

#### 英文

- “cooled to 0 °C” -> `cool`
- “added dropwise” -> `add(mode=dropwise)`
- “stirred for 2 h” -> `hold`
- “quenched with water” -> `quench`
- “extracted with EtOAc” -> `extract`

### 8.3 低置信度处理

当文本过于模糊时：

- 保留 raw sentence
- 输出低置信度 step candidate
- 触发 warning，而不是强造精确 step

---

## 9. Artifact 语义与状态增量

### 9.1 artifact 类型

- reaction mixture
- organic layer
- aqueous layer
- filtrate
- solid residue
- crude product
- purified fraction
- analytical sample

### 9.2 典型状态增量

- `extract` 可能产生双层体系 artifact
- `filter` 可能产生 filtrate + cake
- `sample` 产生 analysis sample
- `purify` 产生 purified fraction

### 9.3 原则

artifact 语义属于内部模型，不要求作者在表层写出来。

---

## 10. Resource、Capability 与 Effect

### 10.1 effect 示例

- uses_inert_atmosphere
- changes_temperature
- creates_biphasic_system
- requires_purification
- creates_sample_for_analysis

### 10.2 capability 示例

- cooling
- inert_gas
- filtration
- chromatography
- analytical_tlc

这些都由 step ontology registry 提供，不通过新语法暴露给作者。

---

## 11. Observation hook

### 11.1 observation 不等于 step

`observation` 仍是叙述性记录，但 ontology 需要把它和 step 挂接起来。

### 11.2 示例

```md
:::observation #obs-1
加入 n-BuLi 后体系变深红色。
:::
```

lowering：

```yaml
observation:
  event_type: color_change
  stage_hint: after_add_nBuLi
  linked_step_family: add
  value: deep_red
```

---

## 12. Analysis 节点与 step 的衔接

### 12.1 来源

分析既可能来自：

- `analysis` block
- `procedure` 中的“取样做 TLC”
- runtime 追加的分析动作

### 12.2 canonical 形式

推荐拆成：

- `sample`
- `analyze(type=TLC)`

而不是把整个句子作为一条不可分操作。

---

## 13. Composite macro 与模板

### 13.1 不新增作者宏语法

复用仍然通过 `template/use`。

### 13.2 composite 的来源

- template 展开后的多个 primitive steps
- 高层短语如 “按标准后处理”
- SOP 库条目

### 13.3 原则

composite 只是内部展开层，不改变作者侧模板语法。

---

## 14. LNF 与 training export 的 canonical form

### 14.1 对 LLM 的价值

step ontology 让模型看到的是：

- 稳定动作名
- 稳定参数名
- 稳定顺序
- 稳定 artifact / observation 钩子

### 14.2 示例

源文档：

```md
:::procedure #proc-1
1. 加水淬灭。
2. EA 萃取三次。
3. Na2SO4 干燥。
4. 旋干。
:::
```

LNF：

```yaml
procedure:
  - quench(agent=water)
  - extract(solvent=EtOAc, repeats=3)
  - dry(agent=Na2SO4)
  - concentrate(method=rotavap)
```

---

## 15. 与 validator、runtime、type system 的衔接

### 15.1 type system

给 step 参数与 effect 加类型。

### 15.2 validator

检查：

- 步骤缺失
- 顺序可疑
- 工作后处理不完整
- 分析动作与结果脱节

### 15.3 runtime

把 canonical step 变成 `RunPlan`。

---

## 16. 推荐包结构与 API

```text
packages/
  step-ontology/
    src/
      registry/
      lowering/
      ambiguity/
      patterns/
      artifacts/
      effects/
```

推荐 API：

```ts
export function lowerProcedureToSteps(input: ProcedureLoweringInput): ProcedureLoweringResult;
export function canonicalizeStepCandidate(candidate: StepCandidate): CanonicalStepNode;
```

---

## 17. 测试策略

### 17.1 样本类别

1. 中文编号 procedure
2. 英文方法段
3. observation prose
4. analysis block
5. template 展开 procedure
6. 歧义 case：charge/add, heat/hold, quench/add

### 17.2 核验项

- lowering 是否稳定
- 歧义裁决是否一致
- 是否保留 raw sentence
- 是否不依赖新表层语法

---

## 18. 建议的落地顺序

### Phase 1
- 定义 step families
- 实现 procedure lowering

### Phase 2
- 实现 ambiguity resolver
- 实现 observation / analysis 衔接

### Phase 3
- 接 validator / runtime / LNF / training export

---

## 19. 最终实现结论

本修订版对步骤本体的最终定义是：

> **在不改变现有 `procedure` / `analysis` / `observation` 写法的前提下，把它们 lowering 成稳定、可比较、可执行的 canonical step 语义层。**

也就是说，作者继续写文档，系统负责把文档背后的实验动作读出来。

---
