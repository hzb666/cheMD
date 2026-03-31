# chemd 训练数据导出 v0.1
## 详细架构与实施计划

状态：设计稿（可直接交给 agent 开始实现）  
面向版本：`chemd-training-export/v0.1`  
适用仓库：`hzb666/cheMD`  
最后更新：2026-04-01

---

## 1. 文档目的

本文档定义 `chemd` 的训练数据导出层（training export layer）在 v0.1 阶段的目标、边界、数据模型、模块划分、实施步骤、测试策略与验收标准。

这份设计不是单纯的“导出一份 JSON”，而是为以下三类下游能力提供统一的数据基座：

1. 检索增强生成（RAG）与实验总结
2. 结构化统计分析与规则发现
3. 预测任务（成功/失败分类、产率/转化率回归、条件推荐）

---

## 2. 背景与当前工程对齐

当前 `cheMD` 已具备以下关键基础：

- 源格式仍是 Markdown 文本
- 文档会先进入 parser，转为结构化 AST
- resolver 会做引用解析、模板展开、语义校验
- compiler 会统一输出 HTML / JSON / DOCX bridge
- AST 已具备 `molecule / reaction / result / analysis / sample / template / use / markdown` 等节点层次
- renderer-json 已能输出文档、diagnostics、render 信息

因此，训练数据导出层最合适的位置不是“独立于现有编译链”，而是：

```text
source .md
-> parseChemd()
-> resolveChemd()
-> exportTrainingRecord()
-> downstream stores / vector db / ML datasets
```

也就是说，训练导出层应该建立在 **resolved document** 之上，而不是建立在原始字符串切块之上。

这点非常重要。因为一旦 exporter 建立在 resolved document 上，就天然获得：

- 模板展开后的稳定语义内容
- 已解析的引用关系
- 更明确的对象边界
- diagnostics 驱动的数据质量标记

---

## 3. 总体目标

`chemd-training-export v0.1` 的总体目标：

1. 设计一份稳定、可序列化、可追溯的训练导出 schema
2. 让同一份导出结果同时支持：
   - RAG 检索块生成
   - SQL / parquet / dataframe 分析
   - 监督学习训练实例生成
3. 不把 v0.1 绑定死在某一个化学后端或某一个 embedding 方案上
4. 尽量复用当前 monorepo 的包边界与 AST contract
5. 让 agent 能以较小风险按阶段落地

---

## 4. 非目标

v0.1 明确不尝试提供：

- 全领域统一化学本体（ontology）
- 所有分析谱图的完全结构化抽取
- 完整 reaction graph 语义规范
- 图神经网络训练管线
- 一次性完成所有单位/命名的全自动高精度标准化
- 强依赖 RDKit 才能运行的 exporter 核心主链路
- 多租户数据仓库与权限系统

v0.1 的目标是：**训练可用、架构可扩展、质量可追溯**。

---

## 5. 设计原则

### 5.1 原始值与规范值并存

任何有歧义或可能规范化失败的字段，都必须同时保留：

- raw value
- normalized value

例如：

- `temperature_raw = "90 C"`
- `temperature = { value: 90, unit: "C" }`

### 5.2 文本表示与结构化表示并存

不能把所有东西都压平成 embedding 文本。必须同时保留：

- 文本块（给 RAG）
- 结构化字段（给预测和分析）

### 5.3 化学特征延迟绑定

schema 预留 chemistry feature 引用位，但不强制在 v0.1 把分子指纹、反应指纹写死为 exporter 的核心依赖。

### 5.4 数据质量必须显式输出

训练层最怕 silent corruption。因此 diagnostics、规范化失败、样本可用性都必须显式输出。

### 5.5 exporter 只负责“构建训练可消费数据”，不负责最终模型训练

exporter 的职责是：

- 把文档变成标准导出记录
- 给检索和预测下游提供稳定输入

而不是：

- 直接负责 embedding 落库
- 直接训练模型
- 直接做在线推理

---

## 6. 架构总览

### 6.1 分层架构

```text
chemd source markdown
  -> parser
  -> resolver
  -> training exporter
      -> source_layer
      -> semantic_layer
      -> learning_layer
      -> quality_layer
  -> derived dataset outputs
      -> records.ndjson
      -> retrieval_chunks.ndjson
      -> prediction_instances.ndjson
      -> chemistry_features.ndjson (optional)
```

### 6.2 训练导出层职责

training exporter 层由四个逻辑子层组成：

1. `source_layer`
   - 保留原始和近原始信息
   - 保证追溯性

2. `semantic_layer`
   - 提取结构化实体
   - 建立显式关系

3. `learning_layer`
   - 面向 RAG 的 retrieval chunks
   - 面向预测的 prediction instances

