# chemd v0.3 实验理解、专家路由与训练架构

状态：架构设计稿
更新时间：2026-04-21
适用范围：`chemd` 训练基础设施、实验知识图谱、任务数据派生、专家路由、反应聚类与评估闭环

---

## 1. 目标

chemd 的目标是把实验记录编译成可校验、可追溯、可派生训练任务的实验知识结构。

推荐总链路：

```text
零散实验记录
  -> 大模型转写 / 整理为 Chemd
  -> Chemd 校验 / 格式化 / 规范化 / 解析 / 关联
  -> trainingUnderstanding 实验知识图谱
  -> 质量过滤 / 任务派生 / 评估集构造
  -> SFT / LoRA / RL / eval 数据
  -> 小模型学习实验内涵
  -> 反应分类 / 专家路由 / 产率预测 / 条件建议 / 实验方案
  -> 人工修正与实验结果回流
```

核心判断：

- 大模型主要承担转写器、整理器、教师模型和审阅器角色。
- 小模型的学习重点是从 `trainingUnderstanding` 派生出的实验内涵。
- Chemd 的训练扩展优先补强解析、规范化、投影、质量控制和任务数据派生层，语法复杂度保持受控。
- `trainingExport` 是 full audit 数据资产；`ragExport` 服务检索；`trainingUnderstanding` 是训练母数据；最终 LoRA/SFT JSONL 应从任务化 projection 派生。

---

## 2. 当前工程基线

当前仓库已经具备以下基础：

- `compileChemd()` 已能统一输出 `document / diagnostics / lnf / ragExport / trainingUnderstanding / trainingExport` 等结构。
- `ChemdTrainingExportV2` 是 full audit export，包含 source、semantic、learning、quality layers。
- `ChemdTrainingUnderstandingV1` 已包含实体、关系、引用、procedure/observation logic、experiment logic、knowledge graph、field evidence、missing logic、LoRA generation hints 和训练质量。
- `ChemdTrainingTaskDatasetV1` 已能从 `trainingUnderstanding` 派生部分实验决策任务样本。
- 当前已覆盖的任务类型包括：
  - `reaction_classification`
  - `expert_routing`
  - `yield_prediction`
  - `condition_recommendation`
  - `experiment_proposal`
  - `failure_analysis`
  - `experiment_comparison`

因此，v0.3 的重点是在现有 `exporter-training` 基础上补齐更完整的训练基础设施。

---

## 3. 角色分工

### 3.1 零散实验记录

输入可以来自：

- 实验 notebook
- Markdown
- Word / PDF / 图片 OCR
- ELN 导出
- 人工聊天记录
- 表格或批量实验数据

这些原始记录不直接进入 LoRA/SFT。它们先进入 Chemd 转写和结构化流程。

### 3.2 Chemd source

Chemd source 是用户可维护的实验代码。它应保持低心智写法：

```text
In THF at -78 C under nitrogen for 30 min.
```

用户侧无需强制写成：

```yaml
solvent: THF
temperature: -78 C
time: 30 min
atmosphere: nitrogen
```

后者应由 parser、normalizer 和 training projection 自动派生。

### 3.3 trainingExport

`trainingExport` 保留审计所需的完整信息：

- 原始快照
- resolved source
- raw children
- diagnostics
- semantic layer
- retrieval chunks
- prediction instances
- quality layer

它适合调试、追溯、重新投影，不适合直接喂给 LoRA/SFT。

### 3.4 ragExport

`ragExport` 是检索视图，只保留适合向量化和召回的 chunk、metadata 和质量信号。

它服务：

- 相似实验召回
- RAG 问答
- 失败案例检索
- 条件案例检索

RAG chunks 不等于 LoRA 数据。

### 3.5 trainingUnderstanding

`trainingUnderstanding` 是实验知识图谱层，也是训练母数据。

它覆盖以下内容：

