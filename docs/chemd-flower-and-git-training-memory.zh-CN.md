# Chemd 训练语义与 Git 经验记忆完善方案

状态：架构设计稿
更新时间：2026-04-22
适用范围：Chemd 训练基础设施、公开反应数据导入、实验语义编译、Git history 数据挖掘、SFT / LoRA / eval 数据构造

---

## 1. 目标

Chemd 需要把实验记录、编辑历史、人工修正、失败记录、实验结果和公开反应数据统一编译成可校验、可追溯、可持续派生训练样本的实验语义系统。

推荐总链路：

```text
实验记录 / 公开 XML / 专利数据
  -> source layer
  -> Chemd draft
  -> compile / validate
  -> semantic patch
  -> trainingUnderstanding
  -> Training Experience Memory
  -> Experiment Pattern Memory
  -> SFT / LoRA / DPO / eval / verifier datasets
```

核心建设方向：

- 加强守恒约束、阶段角色、步骤语义和证据链。
- 将 LLM 输出收敛为可验证的 semantic patch。
- 将 Git history 转换为结构化训练经验。
- 将同类实验的重复修正沉淀为 Experiment Pattern Memory。
- 将稳定实验模式提升为规则、模板、validator 和训练样本。
- 用时间切分和质量分层控制训练污染。

---

## 2. 机制化训练数据原则

参考论文：

- `D:\download\s41586-025-09426-9.pdf`
- `D:\huzhibin\Desktop\41586_2025_9426_MOESM1_ESM.pdf`

Chemd 后续训练数据应优先满足：

```text
source provenance
  -> semantic entities
  -> step graph
  -> conservation diagnostics
  -> temporal / phase roles
  -> quality tiers
  -> task projections
```

训练数据的最小可用单元应从完整文档降到事实、步骤、修正事件和任务样本：

```text
document quality
fact quality
step quality
patch quality
task-example quality
```

每条训练样本必须能追溯：

```text
source document
source revision
source span
entity ids
semantic diff
quality tier
training use
```

---

## 3. 守恒约束与化学验证

Chemd 应在 `validator`、`trainingUnderstanding` 或 chemical feature layer 中逐步加入：

```text
heavy_atom_balance
hydrogen_balance
charge_balance
electron_balance
reaction_center_consistency
stoichiometry_consistency
rdkit_validity
kekulization_status
```

早期实现可先落地诊断，完整 bond-electron matrix 放到后续 chemical feature 阶段。

优先诊断：

```text
reaction input/output 缺失关键原子
产物凭空出现
H / charge 明显不守恒
SMILES / InChI 无法解析
产率、当量、质量互相矛盾
强酸强碱在同一阶段无解释共存
Grignard reagent 与 protic reagent 在同一阶段无解释共存
```

这些诊断应进入训练质量层，影响：

```text
rag_eligible
sft_eligible
eval_eligible
regression_eligible
verifier_training_eligible
```

---

## 4. Step Graph 与运行时语义

Chemd 应继续强化从 procedure 到 step graph 的主链：

```text
procedure prose
  -> canonical step candidates
  -> step graph
  -> run plan
  -> trace / replay
  -> training export
```

每个 step 至少保留：

```text
step_id
family
params
inputs
outputs
depends_on
source_phrase
source_span
phase_role
lowering_confidence
review_status
```

公开 XML 的 `reactionAction` 可映射为 step candidate：

```text
Add        -> add / charge candidate
Stir       -> hold / stir candidate
Heat       -> heat candidate
Cool       -> cool candidate
Filter     -> filter candidate
Extract    -> extract candidate
Wash       -> wash candidate
Dry        -> dry candidate
Yield      -> result candidate
Unknown    -> unknown_step candidate
```

step candidate 应保留原始 `action`、`phraseText`、XML XPath 和参数。后续通过规则、模型和人工校验补全 `family`、`phase_role`、`inputs`、`outputs` 与 `depends_on`。

---

## 5. Phase Role 建模

公开专利数据和真实实验记录经常把核心反应、淬灭、后处理、纯化和分析物质混在同一个反应记录中。Chemd 需要将 phase role 作为一等语义。