4. `quality_layer`
   - 汇总 parse / normalization / trainability 信息

---

## 7. 推荐的 monorepo 模块划分

建议新增：

```text
packages/
  exporter-training/
    src/
      index.ts
      types.ts
      export-record.ts
      export-dataset.ts
      source-layer.ts
      semantic-layer.ts
      learning-layer.ts
      quality-layer.ts
      normalize/
        numbers.ts
        units.ts
        percent.ts
        status.ts
        tokens.ts
        smiles.ts
      chunking/
        retrieval.ts
        summaries.ts
      linking/
        entity-links.ts
        primary.ts
      prediction/
        instances.ts
        usability.ts
      utils/
        ids.ts
        text.ts
        dates.ts
        hashes.ts
    tests/
      exporter-record.test.ts
      semantic-layer.test.ts
      retrieval-chunks.test.ts
      prediction-instances.test.ts
      normalization.test.ts
      quality-layer.test.ts
```

### 7.1 包职责

#### `@chemd/exporter-training`

职责：

- 接收 resolved chemd document
- 生成 `ChemdTrainingExportV1`
- 生成派生训练数据记录
- 维护训练导出 schema contract

#### 与现有包关系

- 读取 `@chemd/core` AST 类型
- 复用 `@chemd/parser` 与 `@chemd/resolver` 的输出
- 可通过 `@chemd/compiler` 补充统一入口，但不应强依赖 HTML / JSON renderer

---

## 8. 顶层 schema

```ts
export interface ChemdTrainingExportV1 {
  schema_version: "chemd-training-export/v0.1";
  export_id: string;
  exported_at: string;
  generator: ExportGeneratorInfo;

  document: ExportedDocumentInfo;
  source_layer: SourceLayerV1;
  semantic_layer: SemanticLayerV1;
  learning_layer: LearningLayerV1;
  quality_layer: QualityLayerV1;
}
```

### 8.1 generator

```ts
export interface ExportGeneratorInfo {
  system: "chemd";
  exporter_module: string;
  exporter_version: string;
  pipeline: string[];
}
```

### 8.2 document

```ts
export interface ExportedDocumentInfo {
  document_id: string;
  title: string;
  date: string;
  tags?: string[];

  primary_molecule_id?: string;
  primary_reaction_id?: string;
  primary_result_id?: string;
  primary_analysis_id?: string;
  primary_sample_id?: string;

  source_hash?: string;
  source_uri?: string;
  language?: string;
}
```

---

## 9. source_layer 设计

### 9.1 目的

source_layer 的目标不是给模型直接吃，而是：

- 保证可追溯
- 支持重新导出
- 支持调试与数据审计

### 9.2 类型定义

```ts
export interface SourceLayerV1 {
  raw_source?: string;
  resolved_source?: string;
  raw_meta: Record<string, unknown>;
  raw_children: SourceNodeSnapshot[];
  diagnostics: ExportedDiagnostic[];
}

export interface SourceNodeSnapshot {
  node_index: number;
  node_type:
    | "markdown"
    | "molecule"
    | "reaction"
    | "result"
    | "analysis"
    | "sample"
    | "template"
    | "use";
  original_id?: string;
  raw_payload: Record<string, unknown>;
}

export interface ExportedDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  node_index?: number;
  node_id?: string;
  position?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
}
```

### 9.3 source_layer 实现策略

- `raw_meta` 直接从 resolved document meta 复制
- `raw_children` 按 children 顺序逐个快照
- `raw_payload` 不做 schema 收口，保留原对象字段
- diagnostics 原样转出，最多做字段名兼容处理

---

## 10. semantic_layer 设计

### 10.1 目的

semantic_layer 是训练导出的核心语义层。它的职责是：

- 把文档拆成稳定实体
- 为后续学习层提供统一引用标识
- 显式表达 entity relationships

### 10.2 总体结构

```ts
export interface SemanticLayerV1 {
  molecules: ExportedMoleculeV1[];
  reactions: ExportedReactionV1[];
  results: ExportedResultV1[];
  analyses: ExportedAnalysisV1[];
  samples: ExportedSampleV1[];
  markdown_blocks: ExportedMarkdownBlockV1[];
  links: ExportedRelationV1[];
}
```

### 10.3 实体基类

```ts
export interface ExportedEntityBase {
  entity_id: string;
  original_id?: string;
  node_index: number;
  source_node_type: string;
  is_primary?: boolean;
  provenance?: {
    from_template?: boolean;
    template_name?: string;
    expanded_from_use?: string;
  };
}
```

### 10.4 molecule