- 反应是什么
- 反应物、产物、试剂、溶剂、催化剂和条件是什么
- 哪些条件是变量，哪些是控制变量
- 哪些结果对应哪个反应
- yield / conversion / selectivity / purity 的来源和可信度
- 哪些分析证据支持结果
- 哪些地方缺失、不确定、冲突
- 哪些实验是 baseline，哪些是 variant
- 哪些实验构成 optimization trajectory
- 哪些专家标签和路由依据可被派生

### 3.6 task dataset

最终训练集应从 `trainingUnderstanding` 派生为任务样本。

每条样本应包含：

- `task_type`
- `messages` 或结构化 input/output
- `source_document_id`
- `source_entity_ids`
- `quality.usable_for_sft`
- `quality.usable_for_eval`
- `evaluation.leakage_risk`
- `evaluation.target_fields`
- `derived_label_confidence`
- `warnings`

---

## 4. 小模型需要学习什么

小模型不需要先成为万能化学助手。它需要按任务学习实验内涵。

### 4.1 记录转写

任务：`record_to_chemd`

目标：

- 从零散自然语言、表格、OCR 结果中生成合法 Chemd。
- 保留不确定性和缺失信息。
- 不伪造未出现的实验事实。

这类能力可由大模型先产生 teacher data，再由小模型蒸馏。

### 4.2 Chemd 语法与规范

任务：`chemd_lint`、`chemd_repair`、`normalization_explanation`

目标：

- 判断 Chemd 是否合法。
- 发现缺字段、错单位、引用不明、结果未关联。
- 给出最小修复建议。
- 解释 raw value 如何归一到 typed value。

### 4.3 实体、角色和引用理解

任务：`entity_extraction`、`relation_extraction`、`reference_resolution`

目标：

- 识别 substrate、product、reagent、catalyst、ligand、solvent、base、additive。
- 识别 result、analysis、sample、procedure、observation。
- 建立 reaction/result/analysis/sample 之间的引用关系。

### 4.4 反应理解

任务：`reaction_classification`

目标：

- 输出 `reaction_family`。
- 输出 `transformation_tags`。
- 标记关键官能团、反应中心和推断置信度。
- 在证据不足时输出 `unknown`。

### 4.5 实验变量理解

任务：`experiment_comparison`、`optimization_trajectory`

目标：

- 识别 baseline、variant、single_run。
- 区分 changed variables 和 controlled variables。
- 判断哪个变量变化可能对应结果变化。
- 识别同一优化系列中的 best condition。

### 4.6 结果和证据可信度

任务：`outcome_quality`、`evidence_tracing`

目标：

- 区分 isolated yield、crude yield、NMR estimate、LCMS conversion。
- 判断结果是否有 analysis 支持。
- 标记冲突值、缺失值和不适合作为回归目标的数据。
- 输出是否适合 SFT、eval、regression 或仅适合 RAG。

### 4.7 预测和建议

任务：

- `yield_prediction`
- `condition_recommendation`
- `failure_analysis`
- `experiment_proposal`

目标：

- 对产率、转化率、选择性做保守预测。
- 基于已有实验系列提出下一步条件变化。
- 识别失败原因和优先检查项。
- 输出假设、证据、风险和不确定性。

### 4.8 专家路由

任务：`expert_routing`

目标：

- 从 reaction taxonomy、condition space、failure mode 和 task type 中派生专家标签。
- 输出 `expert_labels`、`routing_basis`、`confidence` 和 `warnings`。
- 为后续 LoRA adapter 或 MoE 专家提供稳定监督信号。

---

## 5. SFT、LoRA 和 RL 的分工

### 5.1 基础 SFT

基础 SFT 可以继续使用常规 instruction、reasoning、coding、scientific QA 数据集。

目的：

- 维持通用指令跟随能力。
- 维持基本推理和表达能力。
- 不让模型过早塌缩到单一 Chemd 风格。

### 5.2 领域 SFT / LoRA

领域样本应从 `trainingUnderstanding` 和 `ChemdTrainingTaskDatasetV1` 派生。

优先样本：