推荐枚举：

```text
reaction_phase
addition_phase
quench_phase
workup_phase
purification_phase
analysis_phase
storage_phase
unknown_phase
```

同一物质在不同阶段可以拥有不同角色：

```text
HCl: reaction acid
HCl: workup acid
NaHCO3: quench reagent
water: reaction solvent
water: workup medium
base: reagent
base: proton acceptor in step
ethanol: recrystallization solvent
```

phase role 应用于：

```text
role classification
acid-base consistency
step dependency
workup conflict detection
prediction feature filtering
training sample quality
```

推荐诊断：

```text
E_PHASE_ROLE_UNKNOWN
E_WORKUP_REAGENT_AS_REACTANT
E_REACTION_WORKUP_CONFLICT
E_ACID_BASE_PHASE_CONFLICT
E_GRIGNARD_PROTIC_PHASE_CONFLICT
E_RESULT_VALUE_LEAKED_TO_REACTION_HINT
```

---

## 6. 机制模板与角色先验

Chemd 可新增轻量机制模板层：

```text
packages/reaction-mechanisms/
  templates/
  acid-base-rules/
  role-priors/
  phase-rules/
  mechanism-validators/
```

该层用于：

```text
判断步骤是否合理
识别缺失中间体
识别 workup 与核心反应混淆
提供 reaction-family role prior
提供 acid/base pKa 约束
生成 verifier 样本
生成 repair 样本
生成 reaction classification 样本
```

机制模板记录建议：

```json
{
  "template_id": "suzuki-coupling/base-role/v1",
  "reaction_family": "suzuki_coupling",
  "required_roles": ["aryl_halide", "boron_reagent", "base", "palladium_catalyst"],
  "common_phase_roles": {
    "base": "reaction_phase",
    "water": "reaction_phase_or_workup_phase"
  },
  "diagnostics": [
    "missing_palladium_catalyst",
    "base_as_primary_reactant"
  ]
}
```

模板应支持版本化、人工审核和数据支持计数。

---

## 7. Semantic Patch 管线

LLM、规则和外部工具的输出统一写成 semantic patch。

推荐链路：

```text
source / XML / Chemd draft
  -> candidate patches
  -> schema validation
  -> chemical validation
  -> conservation checks
  -> review status
  -> compile into trainingUnderstanding
```

patch 必须包含：

```text
patch_id
target
operation
value
evidence
confidence
producer_type
producer_version
review_status
quality_tier
```

示例：

```json
{
  "patch_id": "patch::US03936293::rxn1::temp-limit",
  "target": "step::US03936293::rxn1::action2",
  "operation": "classify_step_constraint",
  "value": {
    "family": "add",
    "constraint": "temperature <= 30 C"
  },
  "evidence": "The temperature should not exceed 30 deg",
  "confidence": 0.82,
  "producer_type": "llm",
  "producer_version": "chemd-enricher/v0.1",
  "review_status": "needs_review",
  "quality_tier": "silver"
}
```

patch 被接受后触发：

```text
recompile document
update diagnostics
update trainingUnderstanding
update Training Experience Memory
update task dataset delta
```

---

## 8. 公开 XML / 专利数据导入

公开 XML 中可确定映射的字段：

```text
documentId
paragraphText
reactionSmiles
reactantList / productList
name
SMILES / InChI
amount normalizedValue
reactionAction action
phraseText
Time / Temperature / Pressure
```

deterministic importer 职责：

```text
保留原始 XML
保留 XPath
保留 paragraphText
保留 reactionSmiles
保留 molecule identifiers
保留 amount 原值与 normalizedValue
保留 reactionAction 原始 action
输出 Chemd draft
输出 unknown role / unknown phase diagnostics
```

推荐三层：

```text
xml_source_layer
  原 XML 节点、XPath、原句、抽取字段

chemd_draft_layer
  Chemd document / molecules / reaction / result / procedure

semantic_enrichment_layer
  reaction role、step family、phase role、quality、task labels
```

映射规则：

