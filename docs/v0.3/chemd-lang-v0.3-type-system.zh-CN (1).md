# chemd-lang v0.3：类型系统实现文档（表层语法冻结版）

> 2026-04-18 状态说明：本文是 v0.3 历史设计稿。当前 `CanonicalStepNode.outputs` 已是结构化 `StepOutputNode[]`，typedGraph 也会携带 step `inputs/outputs/artifacts/effects` 与 observation event `rawText/params`。当前合同以 `.trellis/spec/compiler/backend/language-v03-contracts.md` 为准。

副标题：不改变现有 `chemd v0.1` Markdown / block 语法，把解析后的文档对象真正 typed 化
状态：修订版（实现级）
适用范围：`packages/typechecker`、`packages/hir`、`packages/mir`、`packages/validator-static`、`packages/validator-safety`、`packages/lnf`、`packages/exporter-training`

---

## 0. 文档定位

本修订版明确一个前提：

> **类型系统只增强内部语义层，不新增作者默认语法。**

作者继续写现有 chemd Markdown；类型系统在 `parse -> resolve` 之后工作，给现有文档对象附加：

- 数量与量纲类型
- 对象类型
- narrative lowering 后的 step 类型
- effect / capability 约束
- 诊断与 quick fix 所需事实

---

## 1. 设计目标与边界

### 1.1 目标

类型系统在本版中要完成六件事：

1. 给现有 block 和 narrative 附加稳定类型。
2. 把数量、单位、量纲从字符串后处理升级为正式类型。
3. 给 `procedure` / `observation` 的 lowering 结果建立 typed contract。
4. 支持 validator、runtime、LNF、training export 共享同一类型真相源。
5. 给 diagnostics 提供结构化事实，但保持对源 Markdown 的友好定位。
6. 默认兼容旧文档和未完全结构化文档。

### 1.2 非目标

- 不要求作者写类型注解。
- 不引入新的作者关键字如 `Amount`, `Step`, `Result<T>`。
- 不把 `procedure` 改成必须写成 JSON / YAML / 代码。

---

## 2. 表层合同：只承认当前语法

### 2.1 输入源保持不变

类型系统的输入最终来自当前表层：

- frontmatter
- `:chem[...]`
- `:::block #id`
- 列表字段 `|`
- Markdown 正文
- `procedure` / `observation` prose
- `analysis` / `result` / `sample` / `template` / `use`
- 引用 `@id` / `@id.field`

### 2.2 作者不写这些东西

作者不直接写：

```text
Amount<mmol>
ConditionSet
Step<add>
Outcome<partial>
```

这些是编译器内部类型，不是表层合同。

---

## 3. 类型系统在编译链中的位置

推荐主链：

```text
Markdown source
  -> parser
  -> resolver
  -> typed semantic graph
  -> step graph
  -> validator / lnf / runtime plan / training export
```

类型检查有两个入口：

1. **对象检查**：针对 `reaction/result/analysis/sample/...`
2. **lowering 后检查**：针对 `procedure/observation` 生成的 step/event

---

## 4. Type IR 总览

### 4.1 顶层接口

```ts
interface TypedNodeBase {
  nodeId: string;
  sourceNodeType: string;
  sourceSpan?: SourceSpan;
  diagnostics?: Diagnostic[];
}
```

### 4.2 推荐的主类型集合

```ts
type ChemdType =
  | DocumentType
  | MoleculeType
  | ReactionType
  | ResultType
  | AnalysisType
  | SampleType
  | ProcedureNarrativeType
  | ObservationNarrativeType
  | ConditionSetType
  | QuantityType
  | StepType
  | ObservationEventType
  | OutcomeType
  | ReferenceType
  | OptionalType
  | ListType
  | UnknownType;
```

### 4.3 关键原则

- `UnknownType` 合法存在，用于旧文档或抽取不足场景。
- narrative 本身有类型，lowered object 也有类型，两者并存。
- 所有 typed node 必须可回溯到源文档位置。

---

## 5. 基础类型与字面量类型

### 5.1 基础标量

