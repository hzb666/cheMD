# Chemd 模型、知识更新与反应预测架构

状态：架构设计稿  
更新时间：2026-04-26  
适用范围：Chemd DSL、Chemd-aware LLM、实时实验数据库、反应预测模型、专家路由、聚类检索、知识更新闭环

---

## 1. 核心定位

Chemd 不是一个普通化学聊天模型。Chemd 是一套面向化学实验的语义编程语言，用来让模型更规范、更高效地学习、理解、检索和预测化学实验。

Chemd 的目标不是让 LLM 直接“凭记忆回答”。目标是建立一个可编译、可追溯、可训练、可预测的实验知识系统：

```text
自然实验记录
  -> Chemd source
  -> Chemd AST
  -> 语义图 / 步骤图 / 条件图 / 结果图
  -> 实时实验数据库
  -> 聚类检索 / 专家路由 / 预测模型
  -> 新实验方案和实验记录
  -> 实验结果回流
```

因此，系统的中心不是聊天界面，而是：

- **Chemd DSL**：化学实验的结构化语义语言。
- **Chemd compiler**：语法、引用、单位、步骤、结果和质量的裁判。
- **Chemd-aware LLM**：能读写 Chemd、解释 Chemd、修复 Chemd 的语言模型。
- **Reaction predictor**：从结构、条件、步骤和历史结果中学习规律的预测核心。
- **Live experiment database**：实时吸收用户实验报告的快知识层。
- **Knowledge update loop**：把真实实验反馈变成可追溯的训练和评估数据。

一句话定义：

```text
Chemd = 化学实验 DSL + 编译器 + 训练语言 + 实时知识库 + 预测闭环
```

---

## 2. 设计原则

### 2.1 LLM 不是唯一知识源

模型权重里的知识是慢知识，适合承载通用化学规律、文献常识、Chemd 语法和表达能力。

用户实时录入的实验报告是快知识，应该先进入数据库和检索索引，而不是立即写入模型权重。

推荐分层：

```text
慢知识：base model / fine-tuned weights / expert adapters
快知识：实时实验数据库 / 向量索引 / 图数据库 / feature store
语义中间层：Chemd source / AST / semantic graph / step graph
```

### 2.2 预测模型是科学核心

LLM 可以生成实验记录和解释预测，但不应该单独承担最终预测责任。

真正的预测核心应显式学习：

- 分子结构和反应中心。
- 反应物、产物、试剂、催化剂、溶剂、碱、添加剂。
- 温度、时间、浓度、压力、气氛、当量和加料顺序。
- procedure step graph。
- observation 和 failure signal。
- yield、conversion、selectivity、purity。
- provenance、质量等级和不确定性。

LLM 的主要职责：

- 把自然语言转为 Chemd。
- 根据 Chemd 编译结果修复结构。
- 调用检索、聚类和预测工具。
- 把模型预测写成合理的 Chemd 实验方案。
- 解释依据、相似案例、风险和不确定性。

### 2.3 Chemd compiler 是语义裁判

所有进入训练、检索、预测和知识更新的数据，都应经过 Chemd compiler。

Compiler 负责：

- parse：语法解析。
- resolve：引用解析。
- typecheck：单位、数量、角色和结果类型检查。
- normalize：结构和条件归一化。
- step graph：实验步骤结构化。
- semantic graph：反应、结果、分析和样品关系建模。
- training export：生成训练母数据。
- semantic diff：比较实验事实变化。
- quality gate：判断能否进入 RAG、SFT、eval 或预测训练。

### 2.4 实时更新不等于实时改权重

实时录入实验报告后，系统应该立即更新：

- document store。
- semantic graph store。
- vector index。
- reaction feature store。
- cluster memory。
- retrieval cache。

但主模型权重和专家 adapter 应周期性更新。

```text
实时更新：数据库、索引、检索、统计、最近邻、cluster memory
周期更新：SFT、LoRA、专家 adapter、prediction heads、评估集
```

这样可以避免：

- 错误实验污染模型权重。
- 灾难性遗忘。
- 无法追溯错误来源。
- 内部实验数据和公开知识混淆。

---

## 3. 总体架构

Chemd 系统可以分为九层。

