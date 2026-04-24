# Chemd LLM 数据、MoE 专家与持续学习架构

状态：讨论总结与架构建议
更新时间：2026-04-21
适用范围：Chemd-aware LLM、小模型、LoRA / MoE 专家、反应聚类、训练数据工程、持续学习闭环

---

## 1. 核心判断

Chemd 的核心优势来自训练范式调整：

```text
自然语言 / 实验目标
  -> 可编译 Chemd code
  -> compiler / validator
  -> trainingUnderstanding
  -> 专家路由 / 预测 / 建议 / 评估
```

训练目标聚焦于两类能力：

```text
LLM:
  生成合法、可编译、可修复的 Chemd 实验代码

系统:
  将 Chemd 编译为可审计实验语义和训练样本
```

该范式优先要求高质量、可校验、可回流的结构化监督。Chemd 数据的关键指标是有效结构化样本数、质量分层和可追溯性。

---

## 2. 参考 MOSAIC 的关键事实

参考文件：

- `D:\download\s41586-026-10131-4 (2).pdf`
- `D:\download\41586_2026_10131_MOESM1_ESM.pdf`

MOSAIC 的关键量级：

- 原始 Pistachio 数据约 `5M` reactions。
- 反应空间建模筛到约 `3.7M` labeled reactions，覆盖 `2,285` reaction classes。
- 完整专家训练 protocol 约 `1M` 条。
- 使用 `2,498` 个 Voronoi experts。
- 平均每个 expert 约 `400` 条完整反应。
- 最大 cluster 不超过约 `3,200` 条。
- 使用 Llama-3.1-8B-Instruct + LoRA。
- LoRA rank 为 `16`，adapter 约 `44M` 参数。
- 实验验证报告总体成功率约 `71%`。

这些事实给出以下设计启示：

- 每个专家不一定需要海量数据。
- 但专家 cluster 必须化学相近、过程完整、路由可靠。
- 完整实验 protocol 比单纯 reaction label 更重要。
- 距离 / confidence / reference trails 是实际部署时的关键安全层。

Chemd 相关系统的差异化重点：

- 更结构化的实验语义。
- 更强的质量分层。
- 更可靠的 semantic diff。
- 更好的 trajectory 和 feedback loop。
- 更可验证的 Chemd code 输出。

---

## 3. 数据层分工

Chemd 系统需要四类数据，各自作用不同。

### 3.1 通用化学语料

作用：让模型具备基础化学知识和科学语言能力。

包括：

- 教材、综述、论文、专利。
- 化学 QA。
- 反应机理和实验操作说明。
- 安全、纯化、分析表征知识。

它适合用于 continued pretraining 或通用化学 SFT。

### 3.2 结构化反应数据

作用：训练 reaction router、reaction fingerprint、reaction taxonomy、反应空间聚类。

包括：

- reaction SMILES。
- reactants / products。
- reaction class labels。
- reagent / solvent labels。
- atom mapping。
- reaction fingerprints。

这类数据不一定有完整过程，但适合训练反应空间表示。

### 3.3 完整 reaction protocol

作用：让专家学习真实实验过程。

包括：

- reagent / solvent / catalyst / ligand。
- stoichiometry。
- temperature / time / atmosphere。
- addition order。
- workup / purification。
- yield / characterization。

这类数据是 domain experts 的主体训练材料。

### 3.4 Chemd 数据

作用：让模型学会写可编译实验代码，并让系统派生实验语义。

包括：

- `raw_record -> Chemd`
- `Chemd -> diagnostics`
- `bad Chemd -> repaired Chemd`
- `Chemd -> trainingUnderstanding`
- `trainingUnderstanding -> task examples`
- `old Chemd + new Chemd -> source / structural / semantic diff`
- `baseline + variant -> experiment comparison`
- `trajectory -> next experiment proposal`
- `human correction -> corrected task sample`

Chemd 数据提供普通化学数据集缺少的结构化监督。

---

## 4. 推荐数据规模

数据建设采用分阶段目标。

| 数据层 | MVP | 强可用 | 很强 |
|---|---:|---:|---:|
| 通用化学文本 | 1-3B tokens | 5-10B tokens | 10-30B tokens |
| 结构化反应数据 | 50w-100w | 100w-300w | 300w-500w |
| 完整实验 protocol | 5w-20w | 20w-50w | 50w-100w |
| Chemd Gold | 2k-1w | 1w-5w | 5w-10w |
| Chemd Silver | 2w-10w | 10w-50w | 50w-100w |
| Chemd 派生任务 | 20w-100w | 100w-500w | 500w-1000w |
| semantic diff / trajectory | 5k-2w | 2w-10w | 10w-50w |
| 人工 eval / preference | 1k-5k | 5k-2w | 2w-5w |

