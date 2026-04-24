# cheMD 低心智生产级 DSL 设计草案

> 核心原则：**用户写简单 Markdown，后台承担 DSL 的严格性。**
>
> cheMD 仍然要成为生产级 DSL，但生产级能力应主要体现在后台：
>
> - 稳定解析
> - 自动结构化
> - 强类型校验
> - 稳定内部 ID
> - 可追溯 provenance
> - canonical LNF
> - runtime plan
> - training export
>
> 普通用户不应被要求理解 `typedGraph`、`stepGraph`、LNF、runtime state machine 或内部 schema。

---

## 0. 当前对齐状态（2026-04-20）

当前路线已经从“Git/PR 协作工具链”收缩为“实验记录结构化 DSL + 本地分析工具”。

本阶段明确不做：

- GitHub PR bot
- PR summary
- semantic merge driver
- 协作分支或远程平台流程

当前已落地的关键基础：

- `compileChemd()` 统一输出 `document / diagnostics / typedSemanticGraph / stepGraph / runPlan / runtimePreflight / lnf / ragExport / trainingUnderstanding / trainingExport`。
- `trainingExport` 已包含 source layer、semantic layer、learning layer、quality layer。
- `semantic_layer.links` 已能表达 reaction/result/analysis/sample/markdown 之间的基本事实关系。
- `retrieval_chunks` 已覆盖 markdown、reaction、result、analysis、sample、document summary。
- `trainingUnderstanding.experiment_logic` 已补充内部派生的 design contexts 与 outcome quality，用于实验决策训练；这些信息来自现有 reaction/result/analysis/sample 关系，不要求用户新增 Chemd 书写语法。
- `prediction_instances` 已扩展反应条件、participants、计数、当量汇总、target source 与 evidence links，并避免把 result 文本当作预测输入特征。
- 当前导出边界拆分为：
  - `ragExport`：面向检索，只包含 retrieval chunks、检索 metadata 和 RAG quality。
  - `trainingUnderstanding`：面向大模型实验理解训练母数据，包含干净实体、引用、关系、procedure/observation logic、experiment logic、design contexts、outcome quality、完整训练用 knowledge graph、字段级 evidence、归一化边、缺失逻辑、LoRA generation hints 和 training quality；不包含审计信息、布局/render 信息、raw AST、source layer 或 full LNF。
  - `trainingExport`：保留为 full audit export，用于调试、追溯和重新投影，不直接喂给 RAG 或 LoRA/SFT。

因此，短期不需要另建 `llm-context` 解析管线。若后续需要 LoRA/SFT JSONL，应从 `trainingUnderstanding` 生成任务化样本；RAG 索引应从 `ragExport` 建立。LoRA 生成器应优先读取 `lora_generation_hints`，并用 `knowledge_graph.nodes`、`knowledge_graph.edges`、`knowledge_graph.field_evidence` 与 `knowledge_graph.missing_logic` 控制正样本、证据链样本、归一化解释样本和一致性检查样本。

仍需补充但暂不急于一次性实现：

1. `trial` / `variant`：当前先由内部 design contexts 派生同一文档内的 baseline / variant / single-run 关系；后续如确需跨文档实验序列，再补不增加日常书写负担的最小表达。
2. sample lineage：把 `sample.ref` 扩展成更明确的来源语义，例如 derived_from、aliquot_of、batch_of。
3. artifact/evidence：把谱图、图片、仪器文件、notebook 输出从 `analysis.data` 的字符串升级为一等公民。
4. field-level source map：让每个导出事实能追溯到源文档字段级位置。
5. local semantic diff：比较两版实验记录中的事实变化，不绑定 GitHub。

---

## 1. 目标

cheMD 的目标不是让用户写一门像 TypeScript 的语言。

更合适的目标是：

> **用户写人能读懂的实验记录；后台把它编译成生产级化学 DSL。**

因此，cheMD 需要同时满足两类要求：

1. 用户侧足够简单
2. 后台侧足够严格

这两者不是冲突关系。用户侧越简单，后台 canonicalization、resolver、typechecker、diagnostics 和 training export 越重要。

---

## 2. 分层模型

推荐把 cheMD 明确拆成四层。