- 实验摘要
- 结构化抽取
- 引用解析
- 证据追踪
- 反应分类
- 专家路由
- 实验比较
- 失败分析
- 条件建议
- 方案生成

LoRA 按任务或专家拆分更利于控制能力边界和评估范围。

### 5.3 RL

RL 只应作用在 reward 明确的部分。

适合 RL 的 reward：

- Chemd 格式合法性
- parser / validator 通过率
- 字段完整率
- 引用解析一致性
- eval target 的预测误差
- routing label 准确率
- 不泄漏结果字段
- 输出是否引用证据

RL 排除项：

- 没有可验证标准的开放式实验建议
- 依赖未来实验验证但当前无反馈的数据
- 只靠文字好看程度判断的答案

---

## 6. 专家架构

### 6.1 推荐阶段

早期阶段避免直接实现重型稀疏 MoE。推荐阶段式架构：

```text
阶段 1：shared backbone + task heads
阶段 2：shared backbone + LoRA adapters + router
阶段 3：router + domain adapters + verifier
阶段 4：必要时再升级为真正 MoE
```

早期最稳妥的形式是：

```text
Base small model
  + shared Chemd encoder
  + task router
  + reaction-family router
  + LoRA adapters per expert
  + verifier / critic
```

### 6.2 任务专家

第一层按任务拆：

- `record_to_chemd_expert`
- `chemd_repair_expert`
- `reaction_classification_expert`
- `expert_routing_expert`
- `yield_prediction_expert`
- `condition_recommendation_expert`
- `failure_analysis_expert`
- `experiment_comparison_expert`
- `proposal_generation_expert`
- `quality_control_expert`

这是最容易落地的拆分。

### 6.3 反应家族专家

第二层按反应家族拆：

- `cross_coupling_expert`
- `oxidation_expert`
- `reduction_expert`
- `protection_expert`
- `deprotection_expert`
- `amidation_expert`
- `esterification_expert`
- `substitution_expert`
- `photochemistry_expert`
- `organocatalysis_expert`

当前 `TrainingReactionFamilyV1` 已有初始枚举。后续可以在保持兼容的前提下扩展 taxonomy。

### 6.4 决策专家

第三层按实验决策模式拆：

- `yield_optimization_expert`
- `condition_screening_expert`
- `scale_up_expert`
- `failed_reaction_diagnosis_expert`
- `analytical_interpretation_expert`
- `purification_expert`
- `safety_risk_expert`
- `missing_information_expert`

这些专家可以先作为 routing labels，后续再按数据规模独立成模型。

### 6.5 Router 输入与输出

Router 输入以 Chemd 派生结构为主：

```json
{
  "task_type": "condition_recommendation",
  "reaction_family": "cross_coupling",
  "transformation_tags": ["aryl_halide_cross_coupling"],
  "key_variables": ["base", "ligand", "solvent", "temperature"],
  "failure_modes": ["low_conversion"],
  "outcome_quality": {
    "yield_basis": "isolated",
    "yield_confidence": "confirmed"
  },
  "data_completeness": 0.82
}
```

输出：

```json
{
  "expert_labels": [
    "cross_coupling_expert",
    "palladium_catalysis_expert",
    "yield_optimization_expert"
  ],
  "routing_basis": [
    "reaction_family=cross_coupling",
    "key_variables=ligand,base,solvent",
    "task_type=condition_recommendation"
  ],
  "confidence": "high",
  "warnings": []
}
```

### 6.6 Verifier

专家输出后必须经过 verifier：

- source entity 引用存在性
- 推断与事实的边界
- 被标记为不可训练结果的使用情况
- 隐藏 target 泄漏情况
- missing logic 违反情况
- 超出证据范围的强结论

Verifier 可以先是规则和 schema 校验，后续再加入 critic model。

---

## 7. 反应聚类架构

反应聚类采用多视角 representation，文本 embedding 仅作为辅助信号。

### 7.1 Reaction representation

每个 reaction 生成统一表示：

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

### 7.2 分层聚类

推荐层级：