```text
XML reaction
  -> Chemd document / reaction entity

reactantList / productList
  -> molecules + reaction participants

amount
  -> molecule.amount_value 或 result.isolated_mass

reactionActionList
  -> procedure_to_steps candidates

paragraphText
  -> source_layer.raw_source + retrieval chunk

reactionSmiles
  -> chemistry_feature_ref / reaction fingerprint source

Yield action
  -> result entity + result_describes_reaction link

Time / Temperature / Pressure
  -> normalized_conditions 或 step.params
```

需要语义增强的字段：

```text
solvent / reagent / catalyst / base role
workup vs reaction condition
Add vs charge vs quench
Precipitate 操作 / 现象判定
Unknown action 归类
yield basis: isolated / crude / inferred
failure reason
optimization variable
baseline / variant
reaction family
expert routing label
```

---

## 9. Training Experience Memory

Training Experience Memory 用于训练和评估数据生成，存储结构化训练事件、修正模式和数据投影。

它的输入：

```text
Git source diff
AST diff
semantic diff
human correction
annotation patch
diagnostic fix
failed model suggestion
accepted model suggestion
experiment outcome delta
same-family optimization trajectory
```

它的输出：

```text
SFT examples
DPO pairs
eval cases
verifier rules
router labels
negative samples
curriculum buckets
validator rules
quick fixes
```

推荐核心对象：

```text
training_experience_events
  单次可训练事件

correction_patterns
  多次事件聚合后的修正模式

pattern_promotions
  被提升为规则、模板、validator 或 quick fix 的记录

experiment_pattern_memory
  同类实验稳定模式、角色先验、阶段先验、变量-结果关系和推荐训练用途

dataset_projections
  从事件或模式派生出的训练 / 评估数据版本
```

训练事件示例：

```json
{
  "event_type": "role_correction",
  "reaction_family": "suzuki_coupling",
  "before": {
    "entity": "K2CO3",
    "role": "reactant"
  },
  "after": {
    "entity": "K2CO3",
    "role": "base"
  },
  "evidence": {
    "source_diff": "git diff hunk id",
    "semantic_diff": "semantic diff id",
    "support_count": 37
  },
  "training_uses": [
    "entity_role_classification",
    "chemd_repair",
    "verifier_training"
  ],
  "quality": {
    "tier": "gold",
    "human_verified": true,
    "leakage_risk": "low"
  }
}
```

---

## 10. Git Semantic Diff 管线

推荐管线：

```text
git commit pair
  -> compile old/new Chemd
  -> source diff
  -> AST diff
  -> entity alignment
  -> semantic diff
  -> quality gate
  -> training experience event
  -> correction pattern mining
  -> rule/template promotion
  -> task dataset projection
```

关键要求：

- 先编译 old/new 文档。
- 做 entity alignment，避免 ID 改名造成错误学习。
- 区分 source diff、structural diff、semantic diff。
- 保留 commit、author、time、review status、diagnostics。
- 对 yield prediction、condition recommendation 和 eval 构造执行 leakage control。
- 每个 semantic diff 标注 training uses。

semantic diff 输出：

```text
entity_created
entity_deleted
entity_renamed
field_changed
role_changed
phase_role_changed
relation_changed
quality_changed
diagnostic_fixed
result_updated
condition_updated
analysis_evidence_added
```

---

## 11. 同类实验聚合

Git history 需要从单次修正上升到同类实验聚合。

同类实验聚合的目标产物是 `Experiment Pattern Memory`。它聚合多条 `training_experience_events` 和 `correction_patterns`，形成可复用的实验族经验。

定位：

```text
Training Experience Memory:
  单次修正、单次 patch、单次 semantic diff、单次 outcome delta

Experiment Pattern Memory:
  同类实验反复出现的稳定写法、稳定错误、稳定修正、稳定变量和稳定结果关系
```

聚合维度：

```text
reaction_family
mechanism_family
step_family
reagent_role
phase_role
diagnostic_code
field_changed
result_type
failure_mode
```

示例模式：