```text
用户 Markdown
  ↓
后台理解层
  ↓
canonical cheMD DSL
  ↓
typedGraph / stepGraph / runtime / LNF / training export
```

### 2.1 用户 Markdown

用户 Markdown 面向普通实验人员。

它应该具备以下特点：

- 可以自然书写
- 字段少
- 不强制手写 ID
- 不强制手写 `:::step`
- 不强制理解 schema version
- 不要求知道后台图结构
- 可以混合中文、英文、表格和自然语言

示例：

```md
# 乙醇氧化实验

反应：乙醇和氧气生成乙酸。
条件：铜催化，空气，80 C，4 h。

步骤：
加热 4 小时。

观察：
反应液变黄。

结果：
目标产物收率 63%。
```

### 2.2 后台理解层

后台理解层负责把用户 Markdown 转成候选语义结构。

它需要做：

- 识别实验标题和小节
- 识别 reaction、molecule、result、analysis、sample
- 识别 procedure prose
- 识别 observation prose
- 识别 TLC 表格或自然描述
- 生成内部 stable ID
- 建立 alias 表
- 解析自然引用
- 推断字段类型
- 归一单位和条件
- 标记不确定性
- 生成用户可理解的诊断和修复建议

这一层可以使用规则、词典、化学服务、LLM、OCR、vision 或人工确认。

### 2.3 canonical cheMD DSL

canonical cheMD DSL 是后台内部结构。

它可以非常严格，但不直接暴露给普通用户。

它应该包含：

- 明确实体类型
- 稳定内部 ID
- typed references
- normalized quantities
- canonical procedure steps
- canonical observation events
- structured TLC graph
- provenance
- confidence
- source span
- diagnostics

它可以等价于当前 `:::chemd + kind`、explicit `step/event`、typedGraph、stepGraph、LNF 的内部组合。

### 2.4 下游结构层

下游结构层服务系统能力。

它包括：

- typedGraph
- stepGraph
- runtime plan
- runtime preflight
- runtime trace
- canonical LNF
- training export
- retrieval chunks
- prediction instances
- SFT / DPO / reranker 数据集

这些是生产级 DSL 的价值所在，但不应该成为普通用户的写作负担。

---

## 3. 用户侧语法原则

### 3.1 少写结构，多写语义

用户不必写：

```md
:::chemd #rxn-main
kind: reaction
reac: CCO | O=O
prod: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
:::
```

用户可以写：

```md
反应：乙醇和氧气生成乙酸。
条件：铜催化，空气，80 C，4 h。
```

后台再生成：

```ts
{
  kind: "reaction",
  stableId: "rxn:ethanol-oxidation:8f31",
  reactants: ["mol:ethanol:91aa", "mol:oxygen:12bd"],
  products: ["mol:acetic-acid:77c2"],
  conditions: {
    catalyst: "Cu catalyst",
    atmosphere: "air",
    temperature: "80 C",
    time: "4 h"
  }
}
```

### 3.2 允许轻量标签，不要求工程 ID

当文档里有多个反应时，用户可以用自然标签。

推荐：

```md
反应 A：乙醇氧化为乙酸。
结果 A：收率 63%。

反应 B：甲醇氧化为甲酸。
结果 B：收率 51%。
```

也推荐：

```md
乙醇氧化：
产物乙酸，收率 63%。

甲醇氧化：
产物甲酸，收率 51%。
```

不推荐让普通用户写：

```md
@rxn-main
#res-main
ref: rxn-main
```

这些可以作为高级模式或后台 canonical form。

### 3.3 用户 Markdown 可以有歧义

用户文档允许出现歧义。

系统的职责不是禁止歧义，而是：

1. 尽量自动消解
2. 消解不了时给出清晰提示
3. 让用户用最少操作确认
4. 把确认结果写入后台 entity map

示例：

```md
两个反应都生成目标产物。
结果：收率 63%。
```

用户提示：

```text
这个结果可能属于两个反应。
请选择它对应的反应：

1. 乙醇氧化
2. 甲醇氧化
```

用户选择后，后台保存映射。Markdown 仍然可以保持简单。

---

## 4. 稳定 ID 与来回引用