```text
Level 0: project / source / dataset
Level 1: broad reaction family
Level 2: transformation type
Level 3: reaction center / functional group change
Level 4: condition family
Level 5: substrate or product series
Level 6: optimization trajectory
```

示例：

```text
cross_coupling
  -> suzuki_coupling
  -> aryl_bromide + boronic_acid
  -> Pd / ligand / base screening
  -> same substrate series
  -> baseline -> variant -> best condition
```

### 7.3 聚类信号

聚类应组合以下信号：

- 规则 taxonomy：先给出稳定大类。
- 结构 fingerprint：基于反应物/产物结构差异。
- 条件空间：solvent、catalyst、ligand、base、temperature、time、concentration、atmosphere、equivalents。
- 结果模式：high yield、low conversion、decomposition、selectivity issue、purification failure。
- 轨迹关系：baseline、variant、best condition。
- 文本 embedding：作为召回辅助，不作为唯一依据。

### 7.4 聚类输出

建议新增 projection：

```json
{
  "cluster_id": "cluster::cross_coupling::suzuki::substrate-series-a",
  "cluster_level": "substrate_series",
  "reaction_entity_ids": ["rxn::doc1::a", "rxn::doc2::b"],
  "centroid_features": {
    "reaction_family": "cross_coupling",
    "key_variables": ["base", "ligand", "solvent"]
  },
  "quality": {
    "member_count": 12,
    "confidence": "medium",
    "warnings": []
  }
}
```

---

## 8. 充分利用 Chemd 的代码化语言

Chemd 的系统定位是实验代码。

### 8.1 AST / IR

训练数据从 AST / IR 派生，避免从源文本盲切。

```text
Chemd source
  -> AST
  -> resolved document
  -> normalized IR
  -> trainingUnderstanding
  -> task datasets
```

优势：

- 同一事实只解析一次。
- 字段、引用、关系和 provenance 可复用。
- SFT、RAG、eval 和预测数据保持一致。

### 8.2 Lint / Format / Typecheck

Chemd 应像代码一样有工具链：

```text
chemd format
chemd lint
chemd validate
chemd normalize
chemd export-rag
chemd export-understanding
chemd export-training-tasks
chemd export-eval
```

训练样本只有通过质量门禁后才能进入相应数据集。

### 8.3 Source diff / structural diff / semantic diff

当前 `git diff` 直接提供 Chemd 原始文本差异。该层必须保留，模型判断实验事实时使用 semantic diff 作为主输入。

推荐把 diff 拆成三层：

```text
git diff / source diff
  -> old Chemd parse / resolve / normalize
  -> new Chemd parse / resolve / normalize
  -> structural diff
  -> semantic diff
  -> task samples / eval / trajectory
```

#### Source diff

Source diff 是证据层，用于定义用户实际修改的文本范围。

用途：

- provenance 追溯
- 人工审查
- parser / normalizer debug
- 识别 LLM 转写后的人工修正
- 构造 `record_to_chemd`、`chemd_repair`、`correction_learning` 样本

示例：

```diff
- In THF at -78 C under nitrogen.
+ In THF at -78 C under nitrogen for 30 min.
```

Source diff 应保留 hunk、行号、文件路径、old/new commit、old/new text，并给后续 structural diff 提供证据引用。

#### Structural diff

Structural diff 是 Chemd AST / entity 对齐层，用于定义发生变化的 Chemd 块、实体和字段。

它负责处理：

- 格式化变化
- 块移动
- ID 改名
- 同一实体内容修改
- 新增或删除 reaction/result/analysis/sample
- source hunk 到 entity/field 的映射

Structural diff 不直接做化学推断，它只建立稳定对齐：

```json
{
  "entity_alignment": [
    {
      "old_entity_id": "rxn::exp-001::main",
      "new_entity_id": "rxn::exp-001::main",
      "status": "same_entity_modified",
      "changed_fields": ["conditions_raw"],
      "source_diff_hunk_ids": ["hunk-1"]
    }
  ]
}
```