```ts
StringType
BoolType
IntegerType
FloatType
PercentType
DateType
IdentifierType
```

### 5.2 域内枚举

推荐先做轻量枚举，而不是过早做刚性大本体：

```ts
StatusLabel = "success" | "partial" | "failed" | "unknown"
Atmosphere = "nitrogen" | "argon" | "air" | "oxygen" | "unknown"
PhaseState = "solid" | "liquid" | "oil" | "foam" | "solution" | "unknown"
```

### 5.3 Narrative 类型

```ts
interface ProcedureNarrativeType {
  kind: "procedure_narrative";
  rawText: string;
  structureHint: "ordered_list" | "paragraph" | "mixed";
}

interface ObservationNarrativeType {
  kind: "observation_narrative";
  rawText: string;
  stageHint?: string;
}
```

---

## 6. 数量、单位与量纲系统

### 6.1 Quantity 的统一表示

```ts
interface QuantityType {
  kind: "quantity";
  quantityClass:
    | "amount"
    | "mass"
    | "volume"
    | "temperature"
    | "time"
    | "pressure"
    | "concentration"
    | "equivalent"
    | "percent";
  raw: string;
  value?: number;
  unit?: string;
  canonicalValue?: number;
  canonicalUnit?: string;
}
```

### 6.2 建议 canonical units

- amount -> `mmol`
- mass -> `mg`
- volume -> `mL`
- temperature -> `C`
- time -> `h`
- pressure -> `bar`
- concentration -> `M`
- percent -> `percent`

### 6.3 量纲兼容性

示例：

- `90 °C` 合法映射到 temperature
- `16 h` 合法映射到 time
- `2 equiv` 合法映射到 equivalent
- `0.10 M` 合法映射到 concentration

但：

- `temperature: overnight` -> 类型错误
- `yield: THF` -> 类型错误

### 6.4 raw 与 normalized 并存

类型系统不能因为规范化失败而丢数据：

```ts
{
  kind: "quantity",
  quantityClass: "temperature",
  raw: "rt to reflux",
  value: undefined,
  unit: undefined,
  canonicalValue: undefined,
  canonicalUnit: undefined
}
```

这种对象仍应存在，并触发 warning。

---

## 7. 领域对象类型

### 7.1 MoleculeType

```ts
interface MoleculeType extends TypedNodeBase {
  kind: "molecule";
  smiles?: string;
  canonicalSmiles?: string;
  name?: string;
  role?: string;
  formula?: string;
  amount?: QuantityType;
  equivalents?: QuantityType;
}
```

### 7.2 ReactionType

```ts
interface ReactionType extends TypedNodeBase {
  kind: "reaction";
  reactants: ReferenceOrLiteral[];
  products: ReferenceOrLiteral[];
  reagents?: ReferenceOrLiteral[];
  catalyst?: ReferenceOrLiteral[];
  solvent?: TokenOrList;
  temperature?: QuantityType;
  time?: QuantityType;
  pressure?: QuantityType;
  atmosphere?: string;
  caption?: string;
  normalizedConditions?: ConditionSetType;
}
```

### 7.3 ResultType

```ts
interface ResultType extends TypedNodeBase {
  kind: "result";
  status?: StatusLabel;
  yield?: QuantityType;
  conversion?: QuantityType;
  selectivity?: QuantityType;
  purity?: QuantityType;
  isolatedMass?: QuantityType;
  productState?: string;
  notes?: string;
}
```

### 7.4 AnalysisType

```ts
interface AnalysisType extends TypedNodeBase {
  kind: "analysis";
  analysisType?: string;
  instrument?: string;
  method?: string;
  eluent?: string;
  data?: string;
  notes?: string;
  normalizedMeasurements?: MeasurementType[];
}
```

### 7.5 ProcedureNarrativeType -> StepGraph

`procedure` block 自身保留 narrative 类型，但会关联：

```ts
interface LoweredProcedureAttachment {
  procedureId: string;
  steps: StepType[];
  loweringConfidence: number;
}
```

---