在 Chemd 架构下，`10w` 高质量 Chemd 已经很强。因为一条 Chemd 文档可以派生多种任务：

```text
1 Chemd 文档
  -> AST
  -> normalized facts
  -> trainingUnderstanding
  -> reaction taxonomy
  -> expert routing
  -> quality labels
  -> prediction instances
  -> semantic diff
  -> eval samples
```

---

## 5. Gold / Silver / Bronze 质量分层

所有数据都要分层评分，避免只给整篇文档打一个等级。

推荐三层评分：

```text
source / document quality
  -> fact / entity quality
  -> task-example quality
```

### 5.1 Source tier

判断整份来源的可靠度。

```text
Gold:
  人工写入或人工确认的 Chemd / 实验记录

Silver:
  LLM 转写 + Chemd 校验通过 + 抽样复核或一致性检查通过

Bronze:
  LLM 转写但未复核，字段缺失较多，仍可追溯

Rejected:
  来源不明、冲突严重、不可追溯或校验失败
```

### 5.2 Fact tier

判断每个关键事实的可靠度。

需要评分的事实包括：

- reaction family。
- reactants / products。
- solvent / catalyst / ligand / base / additive。
- temperature / time / atmosphere / pressure。
- yield / conversion / selectivity / purity。
- result-reaction link。
- analysis evidence。
- failure mode。
- expert routing label。
- semantic diff field change。

### 5.3 Task tier

判断每条派生任务样本能否进入训练或评估。

推荐准入规则：

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

RAG:
  Gold + Silver + Bronze

RL reward:
  只用 Gold 或可程序验证项

DPO / preference:
  只用人工偏好 Gold
```

---

## 6. 训练阶段设计

### 6.1 阶段 A：基础化学能力

目标：让模型懂基本化学和实验语言。

数据：

- 通用化学文本。
- 结构化反应数据。
- 完整实验 protocol。
- 化学 QA。

训练方式：

- continued pretraining。
- 通用化学 SFT。
- reaction classification / reagent prediction 辅助任务。

### 6.2 阶段 B：Chemd 编程能力

目标：让模型学会写可编译 Chemd。

数据：

- `raw_record -> Chemd`
- `bad Chemd -> repaired Chemd`
- `Chemd -> diagnostics`
- `source diff -> correction`

训练任务：

- `record_to_chemd`
- `chemd_repair`
- `missing_information_detection`
- `diagnostic_explanation`
- `format_and_lint`

### 6.3 阶段 C：实验语义能力

目标：让模型学会消费 `trainingUnderstanding`。

数据：

- `Chemd -> trainingUnderstanding`
- reaction taxonomy。
- evidence tracing。
- outcome quality。
- expert routing。
- semantic diff。

训练任务：

- `reaction_classification`
- `expert_routing`
- `outcome_quality`
- `evidence_tracing`
- `experiment_comparison`

### 6.4 阶段 D：专家决策能力

目标：让模型给出可审计的预测和建议。

数据：

- 完整 protocol。
- optimization trajectory。
- failed experiment structure。
- human correction。
- executed suggestion feedback。

训练任务：

- `yield_prediction`
- `condition_recommendation`
- `failure_analysis`
- `experiment_proposal`
- `verifier / critic`

---

## 7. 多层 MoE / 专家架构

专家体系采用可组合架构，避免 domain × task 的笛卡尔积造成专家数量膨胀：

```text
Base chemistry model
  -> Chemd writer
  -> Chemd compiler
  -> trainingUnderstanding
  -> semantic router
  -> domain expert / task expert / verifier
  -> structured answer
```

### 7.1 专家层级

推荐四类专家：

```text
Domain experts:
  按反应空间聚类，例如 cross-coupling、oxidation、reduction

Task experts:
  按任务拆分，例如 Chemd repair、yield prediction、failure analysis

Quality / verifier experts:
  检查证据、泄漏、质量等级、安全边界

Routing / retrieval experts:
  负责 top-k expert selection 和 reference trails