```ts
export interface ExportedMoleculeV1 extends ExportedEntityBase {
  source_node_type: "molecule";
  name?: string;
  role?: string;
  caption?: string;

  smiles?: string;
  canonical_smiles?: string;
  formula?: string;

  amount_raw?: string;
  amount_value?: NumericWithUnit | null;

  equivalents_raw?: string;
  equivalents_value?: number | null;

  text_for_embedding?: string;
}
```

### 10.5 reaction

```ts
export interface ExportedReactionV1 extends ExportedEntityBase {
  source_node_type: "reaction";

  name?: string;
  caption?: string;

  reactants: ReactionParticipantV1[];
  products: ReactionParticipantV1[];

  reagents_raw?: string;
  catalyst_raw?: string;
  solvent_raw?: string;
  temperature_raw?: string;
  time_raw?: string;
  pressure_raw?: string;
  atmosphere_raw?: string;

  yield_raw?: string;
  conversion_raw?: string;
  selectivity_raw?: string;

  normalized_conditions: NormalizedReactionConditionsV1;
  normalized_outcome_hints: NormalizedOutcomeHintsV1;

  text_for_embedding?: string;
}
```

```ts
export interface ReactionParticipantV1 {
  role: "reactant" | "product";
  raw: string;
  reference_status: "resolved" | "unresolved" | "literal";
  target_entity_id?: string;
  target_original_id?: string;
  name?: string;
  smiles?: string;
  canonical_smiles?: string;
}
```

```ts
export interface NormalizedReactionConditionsV1 {
  solvent?: NormalizedTokenValue | null;
  catalyst?: NormalizedTokenValue | null;
  reagents?: NormalizedMultiTokenValue | null;
  atmosphere?: NormalizedTokenValue | null;
  temperature?: NumericWithUnit | null;
  time?: NumericWithUnit | null;
  pressure?: NumericWithUnit | null;
}
```

```ts
export interface NormalizedOutcomeHintsV1 {
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
}
```

### 10.6 result

```ts
export interface ExportedResultV1 extends ExportedEntityBase {
  source_node_type: "result";

  status_raw?: string;
  status_label?: "success" | "partial" | "failed" | "unknown";

  yield_raw?: string;
  conversion_raw?: string;
  selectivity_raw?: string;
  isolated_mass_raw?: string;
  product_state?: string;
  purity_raw?: string;
  notes?: string;

  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;
  isolated_mass?: NumericWithUnit | null;

  text_for_embedding?: string;
}
```

### 10.7 analysis

```ts
export interface ExportedAnalysisV1 extends ExportedEntityBase {
  source_node_type: "analysis";

  analysis_type?: string;
  instrument?: string;
  solvent?: string;
  frequency?: string;
  method?: string;

  data_raw?: string;
  notes?: string;

  parsed_measurements?: ParsedMeasurementV1[];
  text_for_embedding?: string;
}
```

```ts
export interface ParsedMeasurementV1 {
  measurement_type: string;
  raw: string;
  value?: number | null;
  unit?: string | null;
  confidence?: number | null;
}
```

### 10.8 sample

```ts
export interface ExportedSampleV1 extends ExportedEntityBase {
  source_node_type: "sample";
  name?: string;
  sample_code?: string;
  batch?: string;
  purity_raw?: string;
  supplier?: string;
  notes?: string;

  purity_percent?: number | null;
  text_for_embedding?: string;
}
```

### 10.9 markdown_blocks

```ts
export interface ExportedMarkdownBlockV1 extends ExportedEntityBase {
  source_node_type: "markdown";
  raw_text: string;
  cleaned_text: string;
  references: ExportedReferenceTokenV1[];
  inline_chem: ExportedInlineChemTokenV1[];
  inline_code: ExportedInlineCodeTokenV1[];
  links: ExportedMarkdownLinkV1[];
  text_for_embedding?: string;
}
```

```ts
export interface ExportedReferenceTokenV1 {
  raw: string;
  kind: string;
  source: string;
  field?: string;
  resolution_status?: "resolved" | "unresolved";
  resolution_value?: unknown;
}

export interface ExportedInlineChemTokenV1 {
  raw: string;
  value: string;
}

export interface ExportedInlineCodeTokenV1 {
  raw: string;
  value: string;
}

export interface ExportedMarkdownLinkV1 {
  raw: string;
  label: string;
  href: string;
  safe: boolean;
}
```

### 10.10 relations

```ts
export interface ExportedRelationV1 {
  relation_id: string;
  relation_type:
    | "document_primary"
    | "reaction_uses_molecule"
    | "reaction_produces_molecule"
    | "result_describes_reaction"
    | "analysis_targets_sample"
    | "analysis_targets_result"
    | "sample_related_to_molecule"
    | "markdown_mentions_entity";
  from_entity_id: string;
  to_entity_id: string;
  role?: string;
  confidence?: number | null;
}
```