```text
L0 用户输入层
L1 Chemd 写入与修复层
L2 Chemd 编译与语义层
L3 实时实验知识库
L4 表征、特征与索引层
L5 聚类、检索与专家路由层
L6 反应预测层
L7 实验方案生成与验证层
L8 知识更新与模型发布层
```

### 3.1 L0：用户输入层

输入来源包括：

- 人工录入实验报告。
- ELN 导出。
- Markdown / Word / PDF。
- 图片 OCR。
- 文献或专利片段。
- 表格型反应筛选数据。
- 用户提出的目标反应或目标产物。

原始输入不直接进入预测模型。它先被转成 Chemd。

### 3.2 L1：Chemd 写入与修复层

这一层由 Chemd-aware LLM 和 repair loop 组成。

主要任务：

- `record_to_chemd`：自然实验记录转 Chemd。
- `chemd_repair`：根据 compiler diagnostics 修复 Chemd。
- `chemd_completion`：补齐明确缺失但可从上下文推出的结构。
- `uncertainty_marking`：不确定事实必须显式标注。

边界：

- LLM 不允许伪造未出现的实验事实。
- LLM 不能把预测结果写成已观察结果。
- LLM 必须区分 observation、inference 和 proposal。

### 3.3 L2：Chemd 编译与语义层

Chemd compiler 把 source 编译成多种中间表示：

```text
Chemd source
  -> AST
  -> resolved document
  -> typed semantic graph
  -> step graph
  -> canonical LNF
  -> training export
  -> RAG export
  -> training understanding
```

这些中间表示是训练和预测的事实来源。

### 3.4 L3：实时实验知识库

实时知识库保存用户实验和系统派生知识。

推荐存储：

- 原始输入。
- Chemd source。
- 编译诊断。
- AST / semantic graph。
- step graph。
- normalized conditions。
- reaction features。
- result labels。
- observation events。
- semantic diff。
- provenance。
- human annotation。
- prediction records。
- executed proposal outcomes。

实时知识库不是普通文本库，而是实验知识图谱和特征库。

### 3.5 L4：表征、特征与索引层

每条反应应生成统一 reaction representation。

```text
reaction representation =
  molecular graph features
  + reaction fingerprint
  + reaction center hints
  + role vector
  + condition vector
  + procedure step graph embedding
  + outcome vector
  + failure signal vector
  + Chemd semantic graph embedding
  + quality and provenance features
```

对应索引：

- exact index：按分子、CAS、SMILES、Chemd ID 精确查找。
- graph index：按反应实体和关系查找。
- vector index：按反应表征近邻检索。
- condition index：按条件空间检索。
- trajectory index：按优化序列检索。
- failure index：按失败模式检索。

### 3.6 L5：聚类、检索与专家路由层

这一层借鉴 MOSAIC 的思想，但以 Chemd 语义为中心。

MOSAIC 的关键不是重写 Llama，而是：

```text
reaction metric model
  -> reaction-space fingerprint
  -> FAISS Voronoi clusters
  -> cluster-specific LoRA experts
  -> expert routing and confidence
```

Chemd 可以采用类似路线：

```text
Chemd semantic graph
  + reaction fingerprint
  + condition vector
  + step graph
  -> reaction embedding
  -> FAISS / HNSW cluster
  -> nearest experiments
  -> expert adapters
  -> prediction ensemble
```

Router 输出：

- reaction family。
- cluster id。
- nearest experiments。
- expert labels。
- confidence。
- out-of-distribution signal。
- recommended prediction models。

### 3.7 L6：反应预测层

这是系统的科学核心。

预测任务包括：

- reaction success。
- yield。
- conversion。
- selectivity。
- purity。
- failure risk。
- condition recommendation。
- next experiment proposal。
- scale-up risk。
- analytical uncertainty。

推荐用 ensemble，而不是单一 LLM：

```text
KNN baseline
  + gradient boosted trees
  + graph neural encoder
  + condition/procedure encoder
  + cluster expert head
  + calibrated uncertainty model
```

输出必须包含：

- prediction。
- confidence。
- uncertainty interval。
- evidence experiments。
- distance to training data。
- OOD warning。
- key variables。
- failure risks。

### 3.8 L7：实验方案生成与验证层

LLM 根据预测结果生成 Chemd proposal。

生成内容包括：

- 目标反应。
- 推荐条件。
- 实验步骤。
- 监测方法。
- workup。
- purification。
- 预期结果。
- 风险和替代方案。
- 相似实验依据。