#### Semantic diff

Semantic diff 是实验事实层，用于定义实验含义层面的变化。

示例：

```text
changed:
  catalyst: Pd(PPh3)4 -> Pd(dppf)Cl2
  yield: 35% -> 72%

unchanged:
  solvent: dioxane
  base: K2CO3
  temperature: 80 C
```

推荐输出：

```json
{
  "diff_type": "experiment_variant",
  "changed_variables": [
    {
      "field": "catalyst",
      "old_value": "Pd(PPh3)4",
      "new_value": "Pd(dppf)Cl2",
      "change_type": "modified"
    }
  ],
  "controlled_variables": ["solvent", "base", "temperature"],
  "outcome_delta": {
    "yield_percent": {
      "old": 35,
      "new": 72,
      "delta": 37
    }
  },
  "quality_delta": {
    "old_quality_tier": "silver",
    "new_quality_tier": "gold"
  },
  "training_uses": [
    "experiment_comparison",
    "optimization_trajectory",
    "condition_recommendation"
  ],
  "evidence": {
    "structural_diff_ids": ["entity-diff-1"],
    "source_diff_hunk_ids": ["hunk-1"]
  }
}
```

Semantic diff 必须能反指回 structural diff 和 source diff。否则模型或人工看到“催化剂变化导致产率变化”时，无法审计它来自哪几行文本。

这三层 diff 分别服务不同训练任务：

- source diff：训练转写修正、格式修复、人工 correction learning。
- structural diff：训练 entity alignment、字段变更识别、稳定 ID 对齐。
- semantic diff：训练实验比较、优化轨迹、条件建议、专家路由更新和 eval 构造。

### 8.4 Git history 作为优化轨迹

不需要把当前目标升级成 GitHub 协作平台，但应充分利用本地 Git 元数据。

Git history 可以派生：

- 实验优化序列
- 人工修正记录
- accepted / rejected model suggestion
- 质量变化轨迹
- 数据集版本和回滚点

示例：

```text
commit 1: baseline
commit 2: change base
commit 3: change solvent
commit 4: change ligand
commit 5: best condition
```

可以投影为：

```text
baseline -> variant A -> variant B -> best condition
```

### 8.5 Branch 表示实验假设

分支可以表示优化方向：

```text
main
branch/base-screening
branch/ligand-screening
branch/temperature-screening
```

这些分支不需要绑定 GitHub PR。它们可以在本地用于：

- 假设管理
- 实验计划对比
- 训练集 provenance
- 方案采纳 / 放弃记录

### 8.6 Review / annotation 作为监督信号

人工审查可以形成高质量监督：

- Chemd 转写哪里错了
- 哪个结果不适合进入训练
- 哪个 routing label 不合理
- 哪个失败原因判断错误
- 哪条建议被采纳或否决

当前已有 `ChemdTrainingAnnotationPatchV1` 的方向。后续应让 annotation patch 触发重新生成：

```text
annotation patch
  -> regenerate trainingUnderstanding
  -> regenerate task dataset
  -> update eval and train manifests
```

### 8.7 Blame / provenance

每条训练样本应能追溯：

```json
{
  "source_document_id": "exp-001",
  "source_entity_ids": ["rxn::exp-001::main", "res::exp-001::main"],
  "git_commit": "abc1234",
  "source_span": "lines 42-58",
  "projection_version": "chemd-training-task-dataset/v0.1",
  "human_verified": true,
  "quality_tier": "gold"
}
```

这能避免训练污染，并支持撤回错误样本。

---

## 9. 质量控制和防污染

训练小模型最怕噪音和泄漏。

### 9.1 数据分层原则

必须明确：

```text
full audit export != training data
RAG chunks != LoRA data
trainingUnderstanding != final SFT JSONL
```

最终训练样本必须经过任务化投影和质量过滤。

### 9.2 三层质量评分

质量评分至少拆成三层，避免只给整篇文档打一个 Gold / Silver / Bronze：

```text
source / document quality
  -> fact / entity quality
  -> task-example quality
```