## 8. 容器、引用与可选类型

### 8.1 常见容器

```ts
interface ListType<T> {
  kind: "list";
  itemType: T;
}

interface OptionalType<T> {
  kind: "optional";
  inner: T;
}
```

### 8.2 引用类型

```ts
interface ReferenceType {
  kind: "reference";
  targetKind:
    | "molecule"
    | "reaction"
    | "result"
    | "analysis"
    | "sample"
    | "template"
    | "unknown";
  refId: string;
  resolved: boolean;
}
```

### 8.3 文字与引用并存

很多现有字段既可能是 `@id`，也可能是字面文本，例如 `reactants`。因此推荐：

```ts
type ReferenceOrLiteral = ReferenceType | { kind: "literal"; raw: string };
```

---

## 9. ConditionSet 与 Outcome 的内部类型

### 9.1 ConditionSetType

```ts
interface ConditionSetType {
  kind: "condition_set";
  catalyst?: TokenOrList;
  ligand?: TokenOrList;
  base?: TokenOrList;
  acid?: TokenOrList;
  solvent?: TokenOrList;
  additive?: TokenOrList;
  concentration?: QuantityType;
  atmosphere?: string;
  vessel?: string;
  scale?: QuantityType;
}
```

### 9.2 OutcomeType

```ts
interface OutcomeType {
  kind: "outcome";
  status?: StatusLabel;
  yieldPercent?: number;
  conversionPercent?: number;
  selectivityPercent?: number;
  purityPercent?: number;
  notes?: string;
}
```

这些都是内部聚合对象，不要求作者手写。

---

## 10. Step 类型：来自 lowering，不来自作者 DSL

### 10.1 StepType

```ts
interface StepType extends TypedNodeBase {
  kind: "step";
  op:
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
    | "filter"
    | "wash"
    | "dry"
    | "concentrate"
    | "purify"
    | "sample"
    | "analyze"
    | "observe";
  params: Record<string, unknown>;
  inputs?: ReferenceOrLiteral[];
  outputs?: string[];
  effects?: EffectType[];
  sourceProcedureId?: string;
}
```

### 10.2 来源示例

源文档：

```md
:::procedure #proc-1
1. 氮气置换 15 min。
2. 加入 Pd2(dba)3 和 XPhos。
3. 加热到 100 °C 反应 16 h。
:::
```

类型化后：

```yaml
steps:
  - op: purge
    params: { atmosphere: nitrogen, duration: 15 min }
  - op: add
    params: { materials: [Pd2(dba)3, XPhos] }
  - op: heat
    params: { temperature: 100 °C, duration: 16 h }
```

---

## 11. Trait、Effect 与 Capability

### 11.1 它们是内部约束，不是表层语法

作者不写 `requires inert`；但类型系统可以推断并附加：

- `air_sensitive`
- `moisture_sensitive`
- `low_temperature_required`
- `fume_hood_required`

### 11.2 EffectType

```ts
type EffectType =
  | "uses_inert_atmosphere"
  | "changes_temperature"
  | "creates_biphasic_system"
  | "consumes_hazardous_reagent"
  | "produces_gas"
  | "requires_sampling"
  | "requires_purification";
```

### 11.3 CapabilityType

```ts
type CapabilityType =
  | "stirring"
  | "cooling"
  | "heating"
  | "inert_gas"
  | "vacuum"
  | "filtration"
  | "chromatography"
  | "analytical_tlc"
  | "nmr"
  | "hplc";
```

类型系统负责把文档对象与这些内部约束连接起来。

---

## 12. 类型推断：如何从现有语法推出来

### 12.1 key/value 字段推断

例如：

```md
temperature: 100 °C
yield: 23%
```

直接推断为：

- `temperature -> QuantityType(temperature)`
- `yield -> QuantityType(percent)`

### 12.2 列表字段推断

```md
reactants: a | b | c
```

推断为 `List<ReferenceOrLiteral>`。

### 12.3 procedure 列表推断

```md
1. 冷却至 0 °C。
2. 滴加 n-BuLi。
```

