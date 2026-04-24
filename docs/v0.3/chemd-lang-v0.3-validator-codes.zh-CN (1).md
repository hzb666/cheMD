# chemd-lang v0.3：校验器诊断码实现文档（表层语法冻结版）

副标题：保持当前 `chemd v0.1` 报错体验与语法合同不变，把诊断系统升级为稳定、可机器消费、可修复的统一合同
状态：修订版（实现级）
适用范围：`packages/diagnostics`、`packages/validator-static`、`packages/validator-procedure`、`packages/validator-safety`、`packages/validator-runtime-plan`、`packages/exporter-training`

---

## 0. 文档定位

本修订版的第一原则是：

> **新诊断体系必须服务现有 Markdown / block 源文档，而不是反过来要求用户改用新语法。**

因此，诊断系统要做两件事：

1. 继承并稳定化当前 `v0.1` 已有 diagnostics。
2. 扩展到 typed semantic graph、step lowering、runtime preflight，但所有诊断仍要能落回现有源码位置与当前语法下的修复建议。

---

## 1. 设计目标与边界

### 1.1 目标

- 提供稳定 code space
- 统一 parser / resolver / type / procedure / runtime 诊断
- 为 UI / quick fix / training export 提供可消费结构
- 保持与当前 `v0.1` 诊断兼容
- 所有修复建议默认输出当前语法 patch

### 1.2 非目标

- 不设计“只有新 DSL 才能理解”的报错
- 不把诊断文本当唯一真相源
- 不把内部 IR 错误直接裸露给作者

---

## 2. 设计原则

### 2.1 源文档优先

每条诊断都应尽量包含：

- source span
- source node id
- source node type
- fix hint in current syntax

### 2.2 兼容优先

已有 `v0.1` 诊断码不能轻易废弃。新增码要通过 band 和 mapping 平滑接入。

### 2.3 raw 与 normalized 并存

尤其是：

- 单位规范化失败
- narrative lowering 低置信度
- unresolved reference

都不应 silent fail。

### 2.4 repair 目标以当前语法为准

`validation_repair` 的默认目标不是“改成别的 DSL”，而是“修成合法的当前 chemd source / compiled JSON / LNF”。

---

## 3. Diagnostic 数据模型

```ts
interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourceLayer:
    | "frontmatter"
    | "parser"
    | "resolver"
    | "typechecker"
    | "procedure_lowering"
    | "runtime_preflight"
    | "training_export";
  sourceNodeType?: string;
  sourceNodeId?: string;
  span?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  facts?: Record<string, unknown>;
  quickFixes?: QuickFix[];
}
```

```ts
interface QuickFix {
  title: string;
  kind:
    | "replace_text"
    | "insert_field"
    | "normalize_unit"
    | "split_procedure_sentence"
    | "add_block"
    | "link_reference";
  patch?: unknown;
}
```

---

## 4. 代码空间设计

### 4.1 band 设计

- `E1xx`：Syntax / Parse / Frontmatter / Block shape
- `E2xx`：Reference / Template / Symbol / Alias
- `E3xx`：Field type / Schema / Object consistency
- `E4xx`：Quantity / Unit / Normalization
- `E5xx`：Procedure / Step lowering / Analysis flow
- `E6xx`：Safety / Policy / Effect / Capability
- `E7xx`：Runtime planning / Resource / Preflight
- `W8xx`：Heuristic / Legacy / Low-confidence / Retrieval hints
- `I9xx`：Canonicalization / Migration / Optimization hints

### 4.2 legacy 兼容规则

已有 `v0.1` 代码直接保留，必要时补充子类解释，不随意改名。

---

## 5. v0.1 兼容映射

下列现有诊断继续保留为稳定入口：

- `E_INVALID_ID`
- `E_DUPLICATE_ID`
- `E_MISSING_REQUIRED_FIELD`
- `W_UNKNOWN_FIELD`
- `W_UNKNOWN_BLOCK`
- `W_UNRESOLVED_REFERENCE`
- `E_INVALID_PRIMARY_REFERENCE`
- `E_UNKNOWN_TEMPLATE`
- `E_DUPLICATE_TEMPLATE`
- `E_TEMPLATE_CYCLE`
- `W_INVALID_FRONTMATTER_LINE`
- `W_UNKNOWN_RENDER_PROFILE`
- `E_RENDER_PROFILE_CYCLE`
- `W_UNKNOWN_RENDER_PROFILE_FIELD`
- `E_INVALID_RENDER_PROFILE_VALUE`

映射原则：