生成后必须重新进入 compiler：

```text
LLM proposal
  -> Chemd compile
  -> verifier
  -> leakage check
  -> safety/risk check
  -> final protocol
```

### 3.9 L8：知识更新与模型发布层

当用户执行实验并录入结果后：

```text
executed experiment
  -> Chemd record
  -> compile
  -> compare with proposal
  -> semantic diff
  -> prediction error
  -> update live database
  -> update cluster statistics
  -> generate training samples
  -> periodic model/adapters release
```

这一层负责把真实反馈变成长期知识。

---

## 4. 模型内部架构

Chemd 最终可以发布为一个 LLM 产品，但内部不应只是一个裸 LLM。

推荐结构：

```text
Chemd-LLM System
  = base LLM
  + chemical continued pretraining
  + Chemd SFT
  + Chemd tokenizer / grammar constraints
  + retrieval router
  + reaction representation model
  + prediction heads
  + LoRA expert adapters
  + compiler verifier
  + live experiment database
```

### 4.1 Base LLM

基座可以选择 Llama、Qwen、DeepSeek、Mistral 等开源模型。

选择标准：

- 长上下文能力。
- 工具调用能力。
- 代码和结构化输出能力。
- LoRA / adapter 生态。
- 推理成本。
- 私有部署可行性。

基座模型提供通用语言、推理和化学常识，但它本身不理解 Chemd 的完整语义。

### 4.2 化学继续预训练

目标是让模型掌握通用化学知识和表达方式。

数据来源：

- 反应数据库。
- 文献摘要和实验部分。
- 专利实验例。
- SMILES / reaction SMILES / SELFIES。
- reaction SMARTS。
- name reaction 资料。
- 光谱和分析文本。
- 安全和操作规范。

训练目标：

- chemical language modeling。
- SMILES / reaction SMILES 理解。
- 条件、产率、机理和步骤关联。
- 反应类型和常见失败模式。

### 4.3 Chemd SFT

目标是让模型学会 Chemd 语言。

核心任务：

- 自然实验记录转 Chemd。
- Chemd 转自然语言解释。
- Chemd repair。
- Chemd semantic diff。
- Chemd 到 prediction instance。
- Chemd 到实验方案。
- 实验失败分析。
- 条件推荐。

示例任务：

```text
Input:
  The reaction was heated in dioxane with K2CO3 and Pd(dppf)Cl2 at 80 C for 12 h.

Output:
  reaction ...
    conditions:
      solvent: dioxane
      base: K2CO3
      catalyst: Pd(dppf)Cl2
      temperature: 80 C
      time: 12 h
```

### 4.4 Chemd tokenizer 与 grammar constrained decoding

Chemd 是 DSL，因此可以让模型生成更稳定。

可选改造：

- 为 Chemd 关键语法和 block pattern 增加 tokenizer 适配。
- 使用 grammar constrained decoding 限制非法结构。
- 在 decoding 后调用 compiler repair loop。
- 对 molecule、reaction、procedure、result、analysis 采用结构化输出模板。

这不是重写 Transformer，而是让 LLM 更适合 Chemd。

### 4.5 Reaction representation model

这是预测器的输入核心。

建议由多个 encoder 组成：

```text
Structure encoder:
  reactant/product graph, fingerprint, reaction center

Condition encoder:
  solvent, catalyst, ligand, base, additive, temp, time, concentration

Procedure encoder:
  add, mix, heat, cool, hold, quench, extract, purify, analyze

Outcome encoder:
  yield, conversion, selectivity, purity, failure signal

Chemd semantic encoder:
  AST, typed semantic graph, references, provenance, quality
```

这些 encoder 的输出融合成 reaction embedding。

### 4.6 Prediction heads

在 shared reaction embedding 上添加多个预测头：

- `success_head`。
- `yield_head`。
- `conversion_head`。
- `selectivity_head`。
- `failure_mode_head`。
- `condition_ranker`。
- `uncertainty_head`。
- `ood_head`。

LLM 不直接替代这些 head。LLM 可以解释这些 head 的结果。

### 4.7 Cluster experts 和 LoRA adapters

按 cluster 或任务挂载 LoRA adapter。

推荐先分两类：

任务专家：