---

## 11. semantic_layer 的构建规则

### 11.1 实体 ID 规则

导出后的 `entity_id` 必须稳定且全局唯一，推荐规则：

```text
mol::<document_id>::<original_id or node_index>
rxn::<document_id>::<original_id or node_index>
res::<document_id>::<original_id or node_index>
ana::<document_id>::<original_id or node_index>
sam::<document_id>::<original_id or node_index>
md::<document_id>::<node_index>
```

### 11.2 primary 标记

如果 `document.primary_reaction_id` 等于该节点的 `original_id`，则对应实体打上：

```ts
is_primary: true
```

### 11.3 provenance 标记

若未来 resolver 能暴露更细模板来源信息，则填充 provenance；v0.1 可以先留空，不阻塞主链路。

### 11.4 reaction participant 解析策略

对 `reactants/products` 中的每个条目：

1. 如果是 `@id` 形式且引用已被 resolver 解析到 molecule，则记为 `resolved`
2. 如果是 `@id` 但找不到实体，则记为 `unresolved`
3. 如果不是引用表达式，而是字面文本，则记为 `literal`

### 11.5 文本汇总字段

每个实体的 `text_for_embedding` 由 exporter 构造，而不是依赖原始块文本：

- `molecule`: `name + smiles + role + formula + caption`
- `reaction`: 条件摘要文本
- `result`: `status + notes + yield/conversion/selectivity`
- `analysis`: `type + instrument + method + data + notes`
- `sample`: `name + batch + supplier + notes`

---

## 12. learning_layer 设计

### 12.1 目的

learning_layer 是直接为下游模型服务的视图层，分为两类：

1. retrieval chunks
2. prediction instances

```ts
export interface LearningLayerV1 {
  retrieval_chunks: RetrievalChunkV1[];
  prediction_instances: PredictionInstanceV1[];
  chemistry_feature_refs?: ChemistryFeatureRefV1[];
}
```

---

## 13. retrieval_chunks 设计

### 13.1 原则

`chemd` 不适合按固定 token 数做盲切。推荐按 AST 语义切块。

### 13.2 类型定义

```ts
export interface RetrievalChunkV1 {
  chunk_id: string;
  experiment_id: string;
  chunk_type:
    | "markdown"
    | "reaction_summary"
    | "result_notes"
    | "analysis_notes"
    | "sample_notes"
    | "document_summary";
  source_entity_ids: string[];
  text: string;
  raw_text?: string;
  metadata: RetrievalMetadataV1;
}
```

```ts
export interface RetrievalMetadataV1 {
  date: string;
  tags?: string[];

  molecule_ids?: string[];
  reaction_ids?: string[];
  result_ids?: string[];
  analysis_ids?: string[];
  sample_ids?: string[];

  analysis_types?: string[];
  status_label?: "success" | "partial" | "failed" | "unknown";

  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;

  solvent?: string | null;
  catalyst?: string | null;
  atmosphere?: string | null;
}
```

### 13.3 chunk 生成规则

#### markdown chunk

每个 markdown block 一条：

- `chunk_type = "markdown"`
- `text = cleaned_text`
- `source_entity_ids = [markdown_block.entity_id]`

#### reaction summary chunk

每个 reaction 一条摘要 chunk，拼接：

- reaction name
- reactants/products
- solvent/catalyst/reagents
- temperature/time/pressure/atmosphere
- yield/conversion/selectivity hints
- caption

#### result notes chunk

若 result 有 notes，则单独一条：

- `chunk_type = "result_notes"`
- `text = structured summary + notes`

#### analysis notes chunk

若 analysis 有 data_raw 或 notes，则生成：

- `chunk_type = "analysis_notes"`
- `text = analysis_type + instrument + method + data_raw + notes`

#### sample notes chunk

若 sample 有 notes，则生成：

- `chunk_type = "sample_notes"`

#### document summary chunk

每篇文档一条总结 chunk，用于 coarse retrieval：

- 主 reaction / result / analysis 的摘要整合
- tags / date / primary entities

### 13.4 为什么不按固定 token 数切

因为当前 `chemd` 的最小语义单元已经存在，按结构切比按长度切更稳定。长度切块适合作为未来兜底策略，但不应作为 v0.1 主策略。

---

## 14. prediction_instances 设计

### 14.1 原则

预测任务不应直接对整篇文档建模，而应以 **reaction 为中心** 构建实例。

### 14.2 类型定义