### 4.1 用户可以不写 ID，系统不能没有 ID

生产级 DSL 必须有稳定 ID。

但稳定 ID 应由后台生成和维护。

内部 ID 可由以下信息组合生成：

- 实体类型
- 标题或小节名
- 规范化实体名称
- 反应参与物
- 产物
- source span
- 内容 fingerprint
- 用户确认记录

示例：

```ts
{
  stableId: "rxn:ethanol-oxidation:8f31",
  kind: "reaction",
  sourceFingerprint: "sha256:...",
  aliases: ["乙醇氧化", "反应 A", "该反应"],
  lastSourceSpan: {
    startLine: 3,
    endLine: 5
  }
}
```

### 4.2 引用依靠 alias、上下文和确认

后台 resolver 应按优先级解析引用：

1. 明确自然标签，例如 `反应 A`
2. 小节标题，例如 `乙醇氧化`
3. 化学实体名称，例如 `乙酸`
4. 当前上下文，例如最近 reaction
5. 文档结构，例如同一小节
6. 内容 fingerprint
7. 用户确认记录

解析结果必须有 confidence。

低 confidence 时不应静默通过。

### 4.3 使用 sidecar entity map 保持稳定

为了让 Markdown 来回编辑后仍稳定识别，建议保留 sidecar map。

它可以存储在数据库、本地缓存或文档旁路文件中。

示例：

```json
{
  "docId": "exp-001",
  "entities": [
    {
      "stableId": "rxn:ethanol-oxidation:8f31",
      "kind": "reaction",
      "aliases": ["乙醇氧化", "反应 A", "该反应"],
      "sourceFingerprint": "sha256:...",
      "lastSourceSpan": {
        "startLine": 3,
        "endLine": 5
      }
    }
  ],
  "confirmedLinks": [
    {
      "from": "res:yield-63:ab12",
      "to": "rxn:ethanol-oxidation:8f31",
      "reason": "user_confirmed"
    }
  ]
}
```

这让用户无需手写 ID，同时让后台拥有稳定引用。

---

## 5. Procedure 设计

### 5.1 用户主路径：自然语言步骤

用户写：

```md
步骤：
将乙醇和催化剂加入反应瓶。
通空气，加热到 80 C。
反应 4 小时后取样 TLC。
```

后台生成：

```ts
[
  {
    family: "charge",
    params: { materials: ["ethanol", "catalyst"] }
  },
  {
    family: "heat",
    params: { temperature: "80 C" }
  },
  {
    family: "hold",
    params: { duration: "4 h" }
  },
  {
    family: "analyze",
    params: { analysisType: "tlc" }
  }
]
```

### 5.2 高级路径：显式 step

显式 step 仍然有价值，但应定位为高级模式、导入模式或调试模式。

适用场景：

- 自动化实验
- 机器人执行
- 高风险步骤审核
- 流程模板库
- 测试 fixture
- LNF golden case

普通用户不应被要求写：

```md
:::step heat-main
family: heat
temperature: 80 C
duration: 4 h
:::
```

---

## 6. Observation 设计

### 6.1 用户主路径：自然观察记录

用户写：

```md
观察：
加入催化剂后溶液逐渐变黄。
加热 2 小时后出现少量沉淀。
```

后台生成：

```ts
[
  {
    eventType: "color_change",
    normalizedValue: "yellow",
    linkedStepFamily: "add"
  },
  {
    eventType: "precipitation",
    linkedStepFamily: "heat"
  }
]
```

### 6.2 不确定时提示确认

如果系统无法判断观察属于哪个步骤，应提示：

```text
“出现少量沉淀”可能发生在加热步骤之后。
是否关联到“加热 2 小时”？
```

用户确认后，后台更新 entity map 或 trace。

---

## 7. TLC 设计

### 7.1 TLC 用户主写法

TLC 应该像实验记录，而不是绘图指令。

推荐：

```md
TLC: PE/EA = 4:1, UV 254 nm

SM: Rf 0.82 strong
Product: Rf 0.60 medium
Reaction mixture: Rf 0.82 weak, Rf 0.60 strong
```

中文推荐：