原因是同一篇文档中可能同时存在：

- solvent 是 Gold
- time 是 Silver
- failure reason 是 Bronze
- yield target 是 Gold
- condition recommendation 样本只能是 Silver

#### Source / document tier

Source tier 判断整份来源的可靠度。

示例：

```json
{
  "source_tier": "silver",
  "source_type": "llm_transcribed_chemd",
  "human_verified": false,
  "llm_generated": true,
  "source_commit": "abc1234",
  "warnings": ["not fully human verified"]
}
```

推荐定义：

- Gold：人工写入或人工确认的 Chemd / 实验记录。
- Silver：LLM 转写，Chemd 校验通过，并通过抽样复核或一致性检查。
- Bronze：LLM 转写但未复核，字段缺失较多，仍可追溯。
- Rejected：来源不明、冲突严重、不可追溯或校验失败。

#### Fact / entity tier

Fact tier 判断每个关键事实的可靠度。

需要单独评分的事实包括：

- reaction family
- reactants / products
- solvent / catalyst / ligand / base / additive
- temperature / time / atmosphere / pressure
- yield / conversion / selectivity / purity
- result-reaction link
- analysis evidence
- failure mode
- expert routing label
- semantic diff field change

示例：

```json
{
  "field": "result.yield_percent",
  "value": 72,
  "fact_tier": "gold",
  "basis": "isolated",
  "confidence": "high",
  "evidence_entity_ids": ["res::exp-001::main"],
  "source_diff_hunk_ids": ["hunk-3"],
  "human_verified": true,
  "warnings": []
}
```

Fact tier 用于区分文档级可用性和字段级训练可用性。例如 NMR estimate 可以用于摘要，通常不作为 high-confidence yield regression target。

#### Task-example tier

Task tier 判断某条派生训练样本能否用于具体训练目标。

示例：

```json
{
  "task_type": "yield_prediction",
  "task_tier": "gold",
  "usable_for_sft": true,
  "usable_for_eval": true,
  "usable_for_regression": true,
  "usable_for_rl_reward": false,
  "leakage_risk": "low",
  "target_fields": ["yield_percent"],
  "warnings": []
}
```

同一个事实进入不同任务时等级可以不同：

```text
yield = Gold
  -> 实验摘要任务：Gold
  -> yield regression：Gold
  -> condition recommendation：Silver
  -> 机理解释任务：Bronze
```

每条最终训练样本至少输出：

- `source_tier`
- `fact_tiers`
- `task_tier`
- `human_verified`
- `human_corrected`
- `derived_label_confidence`
- `warnings`
- `leakage_risk`
- `usable_for_sft`
- `usable_for_eval`
- `usable_for_regression`
- `usable_for_rl_reward`

### 9.3 结果可信度

结果字段必须保留来源：

- isolated yield
- crude yield
- NMR estimate
- LCMS estimate
- conversion
- selectivity
- purity
- unknown

只有高质量 target 才能进入 regression。

### 9.4 泄漏控制

预测任务必须禁止把 target 泄漏进输入。

默认禁止作为 yield prediction 输入：

- result notes 中直接包含的产率描述
- analysis 中已经给出 yield 的结论
- reaction hint 中从结果复制来的 yield
- 后续实验的真实结果

### 9.5 数据等级

推荐分级：

```text
Gold: 人工确认，字段完整，target 来源清楚，可进 eval
Silver: 结构完整但部分推断，可进 SFT 或弱监督
Bronze: 只适合 RAG 或审计，不进监督训练
Rejected: 冲突严重或来源不可信，不进训练
```

这些等级作为训练准入条件，而非展示标签。

### 9.6 训练准入矩阵

推荐默认准入规则：