```ts
export interface PredictionInstanceV1 {
  instance_id: string;
  experiment_id: string;

  task_scope: "reaction";
  reaction_entity_id: string;

  linked_result_entity_id?: string;
  linked_analysis_entity_ids?: string[];
  linked_sample_entity_ids?: string[];
  linked_molecule_entity_ids?: string[];

  split_hint: SplitHintV1;
  features: PredictionFeaturesV1;
  targets: PredictionTargetsV1;
  usability: PredictionUsabilityV1;
}
```

```ts
export interface SplitHintV1 {
  date: string;
  chronological_group?: string;
  project_id?: string;
}
```

```ts
export interface PredictionFeaturesV1 {
  categorical: Record<string, string | null>;
  numeric: Record<string, number | null>;
  text_refs: string[];
  entity_refs: string[];
  chemistry_feature_ref_ids?: string[];
}
```

```ts
export interface PredictionTargetsV1 {
  status_class?: "success" | "partial" | "failed" | "unknown";
  yield_percent?: number | null;
  conversion_percent?: number | null;
  selectivity_percent?: number | null;
  purity_percent?: number | null;
}
```

```ts
export interface PredictionUsabilityV1 {
  usable_for_classification: boolean;
  usable_for_yield_regression: boolean;
  usable_for_conversion_regression: boolean;
  usable_for_selectivity_regression: boolean;
  missing_required_fields: string[];
  warnings: string[];
}
```

### 14.3 features 生成规则

v0.1 推荐最少包含：

#### categorical

- `reaction_name`
- `solvent`
- `catalyst`
- `atmosphere`
- `product_state`

#### numeric

- `temperature_C`
- `time_h`
- `pressure_bar`
- `yield_hint_percent`
- `conversion_hint_percent`
- `selectivity_hint_percent`
- `num_reactants`
- `num_products`

#### text_refs

指向最相关 retrieval chunks：

- 当前 reaction summary chunk
- 关联 result notes chunk
- 关联 analysis notes chunk

### 14.4 target 生成规则

优先从 `result` 实体读取：

- `status_label`
- `yield_percent`
- `conversion_percent`
- `selectivity_percent`
- `purity_percent`

若没有 result，则 target 可部分为空，但实例仍可存在，供弱监督或半监督使用。

### 14.5 usability 判定规则

#### 分类可用

至少满足：

- 有 reaction 实体
- 有可映射 status_class

#### yield 回归可用

至少满足：

- 有 reaction 实体
- 有 `yield_percent`

#### conversion 回归可用

至少满足：

- 有 `conversion_percent`

#### selectivity 回归可用

至少满足：

- 有 `selectivity_percent`

---

## 15. chemistry_feature_refs 设计

### 15.1 目的

让 exporter 与未来化学特征计算模块解耦。

### 15.2 类型定义

```ts
export interface ChemistryFeatureRefV1 {
  feature_ref_id: string;
  scope: "molecule" | "reaction";
  target_entity_id: string;

  feature_set:
    | "rdkit-morgan-2048-v1"
    | "rdkit-descriptors-v1"
    | "reaction-fingerprint-v1"
    | "custom-json-map-v1";

  encoding:
    | "dense_f32"
    | "sparse_indices"
    | "json_map"
    | "external_uri";

  values?: number[];
  sparse_indices?: number[];
  json_map?: Record<string, number | string | boolean | null>;
  external_uri?: string;
}
```

### 15.3 v0.1 实现建议

v0.1 可以先：

- 类型先定义好
- 主流程允许 `chemistry_feature_refs` 为空
- 后续再增量接入 RDKit / descriptors pipeline

---

## 16. quality_layer 设计

### 16.1 目的

控制训练数据质量，避免 silent bad samples。

### 16.2 类型定义

```ts
export interface QualityLayerV1 {
  parse_quality: ParseQualityV1;
  normalization_quality: NormalizationQualityV1;
  training_quality: TrainingQualityV1;
}
```

```ts
export interface ParseQualityV1 {
  diagnostic_counts: {
    info: number;
    warning: number;
    error: number;
  };
  has_errors: boolean;
}
```

```ts
export interface NormalizationQualityV1 {
  normalized_fields: string[];
  failed_normalizations: Array<{
    field: string;
    raw_value: string;
    reason: string;
  }>;
}
```

```ts
export interface TrainingQualityV1 {
  rag_eligible: boolean;
  prediction_eligible: boolean;
  confidence_score: number;
  exclusion_reasons?: string[];
}
```

### 16.3 判定建议

#### rag_eligible

当文档至少拥有以下之一时为 true：

- markdown chunk
- reaction summary chunk
- result notes chunk
- analysis notes chunk

#### prediction_eligible

当至少存在一个 `PredictionInstanceV1` 且其 classification 或 regression 至少一种可用时为 true。

#### confidence_score

v0.1 可采用简单规则：