- `record_to_chemd_expert`
- `chemd_repair_expert`
- `reaction_classification_expert`
- `yield_prediction_explainer`
- `condition_recommendation_expert`
- `failure_analysis_expert`
- `proposal_generation_expert`

反应专家：

- `cross_coupling_expert`
- `oxidation_expert`
- `reduction_expert`
- `amidation_expert`
- `esterification_expert`
- `photochemistry_expert`
- `organocatalysis_expert`
- `polymerization_expert`

早期不建议直接训练几千个专家。推荐先做几十个高质量专家，再按数据规模扩展。

### 4.8 Mechanism module

FlowER 一类模型说明，反应机理预测可以使用非 LLM 的专门架构。

Chemd 后续可以引入独立机理模块：

```text
reactant/product graph
  + bond-electron representation
  + step/context constraints
  -> electron-flow / mechanism plausibility
```

它适合做：

- 机理合理性检查。
- 反应路径候选。
- 副反应解释。
- electron conservation / valence sanity check。

它不应替代 Chemd 主预测器，而是作为 verifier 和 mechanistic expert。

---

## 5. 训练路线

### 5.1 Stage 0：数据和编译器基线

先保证数据可编译、可追溯、可过滤。

产物：

- Chemd grammar。
- compiler diagnostics。
- AST。
- semantic graph。
- step graph。
- training export。
- RAG export。
- training understanding。
- task dataset。

没有这一层，不应该急着训练模型。

### 5.2 Stage 1：通用化学继续预训练

目标是增强基础化学知识。

训练材料：

- 公开文献。
- 公开专利。
- 反应数据库。
- SMILES / reaction SMILES。
- 实验步骤文本。

注意：

- 这一阶段学习通用知识。
- 不混入未授权内部实验。
- 不把低质量 OCR 直接当高可信训练数据。

### 5.3 Stage 2：Chemd SFT

目标是让 LLM 熟练读写 Chemd。

任务：

- `record_to_chemd`
- `chemd_repair`
- `reference_resolution`
- `normalization_explanation`
- `evidence_tracing`
- `semantic_diff`
- `experiment_summary`
- `proposal_to_chemd`

质量门禁：

- compiler pass rate。
- 引用解析一致性。
- 单位归一化正确性。
- 不确定性标注。
- 不伪造事实。

### 5.4 Stage 3：预测模型训练

目标是学习反应规律。

训练输入：

- reaction embedding。
- condition vector。
- procedure step graph。
- outcome labels。
- quality mask。
- leakage mask。

训练任务：

- success classification。
- yield regression。
- selectivity prediction。
- failure mode classification。
- condition ranking。
- next experiment ranking。

注意：

- 预测训练必须隐藏 target 字段。
- 同一优化系列不能随机泄漏到 train/test 两边。
- 优先按时间切分评估。

### 5.5 Stage 4：聚类专家和 adapter

目标是让不同反应空间有自己的专家表达和建议能力。

流程：

```text
reaction embedding
  -> cluster
  -> cluster dataset
  -> adapter training
  -> router eval
```

专家不是越多越好。专家数量应该由数据规模和评估效果决定。

### 5.6 Stage 5：RL / DPO / verifier tuning

只对可验证目标使用 RL。

适合 reward：

- Chemd 合法性。
- compiler 通过率。
- 引用一致性。
- target leakage 检查。
- 预测误差。
- evidence citation。
- verifier 通过率。

不适合 reward：

- 只看文字是否流畅。
- 无真实结果的开放式猜测。
- 无证据的机理解释。

### 5.7 Stage 6：周期模型发布

实时数据累积后，按周期发布模型版本。

```text
live database snapshot
  -> quality filter
  -> train/eval split
  -> train adapters / heads
  -> offline eval
  -> shadow deployment
  -> release
```

每次发布必须记录：

- 数据快照。
- projection version。
- model version。
- adapter version。
- eval result。
- known risks。

---

## 6. 用户输入后的端到端流程

### 6.1 用户录入实验报告

```text
用户输入实验报告
  -> Chemd Writer LLM
  -> Chemd draft
  -> compiler diagnostics
  -> repair loop
  -> valid Chemd source
```

如果缺失信息无法从文本推出，系统应该保留 unknown，而不是补假数据。

### 6.2 写入实时知识库

```text
valid Chemd
  -> AST
  -> semantic graph
  -> step graph
  -> normalized conditions
  -> result labels
  -> quality scores
  -> live database
```