- 这些码继续有效
- `v0.3` 新 band 不覆盖它们
- training export / UI / LSP 统一消费时，通过 registry 说明它们属于哪一层

---

## 6. 完整代码目录（修订版）

### 6.1 E1xx：Syntax / Parse

- `E101 INVALID_FRONTMATTER_KEY`
- `E102 INVALID_FRONTMATTER_SHAPE`
- `E103 INVALID_BLOCK_HEADER`
- `E104 INVALID_ID`
- `E105 DUPLICATE_ID`
- `E106 INVALID_LIST_ITEM`
- `E107 MALFORMED_INLINE_CHEM`
- `E108 MALFORMED_REFERENCE_TOKEN`

### 6.2 E2xx：Reference / Template / Symbol

- `E201 UNRESOLVED_REFERENCE_FATAL`
- `E202 INVALID_PRIMARY_REFERENCE`
- `E203 UNKNOWN_TEMPLATE`
- `E204 DUPLICATE_TEMPLATE`
- `E205 TEMPLATE_CYCLE`
- `E206 INVALID_ALIAS_TARGET`
- `E207 REFERENCE_FIELD_NOT_FOUND`

### 6.3 E3xx：Type / Schema / Object Consistency

- `E301 MISSING_REQUIRED_FIELD`
- `E302 INVALID_FIELD_TYPE`
- `E303 INVALID_REACTION_PARTICIPANT`
- `E304 RESULT_REACTION_MISMATCH`
- `E305 ANALYSIS_TARGET_AMBIGUOUS`
- `E306 INVALID_STATUS_VALUE`
- `E307 INVALID_ANALYSIS_EXTENSION_FIELD`

### 6.4 E4xx：Unit / Quantity / Normalization

- `E401 INVALID_UNIT`
- `E402 INVALID_PERCENT_VALUE`
- `E403 QUANTITY_PARSE_FAILED`
- `E404 DIMENSION_MISMATCH`
- `E405 NONCANONICAL_UNIT_REQUIRED`
- `E406 NORMALIZATION_FAILED_CRITICAL`

### 6.5 E5xx：Procedure / Step / Analysis Flow

- `E501 PROCEDURE_LOWERING_FAILED`
- `E502 PROCEDURE_STEP_ORDER_SUSPICIOUS`
- `E503 REQUIRED_WORKUP_STEP_MISSING`
- `E504 ANALYSIS_STEP_UNBOUND`
- `E505 OBSERVATION_STAGE_AMBIGUOUS`
- `E506 LOW_CONFIDENCE_STEP_EXTRACTION_BLOCKING`
- `E507 PROCEDURE_RESULT_FLOW_BROKEN`

### 6.6 E6xx：Safety / Policy

- `E601 AIR_SENSITIVE_WITHOUT_INERT_CONTEXT`
- `E602 TEMPERATURE_POLICY_VIOLATION`
- `E603 QUENCH_RISK_UNDER_SPECIFIED`
- `E604 INCOMPATIBLE_REAGENT_COMBINATION`
- `E605 CAPABILITY_REQUIRED_BUT_MISSING`

### 6.7 E7xx：Runtime Planning / Preflight

- `E701 RUNPLAN_BUILD_FAILED`
- `E702 RESOURCE_UNAVAILABLE`
- `E703 PRECONDITION_UNSATISFIED`
- `E704 CHECKPOINT_ANALYSIS_MISSING`
- `E705 REPLAY_TRACE_INCOMPLETE`

### 6.8 W8xx：Warning / Heuristic / Legacy

- `W801 UNKNOWN_FIELD`
- `W802 UNKNOWN_BLOCK`
- `W803 UNRESOLVED_REFERENCE`
- `W804 NONCANONICAL_TOKEN`
- `W805 LOW_CONFIDENCE_STEP_EXTRACTION`
- `W806 OBSERVATION_COULD_BE_STRUCTURED`
- `W807 LEGACY_FREEFORM_PROCEDURE`
- `W808 RETRIEVAL_SUPPORT_WEAK`

### 6.9 I9xx：Info / Canonicalization / Migration

- `I901 UNIT_NORMALIZED`
- `I902 STATUS_CANONICALIZED`
- `I903 PROCEDURE_LOWERED_SUCCESSFULLY`
- `I904 TEMPLATE_EXPANDED`
- `I905 MIGRATION_HINT_AVAILABLE`

---

## 7. 重点诊断的 message / facts 设计

### 7.1 `E403 QUANTITY_PARSE_FAILED`

源文档：

```md
temperature: warm overnight
```

facts 示例：