```md
TLC：PE/EA = 4:1，UV 254 nm

原料：Rf 0.82，强
产物：Rf 0.60，中等
反应液：Rf 0.82 弱，Rf 0.60 强
```

表格也应支持：

```md
| Lane | Sample | Spots |
|---|---|---|
| SM | starting material | Rf 0.82 strong; Rf 0.46 weak |
| Product | product | Rf 0.60 medium |
| Reaction | reaction mixture | Rf 0.82 weak; Rf 0.60 strong |
```

### 7.2 后台 TLC canonical graph

后台生成结构：

```ts
{
  analysisType: "tlc",
  eluent: "PE/EA = 4:1",
  visualization: "UV 254 nm",
  lanes: [
    {
      label: "SM",
      role: "starting_material",
      spots: [
        { rf: 0.82, intensity: "strong" },
        { rf: 0.46, intensity: "weak" }
      ]
    },
    {
      label: "Product",
      role: "product",
      spots: [
        { rf: 0.60, intensity: "medium" }
      ]
    }
  ]
}
```

### 7.3 内部 TLC 语法仍可保留

当前类似 `p1/p2` 的写法适合内部 fixture 和精确渲染调试。

示例：

```md
p1: sm 0.82 ^1(1) | 0.64 ^2(2)
p2: pd 0.80 1(1) | 0.60 2(2)
```

但它不应该是普通用户的默认写法。

更合理的定位是：

- canonical export
- renderer golden test
- TLC 可视化回放
- 高级用户精确控制
- OCR/vision 结果的中间格式

### 7.4 TLC 解析要求

后台 TLC parser 应支持：

- `TLC:` 小节
- `Eluent`
- `Plate`
- `Visualization`
- Markdown 表格
- `Rf 0.82`
- `Rf=0.82`
- `0.82 strong`
- 中文强度：强、中、弱
- 拖尾、杂点、基线
- SM / starting material / 原料
- product / 产物
- reaction mixture / 反应液
- 自动关联当前 reaction

解析失败时必须保留原文，不能丢信息。

---

## 8. 诊断与修复

### 8.1 诊断应分为内部诊断和用户诊断

内部诊断可以保留：

```text
E_TYPED_REFERENCE_MISMATCH
E_STEP_PARAM_MISSING
W_PROCEDURE_PROSE_LOWERED
```

用户诊断应转成人话：

```text
这里的结果没有明确对应哪个反应。
这里的温度单位无法识别。
这段步骤我解析成了“加热”，请确认是否正确。
```

### 8.2 quick fix 是低心智用户体验的核心

如果用户侧 Markdown 足够简单，quick fix 必须变强。

优先级：

1. 自动识别 reaction / molecule / result / analysis
2. 自动补内部 kind
3. 自动生成 stable ID
4. 自动拆 procedure step
5. 自动识别 observation event
6. 自动解析 TLC
7. 自动归一单位
8. 自动关联 result 到 reaction
9. 自动提示歧义选择
10. 自动迁移 legacy/internal syntax

quick fix 不只是 UI 功能，也是训练数据来源。

---

## 9. 生产级 DSL 的后台要求

即使用户写得简单，后台 DSL 也必须严格。

### 9.1 schema 要稳定

后台 canonical schema 必须版本化。

需要稳定的结构包括：

- entity schema
- reference schema
- quantity schema
- step schema
- observation event schema
- TLC schema
- diagnostics schema
- LNF schema
- training export schema

### 9.2 类型要严格

后台应校验：

- 数量和单位
- 百分比范围
- reaction/result/analysis/sample 关系
- molecule/reaction 引用类型
- step family 参数
- step dependency
- observation linked step
- TLC Rf 范围
- TLC lane/spot 合法性
- result 是否泄漏到 prediction features

### 9.3 provenance 要完整

每个后台派生值都应能回答：

- 来自哪段用户文本
- 来自哪个规则或模型
- 置信度是多少
- 是否用户确认过
- 是否经过归一化
- 是否可能影响训练数据质量

---

## 10. LLM 训练数据设计

低心智 Markdown 是训练数据优势。

最有价值的样本不是用户手写复杂 DSL，而是：

```text
简单用户 Markdown -> 后台 canonical DSL
```

### 10.1 必备训练样本类型