```

早期建议：

```text
domain experts: 50-200
task experts: 8-12
quality/verifier experts: 3-5
```

强可用阶段：

```text
domain experts: 200-1000
task experts: 10-30
quality/verifier experts: 5-10
```

### 7.2 每个专家的数据量

专家样本密度参考外部 domain-expert 系统经验，并按 Chemd 数据质量调整。

建议：

```text
最低：300-400 条完整 protocol
较稳：500-1000 条
强专家：1000-3000 条
```

如果某个细类只有几十条，建议合并到机制相近的父类。

---

## 8. 化学反应聚类

反应聚类是专家路由的核心。

反应聚类采用多视角信号，避免只按反应名称或文本 embedding 聚类：

```text
结构相似
  + 转化相似
  + 条件逻辑相似
  + 实验结果模式相似
  + Chemd 语义相似
```

### 8.1 Reaction representation

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

### 8.2 粗分再细聚

先按 coarse taxonomy 分区：

```text
cross_coupling
oxidation
reduction
amidation
esterification
protection
deprotection
substitution
addition
elimination
photochemistry
unknown
```

然后在大类内部做细聚类。

例如：

```text
cross_coupling
  -> Suzuki
  -> Buchwald-Hartwig
  -> Heck
  -> Sonogashira
  -> Negishi
  -> Stille
  -> Ullmann / Goldberg
```

再往下：

```text
Buchwald-Hartwig
  -> aryl bromide C-N coupling
  -> aryl chloride C-N coupling
  -> heteroaryl chloride C-N coupling
  -> triflate C-N coupling
  -> secondary amine coupling
  -> aniline coupling
```

### 8.3 Condition-aware 聚类

Chemd 的条件结构化能力适合用于 condition-aware 聚类。

同样是 Buchwald-Hartwig，实验逻辑可能完全不同：

```text
Pd/XPhos + strong base + dioxane
Pd/BINAP + NaOtBu + toluene
Cu/ligand Ullmann-like
SNAr-like no metal
```

聚类要考虑：

- catalyst metal。
- ligand family。
- base strength。
- solvent polarity。
- temperature bucket。
- substrate electronics。
- heteroaryl / aryl。
- leaving group。
- nucleophile class。

### 8.4 算法建议

MVP：

```text
规则 taxonomy
  + reaction fingerprints
  + condition vector
  -> MiniBatchKMeans / HDBSCAN
```

强版本：

```text
reactant/product fingerprint
  + reaction class label
  + condition vector
  + Chemd semantic tags
  -> learned reaction embedding
  -> FAISS / HNSW
  -> balanced clustering
```

这个 learned embedding 可以称为：

```text
CRSF: Chemd Reaction Semantic Fingerprint
```

### 8.5 Cluster quality check

每个 cluster 输出质量报告：

```json
{
  "cluster_id": "cluster-cross-coupling-042",
  "size": 842,
  "dominant_reaction_family": "buchwald_hartwig",
  "purity": 0.72,
  "condition_diversity": 0.48,
  "median_centroid_distance": 83.2,
  "outlier_rate": 0.06,
  "recommended_action": "train_expert"
}
```

处理规则：

```text
size 太小：merge
size 太大：split
purity 太低：recluster
outlier 太多：清洗
condition diversity 太高：按条件再拆
```

### 8.6 Top-k 专家路由

一个反应可以路由到多个专家。

推荐 top-k routing：

```json
{
  "experts": [
    "buchwald_hartwig_aryl_chloride",
    "snar_heteroaryl_chloride",
    "palladium_catalysis",
    "yield_optimization"
  ],
  "weights": [0.45, 0.25, 0.20, 0.10]
}
```

边界反应、机制不确定反应、低 confidence 反应尤其需要 top-k。

---

## 9. Source / structural / semantic diff

原文 diff 和语义 diff 都要保留。

推荐三层：

```text
source diff
  -> structural diff
  -> semantic diff
```

### 9.1 Source diff

定义用户实际修改的文本范围。

用途：

- provenance。
- 人工审查。
- parser / normalizer debug。
- `record_to_chemd`。
- `chemd_repair`。
- `correction_learning`。

### 9.2 Structural diff

定义发生变化的 Chemd 块、实体和字段。

用途：

- AST diff。
- entity alignment。
- block diff。
- field diff。
- source hunk 到 entity/field 的映射。

### 9.3 Semantic diff

定义实验事实层面的变化。

输出：

- changed variables。
- controlled variables。
- outcome delta。
- quality delta。
- training uses。
- source / structural evidence links。

Semantic diff 必须能反指 source diff 和 structural diff。

---

## 10. 持续学习架构

RAG 提供新记录的检索能力。router、cluster、expert 和 verifier 的能力更新依赖结构化记忆、训练样本增量和周期性模型更新。

Chemd 系统需要三种记忆：

```text
RAG 记忆：
  能查到新实验