```json
{
  "field": "temperature",
  "raw_value": "warm overnight",
  "expected_quantity_class": "temperature"
}
```

quick fix：

- 建议拆分为 `temperature` 与 `time`
- 或保留原文但补明确数值

### 7.2 `W805 LOW_CONFIDENCE_STEP_EXTRACTION`

源文档：

```md
:::procedure
处理后照常做。
:::
```

含义：

- narrative 过于模糊
- lowering 只能得到低置信度 composite step

quick fix：

- 建议改成编号列表
- 建议明确后处理动作

### 7.3 `E601 AIR_SENSITIVE_WITHOUT_INERT_CONTEXT`

facts 示例：

```json
{
  "step_family": "add",
  "material": "n-BuLi",
  "required_context": "inert_atmosphere"
}
```

建议修复：

- 在现有 `reaction` block 中补 `atmosphere: nitrogen`
- 或在 `procedure` 中补充“氮气置换”步骤描述

---

## 8. Code action 体系

### 8.1 只生成当前语法补丁

quick fix 主要分为：

- 替换拼错字段
- 规范化单位
- 插入缺字段
- 拆分 procedure 句子为编号列表
- 补显式 `#id`
- 补 analysis / result block

### 8.2 示例

坏输入：

```md
:::result #res-main
yiled: 78%
:::
```

修复：

```md
:::result #res-main
yield: 78%
:::
```

坏输入：

```md
:::procedure
反应完后照常处理。
:::
```

建议修复：

```md
:::procedure
1. 加水淬灭。
2. EtOAc 萃取。
3. Na2SO4 干燥。
4. 浓缩。
:::
```

---

## 9. 发射规则

### 9.1 parser / resolver 层

优先发：`E1xx` / `E2xx`

### 9.2 typed semantic graph 层

优先发：`E3xx` / `E4xx`

### 9.3 procedure lowering 层

优先发：`E5xx` / `W805`

### 9.4 runtime preflight 层

优先发：`E6xx` / `E7xx`

### 9.5 training export 层

可引用上游诊断，不自行创造第二套语义相同的代码。

---

## 10. Suppression、升级与 gate 规则

### 10.1 suppress 的原则

只有 warning / info 才适合 suppression；严重错误默认不允许沉默通过。

### 10.2 gate 的原则

不同输出层 gate 标准不同：

- preview：允许多数 warning
- LNF：允许 partial lowering，但要标记质量
- runtime plan：`E6xx/E7xx` 可能阻断
- prediction export：结果泄漏或目标缺失可能阻断可用性标签

---

## 11. 与 UI、runtime trace、training export 的对接

### 11.1 UI

- 源位置高亮
- quick fix 菜单
- block-level summary

### 11.2 runtime trace

trace 事件应可附带诊断码，便于 replay 和 root-cause 分析。

### 11.3 training export

训练导出应直接携带：

- code
- severity
- facts
- source span

这为 `validation_repair`、`diagnostic_to_fix`、`trace_to_root_cause` 提供稳定基座。

---

## 12. 建议的包结构与公共 API

```text
packages/
  diagnostics/
    src/
      registry.ts
      diagnostic.ts
      quick-fix.ts
      legacy-map.ts
```

API：

```ts
export function createDiagnostic(input: DiagnosticInput): Diagnostic;
export function getDiagnosticSpec(code: string): DiagnosticSpec | undefined;
export function buildQuickFixes(diagnostic: Diagnostic, context: FixContext): QuickFix[];
```

---

## 13. 测试策略

### 13.1 核验项

- 现有 v0.1 诊断不漂移
- source span 能定位到 Markdown
- quick fix 输出当前语法补丁
- 低置信度 lowering 能正确发 `W805`
- runtime preflight 能发 `E6xx/E7xx`

### 13.2 样本集

1. frontmatter 错误
2. 引用未解析
3. 单位脏写法
4. 模糊 procedure
5. 缺工作后处理步骤
6. 缺惰性气氛上下文

---

## 14. 分阶段落地顺序

### Phase 1
- 冻结 legacy mapping
- 建立 registry

### Phase 2
- 接 type / quantity / procedure lowering 诊断

### Phase 3
- 接 runtime preflight
- 接 quick fix
- 接 training export

---

## 15. 最终实现结论

本修订版对诊断系统的最终要求是：

> **在不改变现有 chemd 语法与报错体验前提下，把 diagnostics 升级成可版本化、可修复、可训练、可追踪的统一合同。**

换句话说，新增能力都应该“长在现有源码上”，而不是逼用户迁移到另一门语言。

---