同时更新：

- vector index。
- graph index。
- feature store。
- cluster membership。
- similar reaction cache。

### 6.3 和模型知识关联

系统把新实验关联到：

- 相同 reaction family。
- 相同或相似 substrate。
- 相似 product。
- 相似 catalyst / ligand / solvent / base。
- 相似 procedure。
- 相似 failure signal。
- 相同 optimization trajectory。

模型权重中的知识提供背景，实时数据库提供最新事实。

### 6.4 用户请求预测

```text
用户输入目标反应或目标产物
  -> Chemd query
  -> compile
  -> reaction representation
  -> nearest experiments
  -> cluster router
  -> expert adapters
  -> prediction ensemble
  -> uncertainty calibration
  -> proposal generation
  -> compiler verification
  -> Chemd protocol
```

输出不应该只是一个答案，而应包含：

- 推荐实验条件。
- 预测 yield / success / selectivity。
- 置信度和不确定性。
- 相似实验证据。
- 关键变量解释。
- 风险和失败模式。
- 可执行 Chemd 实验方案。

### 6.5 用户执行后回流

```text
用户执行实验
  -> 录入真实结果
  -> compile
  -> semantic diff: proposal vs observed
  -> prediction error
  -> update live database
  -> generate training/eval samples
```

这一步是 Chemd 真正变聪明的来源。

---

## 7. 数据库与知识更新设计

### 7.1 实时数据库保存什么

实时数据库至少包括：

- `documents`：原始文档和 Chemd source。
- `entities`：molecule、reaction、result、analysis、procedure、sample、artifact。
- `semantic_edges`：引用、包含、证据、派生、比较关系。
- `step_graphs`：标准化实验步骤。
- `condition_vectors`：条件特征。
- `outcome_labels`：结果标签。
- `reaction_embeddings`：反应表征。
- `clusters`：聚类和专家路由。
- `predictions`：模型预测记录。
- `proposals`：模型建议的实验方案。
- `observations`：真实执行结果。
- `semantic_diffs`：事实变化。
- `annotations`：人工审查和修正。
- `quality_scores`：数据质量和训练准入。

### 7.2 快知识和慢知识同步

实时数据库立即服务检索和预测。

模型权重按版本更新：

```text
daily / weekly:
  update index, cluster stats, KNN cache

weekly / monthly:
  update prediction heads or adapters

major release:
  update base Chemd-aware model
```

### 7.3 防止训练污染

必须区分四类记录：

```text
observed:
  真实执行并记录的实验

predicted:
  模型预测的结果

proposed:
  模型建议但尚未执行的实验

inferred:
  根据上下文推断但未直接观察的事实
```

只有 observed 且质量合格的数据可以作为强监督 target。

---

## 8. 聚类、搜索和专家路由

### 8.1 为什么需要聚类

化学反应空间太大。单个模型很难在所有反应类型、条件空间和实验模式上都表现最好。

聚类的作用：

- 找相似历史实验。
- 降低预测空间复杂度。
- 选择合适专家 adapter。
- 估计 OOD 风险。
- 构造局部训练集。
- 发现优化轨迹和失败模式。

### 8.2 推荐聚类层级

```text
Level 0: dataset / organization / project
Level 1: broad reaction family
Level 2: transformation type
Level 3: reaction center / functional group change
Level 4: condition family
Level 5: substrate or product series
Level 6: optimization trajectory
```

示例：

```text
cross coupling
  -> Suzuki coupling
  -> aryl bromide + boronic acid
  -> Pd / ligand / base screening
  -> same substrate series
  -> baseline -> variant -> best condition
```

### 8.3 搜索方式

推荐组合：

- exact search：精确找 molecule、reaction id、CAS、SMILES。
- graph search：找实体和证据关系。
- vector search：找相似反应。
- condition search：找相似实验条件。
- semantic diff search：找类似优化变化。
- failure search：找类似失败案例。

### 8.4 Router 输出

```json
{
  "reaction_family": "cross_coupling",
  "cluster_id": "cluster::cross_coupling::suzuki::aryl-bromide",
  "nearest_experiments": ["rxn::a", "rxn::b", "rxn::c"],
  "expert_adapters": [
    "cross_coupling_expert",
    "yield_optimization_expert"
  ],
  "prediction_models": [
    "knn_local",
    "condition_ranker",
    "yield_head"
  ],
  "confidence": "medium",
  "ood_warning": false
}
```