```text
Eval:
  只用 Gold task examples

Yield regression:
  Gold target + Gold/Silver condition facts
  禁止 Bronze target
  禁止 high leakage risk

SFT:
  Gold + high-confidence Silver
  Bronze 只在鲁棒性或纠错任务中少量使用

LoRA:
  Gold + Silver
  专家 LoRA 应按 task tier 和 expert label 分桶

RAG:
  Gold + Silver + Bronze
  Rejected 不进入 RAG，除非用于审计视图

RL reward:
  只用 Gold 或可程序验证项
  例如格式合法性、引用一致性、target leakage 检查

DPO / preference:
  只用人工偏好 Gold
```

推荐统一结构：

```json
{
  "quality": {
    "source_tier": "silver",
    "fact_tiers": {
      "reaction.normalized_conditions.solvent": "gold",
      "reaction.normalized_conditions.time": "silver",
      "result.yield_percent": "gold",
      "failure_signal": "bronze"
    },
    "task_tier": "silver",
    "usable_for": {
      "rag": true,
      "sft": true,
      "eval": false,
      "yield_regression": true,
      "rl_reward": false
    },
    "warnings": [
      "source generated by LLM and not fully human verified"
    ]
  }
}
```

---

## 10. 评估集和回流闭环

训练系统从初期开始建设 eval 集，并与 train 导出分离。

### 10.1 推荐评估任务

- 给定反应和条件，隐藏结果，让模型预测 yield。
- 给定 baseline 和 variant，让模型判断关键变量。
- 给定失败实验，让模型判断缺失信息或风险。
- 给定优化系列，让模型提出下一步，并和真实后续实验比较。
- 给定实验记录，让模型路由到专家标签。
- 给定 Chemd 片段，让模型判断是否可进入训练。

### 10.2 时间切分

实验预测和方案建议优先按时间切分：

```text
train = 早期实验
valid = 中期实验
test = 最新实验
```

避免同一优化系列随机泄漏。

### 10.3 回流数据

模型建议被使用后，应记录：

- suggestion id
- prompt / input context
- selected expert route
- human decision
- executed experiment
- observed outcome
- accepted / rejected reason
- follow-up correction

这些回流数据用于：

- 更新 routing labels
- 更新 condition recommendation 样本
- 构造 DPO / preference 数据
- 评估实验建议是否真的有效

---

## 11. 推荐新增能力

按优先级建议补以下能力。

### P0：训练任务 registry

统一登记所有可派生任务：

```json
{
  "task_type": "yield_prediction",
  "input_schema": "reaction + design_context",
  "output_schema": "observed_outcome",
  "quality_rules": ["has_linked_result", "target_usable_for_regression"],
  "usable_for_sft": true,
  "usable_for_eval": true,
  "usable_for_regression": true,
  "leakage_policy": "hide_result_text"
}
```

### P1：reaction taxonomy projection

从 `trainingUnderstanding` 派生：

- `reaction_family`
- `transformation_tags`
- reaction center hints
- functional group hints
- confidence
- evidence
- warnings

当前已有初始实现，后续重点是扩 taxonomy 和测试覆盖。

### P2：expert routing label export

从 taxonomy、task type、design context、failure signals 派生：

- `expert_labels`
- `routing_basis`
- `confidence`
- `warnings`

输出应稳定、保守、可人工修正。

### P3：optimization trajectory builder

把实验串成：

```text
baseline -> variant A -> variant B -> best condition
```

需要支持：

- 同文档内轨迹
- 跨文档轨迹
- 基于 Git history 的轨迹
- 基于 series id 的轨迹
- best condition 选择和警告

### P4：negative / failed experiment structure

失败实验必须结构化。

推荐 failure modes：

- no conversion
- low conversion
- low yield
- low selectivity
- low purity
- side reaction
- decomposition
- purification failure
- analytical uncertainty
- missing condition
- raw material issue
- operation issue

当前 `TrainingFailureModeV1` 已有初始枚举，后续可扩展。

### P5：source / structural / semantic diff pipeline

实现本地 Chemd diff pipeline，并保留裸 `git diff` 作为证据层。

三层输出：

- source diff：原始 Chemd 文本差异、hunk、行号、commit、文件路径。
- structural diff：AST diff、entity alignment、block diff、field diff、source hunk 映射。
- semantic diff：condition diff、outcome diff、quality diff、task dataset diff、training uses。