- baseline = 1.0
- 每个 warning 扣 0.02
- 每个 error 扣 0.1
- 每个关键字段规范化失败再扣 0.03
- 下限 0

---

## 17. 通用值类型

```ts
export interface NumericWithUnit {
  raw: string;
  value: number;
  unit: string;
  original_unit?: string;
}

export interface NormalizedTokenValue {
  raw: string;
  normalized: string;
}

export interface NormalizedMultiTokenValue {
  raw: string;
  normalized: string[];
}
```

---

## 18. 规范化子系统设计

建议放在：

```text
src/normalize/
```

### 18.1 numbers.ts

职责：

- 提取数值
- 处理带空格、括号、符号的简单文本

### 18.2 units.ts

职责：

- 单位映射
- 单位换算
- canonical unit 输出

推荐 canonical units：

- temperature -> `C`
- time -> `h`
- pressure -> `bar`
- mass -> `mg`
- volume -> `mL`
- amount -> `mmol`
- percent -> 0-100 的 numeric value

### 18.3 percent.ts

职责：

- 解析 `%`
- 兼容如 `78 %`、`78%`、`~78%`

### 18.4 status.ts

职责：

将 raw status 映射到：

- `success`
- `partial`
- `failed`
- `unknown`

v0.1 先采用规则表映射，不做 LLM 判别。

### 18.5 tokens.ts

职责：

- 规范化 solvent/catalyst/atmosphere/reagents 等 token 值
- v0.1 仅做轻量归一，不做深层化学命名统一

### 18.6 smiles.ts

职责：

- 若外部 canonicalization 可用则规范化
- 不可用时只保留原始 smiles
- 绝不因 canonicalization 失败阻塞主导出

---

## 19. linking 子系统设计

建议放在：

```text
src/linking/
```

### 19.1 entity-links.ts

职责：

- 生成 relation edges
- 处理 reaction -> molecule
- 处理 markdown -> mentioned entity
- 处理 result -> reaction 的关联

### 19.2 primary.ts

职责：

- 解析并标记 primary entities
- 生成 `document_primary` 类型 relation

### 19.3 result 与 reaction 关联策略

v0.1 简化规则：

1. 若 `primary_result_id` 与 `primary_reaction_id` 均存在，则优先关联
2. 否则若文档中只有一个 reaction 和一个 result，则自动关联
3. 否则仅保留弱关联，不强绑定

### 19.4 analysis 关联策略

v0.1 采用弱规则：

- 若只有一个 result，则 analysis 默认关联该 result
- 若只有一个 sample，则 analysis 默认关联该 sample
- 若歧义较大，则不强绑定，只保留 entity presence

---

## 20. chunking 子系统设计

建议放在：

```text
src/chunking/
```

### 20.1 retrieval.ts

职责：

- 生成 retrieval chunks
- 构造 chunk metadata

### 20.2 summaries.ts

职责：

- 生成 reaction summary 文本
- 生成 result summary 文本
- 生成 document summary 文本

### 20.3 reaction summary 文本模板

推荐模板：

```text
Reaction: {name}
Reactants: {reactants}
Products: {products}
Solvent: {solvent}
Catalyst: {catalyst}
Reagents: {reagents}
Temperature: {temperature}
Time: {time}
Pressure: {pressure}
Atmosphere: {atmosphere}
Yield: {yield}
Conversion: {conversion}
Selectivity: {selectivity}
Caption: {caption}
```

对空字段直接跳过，不输出空行。

---

## 21. prediction 子系统设计

建议放在：

```text
src/prediction/
```

### 21.1 instances.ts

职责：

- 遍历 reactions
- 生成 `PredictionInstanceV1`

### 21.2 usability.ts

职责：

- 判定每个实例能参与哪些任务
- 生成 warnings / missing_required_fields

### 21.3 多 reaction 文档策略

如果一篇文档中有多个 reaction：

- 每个 reaction 独立生成一个 prediction instance
- 共享 document-level metadata
- 尽量关联最近或最明确的 result

---

## 22. exporter 核心 API 设计

### 22.1 单文档导出

```ts
export interface ExportTrainingOptions {
  sourceUri?: string;
  includeRawSource?: boolean;
  includeResolvedSource?: boolean;
  language?: string;
  attachChemistryFeatures?: boolean;
}

export function exportTrainingRecord(
  source: string,
  options?: ExportTrainingOptions
): ChemdTrainingExportV1;
```

### 22.2 基于 resolved document 导出

更推荐内部主实现：

```ts
export function exportTrainingRecordFromDocument(
  document: ChemdDocument,
  context?: ExportTrainingContext
): ChemdTrainingExportV1;
```

原因：

- 更容易测试
- 更容易复用 parser/resolver 输出
- 适合未来批量导出

### 22.3 批量导出