---

## 9. Agent 架构

Chemd agent 不是自由聊天 agent，而是受 compiler 和工具约束的工作流 agent。

推荐角色：

### 9.1 Record Ingestion Agent

职责：

- 接收用户实验报告。
- 转成 Chemd。
- 标记不确定信息。
- 不伪造事实。

### 9.2 Compiler Repair Agent

职责：

- 读取 compiler diagnostics。
- 做最小修复。
- 保留用户原意。
- 无法确定时停止并要求补信息。

### 9.3 Retrieval Agent

职责：

- 从 query Chemd 提取反应表征。
- 检索相似实验。
- 返回 evidence set。
- 标记数据质量。

### 9.4 Prediction Agent

职责：

- 调用预测模型。
- 合并 ensemble 结果。
- 输出不确定性。
- 识别 OOD 和低置信度。

### 9.5 Protocol Generation Agent

职责：

- 根据预测结果生成 Chemd proposal。
- 明确区分 expected 和 observed。
- 生成可执行实验记录草案。

### 9.6 Verifier Agent

职责：

- 运行 Chemd compiler。
- 检查 target leakage。
- 检查引用和证据。
- 检查预测是否越界。
- 检查安全和操作风险。

### 9.7 Knowledge Update Agent

职责：

- 比较 proposal 和 observed record。
- 生成 semantic diff。
- 更新 live database。
- 派生训练样本和评估样本。

Agent 之间的原则：

```text
LLM 负责表达和编排
Compiler 负责合法性
Predictor 负责科学预测
Database 负责实时事实
Verifier 负责边界
```

---

## 10. 和 MOSAIC / FlowER 的关系

### 10.1 MOSAIC 可以借鉴什么

MOSAIC 的核心启发是：

- 先学 reaction metric。
- 把反应映射到 embedding space。
- 用 FAISS 聚类。
- 每个区域训练专家 LoRA。
- 查询时路由到最近专家。
- 输出实验方案和置信度。

Chemd 可以借鉴这个框架，但输入不应该只是 reaction SMILES。

Chemd 的输入更丰富：

- structure。
- condition。
- procedure。
- observation。
- outcome。
- semantic diff。
- quality。
- provenance。

因此 Chemd-MOSAIC 应该是：

```text
Chemd semantic reaction embedding
  -> cluster router
  -> nearest experiment evidence
  -> expert adapter
  -> prediction head
  -> Chemd proposal
```

### 10.2 FlowER 可以借鉴什么

FlowER 更像专门的反应机理生成架构。

Chemd 可以把它作为机理专家，而不是主 LLM：

- 检查电子流合理性。
- 推断反应路径。
- 解释副反应。
- 检查结构变化是否符合基本化学约束。

Chemd 的主线仍是实验预测和实验记录，不应一开始被机理模型复杂度拖住。

---

## 11. 输出格式

### 11.1 预测输出

推荐标准预测输出：

```json
{
  "query_id": "query::2026-04-26::001",
  "prediction": {
    "success_probability": 0.72,
    "yield_percent": {
      "p50": 58,
      "p10": 31,
      "p90": 78
    },
    "selectivity": "medium",
    "failure_modes": ["low_conversion", "purification_risk"]
  },
  "confidence": {
    "level": "medium",
    "nearest_cluster_distance": 0.34,
    "ood_warning": false
  },
  "evidence": {
    "nearest_reactions": ["rxn::a", "rxn::b"],
    "key_variables": ["base", "ligand", "solvent"]
  },
  "proposal": {
    "chemd_document_id": "proposal::001",
    "status": "not_observed"
  }
}
```

### 11.2 实验记录回流

真实实验回流时必须标记：

```json
{
  "record_type": "observed",
  "linked_proposal_id": "proposal::001",
  "observed_result": {
    "yield_percent": 46,
    "basis": "isolated"
  },
  "prediction_error": {
    "yield_p50_delta": -12
  },
  "semantic_diff_id": "diff::001",
  "usable_for_training": true
}
```

---

## 12. 落地路线

### P0：先把 Chemd 变成稳定训练语言

目标：