三层都要保留：

- source diff 是证据和审计基础。
- structural diff 是文本变化到实验实体的桥。
- semantic diff 是训练任务和实验轨迹的输入。

它是 Git history 转 optimization trajectory、human correction learning 和 eval dataset 的关键桥梁。

### P6：evaluation dataset export

新增独立 eval export：

```text
exports/eval/
  reaction_classification.jsonl
  expert_routing.jsonl
  yield_prediction.jsonl
  experiment_comparison.jsonl
  condition_recommendation.jsonl
  failure_analysis.jsonl
```

Eval export 默认隐藏 target，并记录 holdout 原因。

### P7：human annotation / correction loop

把人工修正变成一等数据：

- 修正 taxonomy
- 修正 expert routing
- 修正 failure signal
- 修正 optimization trajectory
- 拒绝不可信样本
- 标记 human verified

---

## 12. 推荐目录和产物

建议保持核心逻辑在 `packages/exporter-training`，训练脚本或数据集构造工具可以后续放到 `tools/training`。

推荐产物：

```text
exports/
  audit/
    training-export.ndjson
  rag/
    chunks.ndjson
  understanding/
    training-understanding.ndjson
  tasks/
    sft.jsonl
    eval.jsonl
    routing.jsonl
    prediction.parquet
  provenance/
    manifest.json
    source-map.ndjson
    annotation-patches.ndjson
```

推荐 manifest 字段：

```json
{
  "schema_version": "chemd-training-manifest/v0.1",
  "created_at": "2026-04-21T00:00:00Z",
  "source_commit": "abc1234",
  "projection_versions": {
    "training_export": "chemd-training-export/v0.2",
    "training_understanding": "chemd-training-understanding/v0.1",
    "task_dataset": "chemd-training-task-dataset/v0.1"
  },
  "counts": {
    "documents": 0,
    "task_examples": 0,
    "sft_eligible": 0,
    "eval_eligible": 0
  }
}
```

---

## 13. 端到端验收标准

### 数据层

- 同一 Chemd 文档重复导出结果稳定。
- 所有训练样本可追溯到 document、entity、projection version 和 source revision。
- RAG、SFT、eval、prediction 数据分层清楚。
- 被排除样本有明确原因。

### 小模型层

- 能完成记录转 Chemd 或 Chemd 修复。
- 能稳定输出反应分类和专家路由。
- 产率预测不泄漏 target。
- 条件建议能引用证据并区分事实和假设。
- 失败分析能输出 recommended checks，并避免泛泛建议。

### 专家层

- Router 能输出稳定 expert labels。
- 专家标签可人工修正并回流。
- 同一任务在相同输入下路由可复现。
- Verifier 能挡住无证据强结论和 target leakage。

### 聚类层

- 反应聚类使用结构、条件、结果和轨迹等多视角信号。
- 聚类能解释 family、transformation、condition 和 trajectory 依据。
- 相似实验召回能找到同类失败和同类优化案例。

### Git / 代码化层

- semantic diff 能识别实验事实变化。
- Git commit 能参与 provenance。
- 历史版本可重建当时的训练样本。
- 错误样本可按 commit 或 annotation patch 撤回。

---

## 14. 最终结论

Chemd 的核心价值是把实验记录变成实验代码，再把实验代码编译成训练数据工厂。

下一阶段优先补齐以下训练基础设施：

1. 训练任务 registry
2. reaction taxonomy projection
3. expert routing label export
4. optimization trajectory builder
5. failed experiment structure
6. semantic diff
7. evaluation dataset export
8. human annotation / correction loop
9. Git provenance and dataset manifest

最终目标是让模型学会：

- 如何把实验记录结构化
- 如何理解实验变量和结果证据
- 如何保守分类、路由、预测和建议
- 如何在不确定时拒绝过度推断
- 如何通过 Chemd 的代码化结构持续改进