```ts
export interface SourceInput {
  uri: string;
  content: string;
}

export async function* exportTrainingDataset(
  sources: Iterable<SourceInput> | AsyncIterable<SourceInput>,
  options?: ExportTrainingOptions
): AsyncIterable<ChemdTrainingExportV1>;
```

---

## 23. 派生输出格式设计

### 23.1 主记录

文件：

```text
exports/training/records.ndjson
```

每行一条 `ChemdTrainingExportV1`。

### 23.2 retrieval chunks

文件：

```text
exports/training/retrieval_chunks.ndjson
```

每行一条 `RetrievalChunkV1`。

### 23.3 prediction instances

文件：

```text
exports/training/prediction_instances.ndjson
```

每行一条 `PredictionInstanceV1`。

### 23.4 chemistry features

文件：

```text
exports/training/chemistry_features.ndjson
```

v0.1 可选。

### 23.5 manifest

```json
{
  "schema_version": "chemd-training-export/v0.1",
  "exported_at": "2026-04-01T12:00:00Z",
  "record_count": 0,
  "retrieval_chunk_count": 0,
  "prediction_instance_count": 0
}
```

---

## 24. 目录与文件命名建议

若未来希望把设计文档直接放回仓库，推荐路径：

```text
docs/chemd-training-export-v0.1-architecture-and-implementation-plan.md
```

若实现代码进入仓库，推荐：

```text
packages/exporter-training/
```

---

## 25. 实施阶段计划

## 阶段 0：契约冻结

目标：

- 冻结 schema v0.1 顶层字段
- 冻结包名、模块名、主 API 名称

任务：

1. 新建 `packages/exporter-training`
2. 新建 `src/types.ts`
3. 写出全部 TypeScript 类型
4. 写基础 schema fixture

验收：

- `pnpm typecheck` 通过
- 类型可被其他包正常 import

---

## 阶段 1：最小导出主链路

目标：

- 从 `ChemdDocument` 生成 `ChemdTrainingExportV1`
- 暂时不做复杂规范化

任务：

1. 实现 `exportTrainingRecordFromDocument`
2. 实现 `source_layer`
3. 实现 `semantic_layer` 的基础节点映射
4. 实现 `quality_layer.parse_quality`

验收：

- molecule/reaction/result/analysis/sample/markdown 能全部出现在 semantic layer
- diagnostics 能正确透传
- entity_id 稳定生成

---

## 阶段 2：规范化与 relation 构建

目标：

- 增加 normalized fields
- 建立 entity links

任务：

1. 实现 `normalize/percent.ts`
2. 实现 `normalize/units.ts`
3. 实现 `normalize/status.ts`
4. 实现 `linking/entity-links.ts`
5. 增加 `quality_layer.normalization_quality`

验收：

- `yield/conversion/selectivity/purity` 能导出 numeric percent
- `temperature/time/pressure` 能导出 canonical unit
- reaction 与 molecule 的 relation 能生成

---

## 阶段 3：retrieval chunks

目标：

- 导出可直接用于向量化的检索块

任务：

1. 实现 `chunking/summaries.ts`
2. 实现 `chunking/retrieval.ts`
3. 生成 document summary / reaction summary / notes chunks
4. 构建 retrieval metadata

验收：

- 每种核心 chunk 类型都有测试样例
- chunk 文本可读、字段清晰、不依赖 HTML 渲染结果

---

## 阶段 4：prediction instances

目标：

- 生成按 reaction 为中心的训练实例

任务：

1. 实现 `prediction/instances.ts`
2. 实现 `prediction/usability.ts`
3. 生成 features / targets / split_hint / usability

验收：

- reaction 文档能稳定生成 prediction instance
- classification / regression usability 判定正确

---

## 阶段 5：批量导出与 CLI

目标：

- 可以批量处理文档
- 可以落盘 ndjson

任务：

1. 实现 `exportTrainingDataset`
2. 可选：新增简单 CLI
3. 输出 manifest + ndjson 文件

CLI 示例：

```bash
pnpm chemd-export-training ./examples --out ./exports/training
```

验收：

- 支持多文档导出
- 导出文件统计数正确

---

## 阶段 6：化学特征接口预留

目标：

- 支持 future chemistry feature attachment

任务：

1. 定义 `ChemistryFeatureRefV1`
2. 提供 hook / callback 形式接入
3. 不破坏主导出链路

验收：

- 无 chemistry backend 时仍可正常导出
- 有外部 feature provider 时可附加 feature refs

---

## 26. 测试计划

### 26.1 单元测试

#### types / fixtures

- schema fixture 可序列化
- 顶层字段存在且类型正确

#### semantic layer

- molecule 节点正确映射
- reaction 节点正确映射
- markdown tokens 正确导出