```text
Pd catalyst: reagent -> catalyst
K2CO3: reactant -> base
water: reactant -> solvent/workup
yield: reaction hint -> result
NaHCO3: reactant -> quench reagent
ethanol: reactant -> recrystallization solvent
```

模式沉淀产物：

```text
reaction-family role prior
field normalization rule
diagnostic quick fix
importer mapping rule
training label
verifier rule
mechanism template update
```

`Experiment Pattern Memory` 推荐存储内容：

```text
experiment_pattern_id
pattern_scope
reaction_family
mechanism_family
step_sequence_signature
canonical_roles
canonical_phase_roles
common_field_corrections
common_diagnostics
controlled_variables
high_value_variables
outcome_delta_patterns
failure_mode_patterns
evidence_event_ids
support_count
confidence
training_uses
promotion_targets
quality_tier
```

示例：

```json
{
  "experiment_pattern_id": "pattern::suzuki-coupling::base-role::v1",
  "pattern_scope": "reaction_family",
  "reaction_family": "suzuki_coupling",
  "canonical_roles": {
    "aryl_halide": "reactant",
    "boron_reagent": "reactant",
    "palladium_complex": "catalyst",
    "carbonate": "base"
  },
  "canonical_phase_roles": {
    "carbonate": "reaction_phase",
    "water": "reaction_phase_or_workup_phase"
  },
  "common_field_corrections": [
    {
      "before": "K2CO3 as reactant",
      "after": "K2CO3 as base",
      "support_count": 37
    }
  ],
  "training_uses": [
    "entity_role_classification",
    "chemd_repair",
    "verifier_training",
    "condition_recommendation"
  ],
  "quality_tier": "gold"
}
```

`correction_patterns` 关键字段：

```text
pattern_id
reaction_family
source_field
old_role
new_role
evidence_phrase_pattern
support_count
confidence
promoted_to_rule
training_uses
quality_tier
```

`Experiment Pattern Memory` 与 `correction_patterns` 的关系：

```text
correction_patterns:
  聚焦某类字段或角色的重复修正

Experiment Pattern Memory:
  聚合多个 correction patterns，形成某类实验的完整经验画像
```

---

## 12. 降低训练成本的机制

### 12.1 减少人工标注

实验记录编辑和 review 本身生成监督信号。Chemd 将这些信号转化为结构化训练事件。

### 12.2 减少 LLM 调用

高频修正模式提升为规则、模板或 validator。后续同类样本由规则先处理，模型处理剩余歧义。

### 12.3 减少样本需求

同类实验共享结构。模型学习 reaction family、phase role、field correction 和 outcome delta 的可泛化模式。

### 12.4 提升训练集纯度

human correction、reviewed patch 和 accepted diff 的质量高于公开抽取数据的 noisy label。

### 12.5 支持时间切分评估

Git history 支持自然时间切分：

```text
past commits -> train
future commits -> eval
```

该方式更接近真实部署，并降低数据泄漏风险。

---

## 13. 与现有 Chemd 数据层的关系

现有分层继续保留：

```text
trainingExport:
  full audit 数据资产

ragExport:
  检索视图

trainingUnderstanding:
  实验知识图谱 / 训练母数据

taskDataset:
  任务化 SFT / eval 样本
```

Training Experience Memory 横跨 source diff 与 semantic diff：

```text
Chemd source history
  -> compile old/new
  -> trainingUnderstanding diff
  -> Training Experience Memory
  -> Experiment Pattern Memory
  -> taskDataset delta
```

Training Experience Memory 和 Experiment Pattern Memory 都是训练数据生成的母数据，应与 RAG index 分开管理。

### 13.1 PostgreSQL 存储实现基线

当前后端存储 contract 已落到 `@chemd/storage-postgres`。

实现范围：

```text
packages/storage-postgres
  -> SQL schema migration
  -> storage record types
  -> compiled output to records mapper
```

该包保持纯函数，不连接数据库，不读取环境变量，不绑定 ORM。

当前核心表：