通过句式规则推断出 `cool` 与 `add`。

### 12.4 observation 正文推断

```md
体系逐渐变深红色。
```

推断出：

- `ObservationNarrativeType`
- lowered `ObservationEventType(event_type=color_change)`

### 12.5 analysis 扩展字段推断

`analysis` 允许按 `type` 扩展，类型系统通过 registry 确定额外字段解释，而不是改表层语法。

---

## 13. Type Environment 与检查流程

推荐顺序：

1. 读取 resolved document
2. 建立文档级 symbol table
3. 建立 block-level typed nodes
4. 规范化 quantity / token / status
5. 运行 procedure lowering
6. 生成 step types
7. 运行跨节点一致性检查
8. 输出 typed semantic graph + diagnostics

---

## 14. 诊断与 quick fix

### 14.1 诊断必须锚定现有语法

错误示例：

```md
:::result #res-main
yiled: 78%
:::
```

quick fix 应是：

```md
:::result #res-main
yield: 78%
:::
```

而不是建议用户“改成别的 DSL”。

### 14.2 类型相关重点诊断

- `E3xx`：字段类型不匹配
- `E4xx`：数量 / 单位 / 量纲问题
- `E5xx`：procedure lowering 后的 step 合同不成立
- `W8xx`：narrative 可抽取但置信度不足

---

## 15. 与 HIR / MIR / LNF 的关系

### 15.1 HIR

HIR 仍然贴近 resolved document，保留 narrative 与 raw field。

### 15.2 MIR

MIR 进入更规范的 typed object 与 lowered step 视图。

### 15.3 LNF

LNF 读取 MIR，把：

- narrative
- typed objects
- normalized quantities
- steps
- diagnostics

整理成给模型看的 canonical form。

---

## 16. 建议的包结构与 API

```text
packages/
  typechecker/
    src/
      index.ts
      types.ts
      env.ts
      normalize/
        quantities.ts
        tokens.ts
        status.ts
      infer/
        fields.ts
        procedure.ts
        observation.ts
      checks/
        reaction.ts
        result.ts
        analysis.ts
        procedure.ts
      diagnostics.ts
```

推荐主 API：

```ts
export function buildTypedSemanticGraph(document: ResolvedChemdDocument): TypedSemanticGraph;
export function typecheckDocument(document: ResolvedChemdDocument): TypecheckResult;
```

---

## 17. 测试策略

### 17.1 重点测试样本

1. 纯 `reaction/result` 文档
2. 含 `procedure` 编号列表的文档
3. `observation` prose 文档
4. 单位脏写法文档
5. 多 reaction / 多 result 文档
6. unresolved reference 文档
7. 模板展开文档

### 17.2 核验项

- 类型推断是否稳定
- lowering 是否可重复
- raw 与 normalized 是否同时保留
- diagnostics 是否仍能回到 Markdown 位置

---

## 18. 从 v0.1 渐进迁移

### 18.1 先不强推作者改变写法

迁移重点不是作者改格式，而是内部层渐进增强。

### 18.2 最先落地的类型化对象

优先顺序：

1. Quantity
2. Reaction / Result / Analysis
3. Procedure lowering -> StepType
4. Observation event
5. ConditionSet / Outcome 聚合对象
6. Effect / Capability

---

## 19. 建议的首批落地顺序

### Phase 1
- 先做 quantity / status / token normalization
- 先把现有 block typed 化

### Phase 2
- 做 `procedure` / `observation` lowering
- 做 `StepType` 和 `ObservationEventType`

### Phase 3
- 接 validator / LNF / training export

### Phase 4
- 接 runtime plan 与 trace

---

## 20. 最终实现结论

本修订版对类型系统的最终要求是：

> **不改变现有 chemd 表层写法，但把现有文档解析结果真正变成 typed 的实验对象图。**

这样做的结果是：

- 作者仍然好写好读
- 编译器有正式类型真相源
- validator、runtime、LLM 训练有稳定输入
- 整个系统真正向“实验语言”推进，但不破坏当前代码库语法

---