- Chemd 语法稳定。
- compiler diagnostics 可用。
- trainingUnderstanding 可用。
- task dataset 可导出。
- quality gate 可执行。

不做：

- 不急着训练大规模专家。
- 不急着做真正 MoE。
- 不把预测结果混入真实结果。

### P1：建立实时实验知识库

目标：

- 用户实验可写入。
- AST / semantic graph 可存储。
- reaction embedding 可生成。
- 相似实验可检索。
- provenance 可追溯。

### P2：建立预测 baseline

目标：

- KNN baseline。
- LightGBM / XGBoost condition model。
- yield / success / failure prediction。
- uncertainty calibration。
- time-based eval。

这是判断 Chemd 是否真的有预测价值的关键阶段。

### P3：建立 Chemd-aware LLM

目标：

- record_to_chemd。
- chemd_repair。
- proposal_to_chemd。
- evidence-aware explanation。
- compiler feedback loop。

### P4：建立 cluster experts

目标：

- reaction embedding cluster。
- expert routing。
- LoRA adapters。
- per-cluster eval。
- expert confidence。

### P5：建立闭环学习

目标：

- prediction vs observed semantic diff。
- active learning。
- human annotation。
- adapter periodic update。
- model release manifest。

---

## 13. 风险与边界

### 13.1 最大风险：把生成当事实

模型生成的实验方案不是事实。必须标记为 proposed。

只有真实执行并记录的结果才能作为 observed target。

### 13.2 最大技术风险：数据泄漏

yield prediction 不能看到 result text。

优化轨迹预测不能看到未来实验结果。

同一 substrate series 不能随机分进 train 和 test。

### 13.3 最大产品风险：只做聊天

如果系统只回答化学问题，而不编译 Chemd、不更新数据库、不做预测误差闭环，那么它只是化学聊天模型。

Chemd 的核心价值必须体现在：

- 结构化实验数据。
- 可追溯训练样本。
- 可验证预测。
- 实验反馈更新。

### 13.4 最大建模风险：过早重写 LLM 架构

早期不要重写 Transformer。

更稳妥的顺序：

```text
Chemd SFT
  -> constrained decoding
  -> retrieval router
  -> prediction heads
  -> LoRA experts
  -> mechanism module
  -> possible Chemd-native architecture
```

---

## 14. 验收标准

### 14.1 语言层

- 用户实验报告能稳定转成 Chemd。
- Chemd 能被 compiler 检查和修复。
- AST、semantic graph、step graph 稳定生成。

### 14.2 数据层

- 每条实验事实可追溯到 source span。
- 每条训练样本可追溯到 document、entity、projection version。
- observed、predicted、proposed、inferred 明确分离。

### 14.3 检索层

- 能找到相同 reaction family 的实验。
- 能找到相似 substrate / product 的实验。
- 能找到相似条件和失败模式。
- 能解释相似性的来源。

### 14.4 预测层

- 有稳定 baseline。
- 有时间切分评估。
- 有 uncertainty。
- 有 OOD 检测。
- 有 prediction vs observed 误差记录。

### 14.5 LLM 层

- LLM 能写合法 Chemd。
- LLM 能根据 compiler diagnostics 修复。
- LLM 能引用 evidence。
- LLM 不把 proposal 写成 observation。

### 14.6 更新层

- 用户新实验能实时进入检索和预测。
- 周期训练能生成 adapter 或 prediction head 新版本。
- 错误数据可以按 provenance 撤回。

---

## 15. 最终结论

Chemd 的核心不是“让 LLM 懂一点化学”，而是把化学实验变成模型可以编译、学习、检索、预测和更新的语义程序。

推荐最终形态：

```text
Chemd-aware LLM
  负责读写 Chemd、解释和编排

Chemd compiler
  负责语法、语义、证据和质量

Live experiment database
  负责实时实验事实和组织内部知识

Reaction predictor
  负责从结构、条件、步骤和结果中学习规律

Cluster experts
  负责局部反应空间的专业表达和建议

Knowledge update loop
  负责把真实实验反馈变成下一轮知识
```

这套架构比单纯聊天模型更适合化学研发，因为它把“语言能力”和“实验规律学习”分开，把“模型权重”和“实时实验事实”分开，把“预测建议”和“真实观察结果”分开。

Chemd 的长期价值在于：它能成为化学实验的编程语言、模型训练语言、知识更新协议和预测系统接口。