#### normalization

- `78%` -> `78`
- `90 C` -> `{ value: 90, unit: "C" }`
- `8 h` -> `{ value: 8, unit: "h" }`
- 非法值不抛异常，只记录失败

#### retrieval chunks

- reaction summary chunk 字段齐全
- 空字段被跳过，不产生脏文本
- markdown chunk 保留 cleaned text

#### prediction instances

- 有 result 时能生成 target
- 无 result 时 target 可空
- usability 规则正确

### 26.2 集成测试

建议加入 fixture 文档：

1. 最小成功文档
2. 含多个 molecule + 一个 reaction 文档
3. 含 result/analysis/sample 的完整文档
4. 含 unresolved references 的文档
5. 含模板展开的文档
6. 含多 reaction 的文档
7. 含 diagnostics 的脏文档

集成验证：

```text
source -> parse -> resolve -> exportTrainingRecord
```

### 26.3 回归测试

当 parser / resolver contract 变化时，至少要验证：

- entity_id 未漂移
- primary entity 标记未退化
- retrieval chunk 文本未意外丢字段
- prediction target 提取未退化

---

## 27. 验收标准

达到以下标准可视为 `v0.1 exporter` 可用：

1. 能从 resolved chemd document 稳定生成 `ChemdTrainingExportV1`
2. 能导出 retrieval chunks
3. 能导出 prediction instances
4. diagnostics / normalization failures / usability 全部显式输出
5. 批量导出可落盘为 ndjson
6. 无 chemistry backend 时主流程仍可运行
7. 新包测试通过、typecheck 通过

---

## 28. 风险与注意事项

### 28.1 不要让 exporter 依赖 renderer 结果

训练导出必须建立在 AST / resolved document 上，而不是 HTML 输出上。否则会把展示层噪声引入训练数据。

### 28.2 不要把 prediction 逻辑写成 LLM-only

prediction instance 应是结构化实例，而不是 prompt 字符串。

### 28.3 不要让 canonicalization 失败阻塞整条导出链

smiles / token normalization 失败都应该降级，而不是 throw fatal error。

### 28.4 不要过早引入复杂本体

v0.1 先解决“能导出、可追溯、可学习”，不要过早追求全领域语义完备。

### 28.5 模板 provenance 可后补

如果当前 resolver 尚未暴露模板展开来源，不要为了 provenance 阻塞 v0.1 主链路。字段先保留，后续补齐。

---

## 29. 建议的开发顺序（给 agent）

### Step 1

先建包与类型：

- `packages/exporter-training/package.json`
- `src/types.ts`
- `src/index.ts`

### Step 2

打通最小主链路：

- `exportTrainingRecordFromDocument`
- `source-layer.ts`
- `semantic-layer.ts`

### Step 3

补规范化：

- `normalize/percent.ts`
- `normalize/units.ts`
- `normalize/status.ts`

### Step 4

补 learning layer：

- `chunking/retrieval.ts`
- `prediction/instances.ts`

### Step 5

补测试与 fixtures

### Step 6

再考虑 CLI 与 chemistry feature hook

---

## 30. 推荐的首批实现文件

```text
packages/exporter-training/
  src/
    index.ts
    types.ts
    export-record.ts
    source-layer.ts
    semantic-layer.ts
    learning-layer.ts
    quality-layer.ts
    normalize/percent.ts
    normalize/units.ts
    normalize/status.ts
    chunking/retrieval.ts
    chunking/summaries.ts
    prediction/instances.ts
    prediction/usability.ts
    linking/entity-links.ts
  tests/
    exporter-record.test.ts
    semantic-layer.test.ts
    normalization.test.ts
    retrieval-chunks.test.ts
    prediction-instances.test.ts
```

这是最适合 v0.1 的切入面：

- 足够小
- 风险可控
- 不和现有包边界冲突
- 一旦完成，就能立即为 RAG 和预测打基础

---

## 31. 最终结论

`chemd-training-export v0.1` 的正确定位不是“另一个 renderer”，而是：

**建立在 resolved chemd document 之上的训练数据中间层。**

它的核心价值在于：

- 把文档语义对象化
- 把文本、结构化字段、训练实例统一导出
- 让检索、总结、预测共享同一份语义基座

对当前 `cheMD` 仓库来说，这条路线与现有 AST / resolver / compiler 架构天然兼容，也最适合作为下一阶段的能力扩展入口。

---

## 32. 下一步建议

下一步最合适的是继续补两份实现级文档：

1. `packages/exporter-training/src/types.ts` 初稿
2. `packages/exporter-training` 的任务拆解 TODO 清单

这样 agent 就可以从“设计稿”直接进入“建包开发”。