结构化记忆：
  能统计、比较、路由和建轨迹

参数记忆：
  通过周期性更新 router / expert / verifier 内化新经验
```

### 10.1 实时更新

每条新 Chemd 写入后：

```text
Chemd write
  -> compile / validate
  -> trainingUnderstanding
  -> quality tier
  -> RAG index update
  -> reaction cluster update
  -> outcome statistics update
  -> semantic diff / trajectory update
  -> task dataset delta
```

### 10.2 短周期更新

每日或每周更新：

- cluster profile。
- routing confidence。
- failure mode statistics。
- outcome quality statistics。
- high-value eval candidate pool。

### 10.3 中周期训练

触发条件示例：

```text
cluster_new_gold >= 100
cluster_new_silver >= 500
new_failure_modes >= 50
new_trajectory_count >= 20
outlier_cluster_size >= 300
human_corrections >= 100
```

更新对象：

- router。
- classifier。
- verifier。
- small task models。

### 10.4 长周期专家更新

按月或按数据阈值更新：

- domain LoRA。
- task LoRA。
- new cluster expert。
- merged / split experts。

每条实验写入后先进入结构化 memory 和 RAG，再按阈值触发周期性训练。

---

## 11. 必要存储

至少需要以下存储层：

```text
Source store:
  Chemd 文件、git commit、source diff

Knowledge graph store:
  reaction/result/analysis/sample/procedure/observation

Vector store:
  rag chunks、reaction embeddings、procedure embeddings

Cluster store:
  cluster profiles、expert labels、centroid、member ids

Dataset store:
  task examples、quality tiers、train/eval split

Feedback store:
  model suggestions、human decisions、experiment outcomes

Model registry:
  expert versions、router versions、eval reports
```

---

## 12. RAG 的边界

RAG 无法独立解决：

- router 什么时候切换专家。
- 某类条件是否真的更好。
- 哪些失败模式变多。
- 产率预测模型如何校准。
- 哪些新反应空间需要新专家。
- 哪些人工修正代表模型长期误差。
- 哪些建议被实验验证成功。

这些需要：

- structured memory。
- semantic diff。
- trajectory builder。
- quality tier。
- feedback store。
- periodic expert update。

---

## 13. 推荐实施路线

### P0：Chemd 编译和质量门禁

- 稳定 `Chemd -> trainingUnderstanding`。
- 完成 source / fact / task 三层质量评分。
- 保证所有训练样本可追溯。

### P1：Chemd 编程模型

- 训练 `record_to_chemd`。
- 训练 `chemd_repair`。
- 训练 diagnostics explanation。
- 建立 Gold eval。

### P2：反应聚类和专家路由

- 实现 reaction representation。
- 先做 coarse taxonomy。
- 再做 condition-aware clustering。
- 输出 top-k expert labels。

### P3：semantic diff 和 trajectory

- 实现 source / structural / semantic diff。
- 构建 baseline / variant / best condition。
- 派生 experiment comparison 和 condition recommendation 样本。

### P4：持续学习闭环

- 新实验写入后实时更新 RAG 和 structured memory。
- 周期性更新 router、cluster profile、verifier。
- 按阈值增量训练专家 LoRA。

### P5：模型决策能力

- yield prediction。
- failure analysis。
- condition recommendation。
- experiment proposal。
- verifier / critic。

---

## 14. 最终结论

Chemd 的目标架构：

```text
实验代码语言
  + 编译器
  + 实验知识图谱
  + 专家路由系统
  + 持续学习数据工厂
```

最终系统的优势来自：

- LLM 学写可编译 Chemd，并通过 compiler / validator 约束输出。
- Chemd 编译器把代码转成实验语义。
- 反应聚类使用结构、条件、结果和轨迹等多视角信号。
- 质量评分覆盖 source、fact、task 三层。
- 每条新实验记录都能更新 RAG、structured memory、cluster 和训练样本。
- 专家模型通过周期性增量训练吸收新经验。

最终系统将实验经验转化为代码、语义、数据和持续进化的专家系统。