建议构造以下数据：

1. 用户 Markdown -> canonical AST
2. 用户 Markdown -> typedGraph
3. 用户 Markdown -> LNF
4. procedure prose -> canonical steps
5. observation prose -> canonical events
6. TLC prose/table -> TLC graph
7. 错误 Markdown -> diagnostics
8. 错误 Markdown -> quick fixes
9. legacy/internal syntax -> simple Markdown
10. simple Markdown -> training export
11. training export -> 实验摘要
12. retrieval query -> positive / hard negative chunks
13. prediction instance -> leakage-safe target
14. chosen/rejected answer pairs for DPO

### 10.2 数据必须保留双视图

每条样本应同时保留：

- raw user Markdown
- normalized simple Markdown
- canonical DSL
- typedGraph
- stepGraph
- LNF
- diagnostics
- quick fixes
- provenance
- quality labels

这能让模型学习：

- 如何读普通实验记录
- 如何结构化
- 如何发现错误
- 如何给用户解释
- 如何生成稳定后台结构

### 10.3 脏数据也要保留

生产环境里用户不会总是写标准文档。

训练数据应覆盖：

- 缺字段
- 错单位
- 多反应歧义
- 结果无法关联
- TLC 写法混乱
- 中英文混写
- OCR 噪声
- 图片识别不完整
- 旧语法
- 内部语法
- 手写简写

这些样本应进入 diagnostics / repair / normalization 数据集。

---

## 11. 推荐路线图

### P0：定义普通用户 Markdown surface

先冻结用户主写法。

必须覆盖：

- reaction
- molecule
- procedure
- observation
- result
- TLC
- sample
- image / OCR placeholder

输出应是用户文档规范，而不是内部 schema 文档。

### P1：建立后台 canonicalizer

把普通 Markdown 转成 canonical cheMD DSL。

重点能力：

- stable ID
- alias map
- context resolver
- source fingerprint
- confidence
- sidecar entity map

### P2：强化用户诊断和 quick fix

把内部 diagnostics 翻译成用户语言。

让用户用最少操作确认歧义。

### P3：补 DSL golden corpus

建立统一 corpus：

- simple user Markdown
- canonical internal syntax
- legacy syntax
- TLC prose/table/internal syntax
- expected AST
- expected typedGraph
- expected LNF
- expected training export

### P4：训练数据工程化

新增批量导出和 dataset builder：

- records.ndjson
- retrieval chunks
- reranker pairs
- prediction instances
- SFT samples
- DPO pairs
- quality manifest

### P5：runtime 产品化

runtime 继续消费后台 canonical stepGraph。

用户只看到：

- 待执行步骤
- 需要确认的步骤
- 已记录观察
- 偏差和修改
- 生成的报告

---

## 12. 验收标准

### 用户侧

- 用户可以不写 `:::chemd`
- 用户可以不写 ID
- 用户可以不写 `:::step`
- 用户可以用自然语言写 procedure
- 用户可以用自然语言或表格写 TLC
- 用户能看懂所有错误提示
- 用户能通过选择或确认解决歧义

### 后台侧

- 每个实体都有 stable ID
- 每个引用都有解析状态
- 每个派生值都有 provenance
- 每个低置信推断都有 diagnostics
- LNF 输出稳定
- training export 输出稳定
- 同一文档重复编译结果可复现
- 文档轻微编辑后实体能稳定对齐

### 训练侧

- raw Markdown 和 canonical DSL 成对保存
- diagnostics 和 quick fixes 成对保存
- procedure/TLC/observation 都有监督样本
- prediction 数据不泄漏 target
- retrieval 有 hard negative
- SFT/DPO 样本可追溯到源文档

---

## 13. 最终结论

cheMD 应该是生产级 DSL。

但这个 DSL 不应该主要表现为用户手写复杂语法。

正确方向是：

> **用户写低心智 Markdown；后台生成高严格度 DSL。**

这能同时满足：

- 普通用户容易写
- 工程系统容易校验
- runtime 可以执行
- LNF 可以稳定
- LLM 可以训练
- 数据可以追溯

一句话：

> **用户付出的心智越少，后台 DSL 的责任越重。**