```text
chemd_experiments
chemd_experiment_revisions
chemd_compile_runs
chemd_compile_artifacts
chemd_semantic_entities
chemd_semantic_relations
chemd_field_evidence
chemd_rag_chunks
chemd_embedding_models
chemd_rag_chunk_embeddings
chemd_semantic_diffs
chemd_training_experience_events
chemd_correction_patterns
chemd_experiment_pattern_memory
chemd_dataset_projections
```

写入主入口：

```text
buildExperimentStorageRecords()
```

输入：

```text
revision_id
source
trainingExport
trainingUnderstanding
ragExport
lnf
git metadata
```

输出：

```text
experiment
revision
compileRun
compileArtifact
semanticEntities
semanticRelations
fieldEvidence
ragChunks
```

下一阶段 runtime 写入层可放在：

```text
apps/web/src/server/chem
services/chem-service
```

runtime 写入层负责数据库连接、事务、upsert 顺序、embedding 生成和 pgvector index 维护。

---

## 14. 推荐落地顺序

### Phase 1：专利 XML deterministic importer

目标：

```text
公开 XML -> Chemd draft
```

要求：

- 保留 XML provenance / XPath。
- 保留 paragraphText。
- reactionAction 转 step candidate。
- 输出 phase unknown 和 role unknown diagnostics。

### Phase 2：phase role 与 role conflict diagnostics

目标：

```text
识别 reaction/workup/purification/analysis 阶段混淆
```

优先诊断：

```text
workup reagent as primary reactant
acid/base coexistence conflict
Grignard + protic acid/water conflict
result yield leakage into prediction input
```

### Phase 3：semantic patch queue

目标：

```text
LLM / 规则提交 patch
```

每个 patch 必须有：

```text
target
operation
value
evidence
confidence
model_or_rule_version
review_status
```

### Phase 4：Git semantic diff

目标：

```text
commit pair -> source/structural/semantic diff
```

输出：

```text
entity alignment
field changes
role changes
phase role changes
quality changes
diagnostic fixes
training uses
```

### Phase 5：Training Experience Memory

目标：

```text
semantic diff -> training experience events -> correction patterns
```

支持：

```text
pattern mining
rule promotion
dataset projection
time-split eval
```

### Phase 6：Experiment Pattern Memory

目标：

```text
training experience events
  -> correction patterns
  -> experiment patterns
  -> role priors / phase priors / validator rules / training datasets
```

支持：

```text
同类实验经验画像
稳定角色先验
稳定阶段先验
变量-结果关系聚合
失败模式聚合
规则和模板提升
```

### Phase 7：训练数据闭环

目标：

```text
Training Experience Memory
  -> Experiment Pattern Memory
  -> SFT / DPO / eval / verifier datasets
  -> model update
  -> reduced human corrections
  -> more training experience
```

---

## 15. 完成标准

该方向的阶段性完成标准：

- 公开 XML 可导入为 Chemd draft，并保留 source provenance。
- `reactionAction` 可生成 step candidates。
- phase role 可进入 semantic layer 或 trainingUnderstanding。
- role conflict 与 phase conflict 产生稳定 diagnostics。
- semantic patch 可被验证、review 和重新编译。
- Git commit pair 可生成 semantic diff。
- semantic diff 可生成 training experience events。
- 同类实验修正可聚合为 correction patterns。
- correction patterns 可聚合为 Experiment Pattern Memory。
- correction patterns 可派生训练样本、validator rule 或 quick fix。
- Experiment Pattern Memory 可派生 role prior、phase prior、mechanism template 和 family-specific datasets。
- task dataset 支持从 Training Experience Memory 增量生成。

---

## 16. 最终方向

Chemd 的训练基础设施应围绕以下链路建设：

```text
可维护实验记录
  -> 可编译实验语义
  -> 可验证训练经验
  -> 可投影训练数据
  -> 可持续更新模型
```

重点能力：

```text
机制步骤
守恒约束
阶段角色
证据链
质量门禁
Git semantic diff
Training Experience Memory
Experiment Pattern Memory
同类实验修正模式
```

该方向将 Chemd 从实验记录工具推进为持续降低训练成本、提高数据质量、沉淀同类实验经验的训练数据工厂。
