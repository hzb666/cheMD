# chemd 训练流水线 v0.1 实施文档

状态：面向当前 cheMD 仓库的实施方案  
更新时间：2026-04-01

---

## 1. 文档目标

本文件定义 `chemd` 在 `训练数据导出 schema v0.1` 之后，如何逐步建设一条真正可落地的训练流水线，使系统具备以下能力：

1. 实验记录检索与问答
2. 相似实验召回与重排
3. 实验结果预测（如成功/失败、产率、转化率）
4. 面向实验室场景的大模型监督微调（SFT）
5. 条件允许时的偏好对齐（DPO）

本文件不是通用 AI 方案模板，而是：

- 以当前 `cheMD` 的 AST / resolver / compiler / JSON 导出能力为基础
- 以 `chemd-training-export/v0.1` 为统一数据接口
- 以“先系统、后模型；先检索/预测、后大模型微调”为总策略

---

## 2. 总体判断

对当前 `cheMD`，最合理的路线不是“立刻训练一个新大模型”，而是：

```text
chemd source
  -> parse / resolve / normalize
  -> training export
  -> retrieval dataset
  -> reranker dataset
  -> prediction dataset
  -> SFT dataset
  -> DPO dataset
```

并按以下顺序推进：

1. 先完成训练数据导出与质量控制
2. 先训练 embedding 检索模型
3. 再训练 reranker
4. 再训练结构化预测模型
5. 最后再做 LLM SFT
6. 有可靠偏好数据时，再做 DPO

原因很简单：

- 检索、重排、预测都更容易验证
- 错误定位更清楚
- 训练成本更低
- 这些模块训练好后，还能反过来给 SFT 产高质量监督样本

---

## 3. 相关原理（简要）

### 3.1 为什么不是一上来训练大模型

实验记录系统的核心问题通常不是“模型不会说”，而是：

- 找不到最相关历史实验
- 找到了但排序不准
- 结构化标签无法直接用于预测
- 输出不稳定，没有可靠证据链

因此在 chemd 场景下，大模型更适合作为：

- 解释器
- 总结器
- 交互层
- 规划层

而不是一开始就承担：

- 相似实验搜索
- 候选结果排序
- 数值预测
- 产率外推

这些更适合交给检索模型、重排模型和结构化预测模型。

### 3.2 embedding 模型原理

embedding 模型把文本映射成向量，使语义相近的文本在向量空间里更接近。

在 chemd 里，它适合做：

- 查找相似失败记录
- 查找相似条件组合
- 查找相似分析结论
- 为 RAG 提供第一阶段召回

但 embedding 模型通常只适合做“粗召回”，不适合直接决定最终排序。

### 3.3 reranker 原理

reranker 通常读取：

- 一个 query
- 一条候选 chunk

然后输出“这条候选对这个 query 有多相关”。

它比 embedding 更准，但更慢，所以只适合在第一阶段召回的 Top-K 上运行。

### 3.4 预测模型原理

预测模型不直接读整篇文档，而是读：

- 结构化条件
- 化学特征
- 历史标签

然后学习输入和目标之间的映射，例如：

- 条件 -> 成功/失败
- 条件 -> 产率
- 条件 -> 转化率

这类任务要尽量避免把“结果字段”泄漏回输入。

### 3.5 SFT 原理

SFT（Supervised Fine-Tuning）本质是：

- 给定输入
- 给定你希望模型输出的目标回答
- 让模型学习这种输出风格与任务能力

在 chemd 中，SFT 的用途不是让模型“记住所有实验”，而是让它学会：

- 如何读结构化实验数据
- 如何引用检索证据
- 如何给出规范摘要
- 如何解释预测结果
- 如何提出有限制条件下的建议

### 3.6 DPO 原理

DPO（Direct Preference Optimization）用于偏好对齐。

它不是让模型学新知识，而是让模型在两种候选回答中，更偏向你认可的那种风格。例如：

- 更保守还是更激进
- 更强调证据还是更强调建议
- 更简洁还是更详细
- 更偏“总结”还是更偏“行动建议”

因此 DPO 一定放在 SFT 之后。

---

## 4. 与当前仓库的对齐关系

当前 `cheMD` 已具备：

- 文档级 `meta`
- `molecule / reaction / result / analysis / sample / markdown` 等语义节点
- parser -> resolver -> compiler 主链路
- JSON 渲染输出

因此训练系统的最佳接入点是：

```text
compileChemd / resolveChemd 之后
```

再往下分为两条子链：

```text
A. retrieval / rerank / SFT 用的文本与对话数据
B. prediction 用的结构化实例与化学特征
```

这意味着训练流水线应新增而非改写现有主链路。

---

## 5. 目标系统图

```text
source .md
  -> parseChemd()
  -> resolveChemd()
  -> exportTrainingRecord()
      -> semantic_layer
      -> learning_layer.retrieval_chunks
      -> learning_layer.prediction_instances
      -> quality_layer

training export
  -> build_retrieval_dataset.py
  -> build_reranker_dataset.py
  -> build_prediction_dataset.py
  -> build_sft_dataset.py
  -> build_dpo_dataset.py

train/
  -> train_embedding.py
  -> train_reranker.py
  -> train_predictor.py
  -> train_sft.py
  -> train_dpo.py

serve/
  -> vector index
  -> reranker service
  -> predictor service
  -> llm orchestration layer
```

---

## 6. 推荐目录结构

```text
chemd/
  packages/
    exporter-training/
      src/
        index.ts
        types.ts
        normalize/
          units.ts
          numbers.ts
          tokens.ts
          status.ts
          smiles.ts
        builders/
          semantic-layer.ts
          retrieval-chunks.ts
          prediction-instances.ts
          quality-layer.ts
        utils/
          ids.ts
          hashing.ts
          text.ts
      tests/

  tools/
    training/
      build_retrieval_dataset.py
      build_reranker_dataset.py
      build_prediction_dataset.py
      build_sft_dataset.py
      build_dpo_dataset.py
      train_embedding.py
      train_reranker.py
      train_predictor.py
      train_sft.py
      train_dpo.py
      evaluate_retrieval.py
      evaluate_reranker.py
      evaluate_predictor.py
      evaluate_sft.py

  data/
    training/
      exports/
      retrieval/
      reranker/
      prediction/
      sft/
      dpo/
      checkpoints/
      reports/
```

说明：

- `packages/exporter-training` 负责从 `chemd` 文档导出统一训练记录
- `tools/training` 负责把导出记录变成各类训练集并训练模型
- 导出和训练分层，避免把训练逻辑写进核心编译链路

---

## 7. 数据层设计与实施

## 7.1 单一事实来源

所有训练数据都必须从 `ChemdTrainingExportV1` 派生，禁止不同脚本各自重新解析原文。

原因：

- 避免同一字段多套规范化规则
- 避免不同训练任务看到不一致数据
- 便于统一质量控制和可追溯

## 7.2 数据分层

### A. export records

每条实验一条主记录：

```text
records.ndjson
```

### B. retrieval dataset

每条检索样本一条记录：

```text
query, positive_chunk_id, negative_chunk_ids
```

### C. reranker dataset

每条重排样本一条记录：

```text
query, chunk_text, label
```

### D. prediction dataset

每条预测实例一条记录：

```text
instance_id, categorical_features, numeric_features, targets
```

### E. sft dataset

每条监督微调样本一条记录：

```text
messages / prompt-completion
```

### F. dpo dataset

每条偏好样本一条记录：

```text
prompt, chosen, rejected
```

---

## 8. 实施阶段计划

## 阶段 0：数据底座与质量闸门

### 目标

让所有训练任务基于统一、可追溯、可评分的数据出口。

### 实施项

1. 实现 `packages/exporter-training`
2. 增加 `exportTrainingRecord()` API
3. 输出 `records.ndjson`
4. 建立质量评分器
5. 增加数据过滤规则

### 产物

- `ChemdTrainingExportV1` 类型定义
- `records.ndjson`
- `quality_report.json`
- `excluded_records.ndjson`

### 质量规则建议

每条样本给出：

- `rag_eligible`
- `prediction_eligible`
- `confidence_score`
- `missing_required_fields`
- `failed_normalizations`

并定义样本级别：

- A：可直接进入训练
- B：可进入检索，不进入预测
- C：仅归档，不训练

### 验收标准

- 同一文档重复导出结果稳定
- raw / normalized 双值齐全
- 诊断信息可追踪到字段
- 导出字段覆盖率可统计

---

## 阶段 1：检索数据集与 embedding 模型

### 目标

先获得可靠的“相似实验召回”能力。

### 样本构造

#### 查询来源

1. 从 reaction / result / analysis 自动生成 query
2. 从人工问题模板生成 query
3. 从 markdown 摘要中抽 query

例如：

- “低转化的 Suzuki 反应有哪些相似案例？”
- “90 C、Pd(PPh3)4、dioxane/water 下的相似实验”
- “出现 debromination 的历史记录”

#### 正样本

- 对应的 `retrieval_chunk`
- 或同一文档内的最相关 chunk

#### 难负样本

优先从以下候选中构造：

1. 反应类型相同但结果不同
2. 条件很像但目标字段不同
3. 提到相同关键词但结论不同
4. 同一底物家族但产物不同

### 训练建议

先从轻量 embedding 模型起步，做领域微调，而不是从零训练。

### 评估指标

- Recall@k
- MRR
- nDCG@k
- 人工抽样相关性评估

### 验收标准

- 比基础通用 embedding 模型有稳定提升
- Top-20 召回中，明显相关候选占比明显提高

---

## 阶段 2：reranker

### 目标

在 embedding 的 Top-K 候选中，把真正最相关的排到前面。

### 数据构造

格式建议：

```json
{
  "query": "为什么这次反应转化率低？",
  "text": "...某条候选 chunk ...",
  "label": 1
}
```

负样本建议分层：

- easy negative：明显不相关
- hard negative：主题相近但答案不对

### 标签策略

建议三档后再映射成二分类或分数：

- 2 = 高相关
- 1 = 有帮助但不是最佳
- 0 = 不相关

### 评估指标

- nDCG@10
- MRR@10
- Top-1 / Top-3 人工命中率

### 验收标准

- reranker 后 Top-5 质量显著优于仅 embedding 排序
- 对 hard negatives 有明显区分能力

---

## 阶段 3：预测模型

### 目标

先获得稳定的结构化预测能力，再把结果交给 LLM 解释。

### 任务优先级

建议按以下顺序推进：

1. 成功/失败分类
2. 产率回归
3. 转化率回归
4. 选择性回归

### 输入

- `PredictionInstanceV1.features.categorical`
- `PredictionInstanceV1.features.numeric`
- `chemistry_feature_refs`

### 目标

- `status_class`
- `yield_percent`
- `conversion_percent`
- `selectivity_percent`

### 泄漏控制

以下字段默认禁止进入预测输入：

- result notes 中直接描述结果的文本
- analysis 已经给出结论的字段
- 原始 yield / conversion / purity 标签
- 带有明显结果描述的 markdown

### 数据切分

优先按时间切分，而不是随机切分：

```text
train = 较早时间段
valid = 中间时间段
test  = 最近时间段
```

避免同一时期重复实验泄漏到测试集。

### 评估指标

分类：

- Accuracy
- F1
- ROC-AUC
- PR-AUC

回归：

- MAE
- RMSE
- R2

### 验收标准

- 能超过简单规则基线
- 误差在实验决策上具有参考意义
- 对失败样本不过度乐观

---

## 阶段 4：SFT 数据集构造

### 目标

让大模型学会用你的数据结构和你想要的输出方式工作。

### SFT 样本类型

建议最少构造五类：

#### 1. 实验摘要

输入：结构化实验数据  
输出：规范化摘要

#### 2. 差异比较

输入：两次实验记录  
输出：差异与可能原因

#### 3. 失败解释

输入：当前实验 + 检索到的相似失败案例  
输出：失败原因归纳

#### 4. 条件建议

输入：当前实验 + 相似历史 + 约束条件  
输出：下一步建议

#### 5. JSON -> 中文/英文实验说明

输入：规范化 JSON  
输出：自然语言说明

### 输入模板原则

SFT 输入建议固定成：

```text
[任务说明]
[结构化实验数据]
[检索证据]
[预测结果（可选）]
[输出要求]
```

### 输出原则

输出必须：

- 明确区分事实与推断
- 明确引用证据
- 不伪造未给出的实验结果
- 对不确定性要显式表达

### 质量闸门

SFT 样本禁止使用：

- 原始脏文本直接拼接且无清洗
- 没有证据支持却写死结论的样本
- 输入里包含标准答案泄漏的样本

### 验收标准

- 样本模板稳定
- 同类任务风格一致
- 模型学到的是“工作流”，而不是只学措辞

---

## 阶段 5：SFT 训练

### 目标

在已有检索与预测模块基础上，让 LLM 变成真正可用的 chemd 助手。

### 模型策略

优先采用参数高效微调（如 LoRA 类方法），不要一开始全量微调。

### 训练建议

1. 先用较小 instruct 模型验证数据模板
2. 再迁移到更强模型
3. 先做 assistant-only / completion-only 风格监督
4. 训练时保留验证集上的模板一致性评估

### 关键能力目标

模型应该学会：

- 读懂结构化实验导出
- 正确使用检索证据
- 对预测结果做解释
- 在约束下给出可执行建议
- 在证据不足时保守表达

### 验收标准

- 对固定任务模板输出稳定
- 幻觉明显低于未微调基座模型
- 能正确引用证据并区分事实与建议

---

## 阶段 6：DPO 数据集与训练

### 目标

把模型输出对齐到你真正偏好的风格。

### 何时开始

必须在以下条件都满足后再开始：

1. SFT 输出已基本可用
2. 你能稳定定义“什么是更好的回答”
3. 已有成规模 `chosen / rejected` 对

### 偏好维度示例

- 更重证据 vs 更重猜测
- 更保守 vs 更激进
- 更贴近实验决策 vs 更泛泛科普
- 更简洁 vs 更完整

### 样本构造方式

#### 方式 A：人工双选

同一 prompt 生成两个回答，由人工选优。

#### 方式 B：规则预筛 + 人工复核

先让系统自动生成候选，再由人工筛选。

### 验收标准

- 模型风格偏移明显可见
- 没有明显破坏 factuality
- 和 SFT 相比，用户偏好一致性提高

---

## 9. 数据集构造细则

## 9.1 retrieval 数据构造脚本

脚本：

```text
tools/training/build_retrieval_dataset.py
```

### 输入

- `records.ndjson`

### 输出

- `retrieval/train.jsonl`
- `retrieval/valid.jsonl`
- `retrieval/test.jsonl`

### 记录格式建议

```json
{
  "query": "低转化 Suzuki 反应的相似案例",
  "positive": "...chunk text...",
  "negative": "...hard negative chunk text...",
  "metadata": {
    "query_type": "failure_search",
    "source_experiment_id": "exp_001"
  }
}
```

---

## 9.2 reranker 数据构造脚本

脚本：

```text
tools/training/build_reranker_dataset.py
```

### 核心策略

- 使用 embedding 基线模型先召回 Top-K
- 再用人工或规则打标签
- 生成 `(query, text, label)`

### 记录格式建议

```json
{
  "query": "为什么这次有 debromination？",
  "text": "...candidate chunk...",
  "label": 1
}
```

---

## 9.3 prediction 数据构造脚本

脚本：

```text
tools/training/build_prediction_dataset.py
```

### 输出建议

- `prediction/train.parquet`
- `prediction/valid.parquet`
- `prediction/test.parquet`

### 表字段建议

- `instance_id`
- `date`
- `project_id`
- `solvent`
- `catalyst`
- `temperature_C`
- `time_h`
- `pressure_bar`
- `num_reactants`
- `num_products`
- `status_class`
- `yield_percent`
- `conversion_percent`

并增加：

- `is_leakage_safe`
- `quality_tier`

---

## 9.4 SFT 数据构造脚本

脚本：

```text
tools/training/build_sft_dataset.py
```

### 输出格式

优先输出 chat 格式：

```json
{
  "messages": [
    {"role": "system", "content": "你是 chemd 实验助手。"},
    {"role": "user", "content": "...任务输入..."},
    {"role": "assistant", "content": "...目标输出..."}
  ]
}
```

### 重要约束

- 同一批任务模板必须统一
- 引用格式必须统一
- 事实、推断、建议的表达边界必须统一

---

## 9.5 DPO 数据构造脚本

脚本：

```text
tools/training/build_dpo_dataset.py
```

### 输出格式

```json
{
  "prompt": "...",
  "chosen": "...",
  "rejected": "..."
}
```

### 核心原则

- `chosen` 和 `rejected` 必须回答同一个问题
- 差异应集中在风格或策略质量，而不是事实错误过多
- 偏好标签要稳定，不要同类样本标准漂移

---

## 10. 训练脚本设计

## 10.1 train_embedding.py

### 目标

训练领域检索 embedding 模型。

### 配置建议

- model_name
- train_file
- valid_file
- loss_name
- batch_size
- learning_rate
- max_seq_length
- output_dir

### 产物

- embedding checkpoint
- eval report
- model card 草稿

---

## 10.2 train_reranker.py

### 目标

训练 query-document 二分类/打分模型。

### 配置建议

- model_name
- train_file
- valid_file
- batch_size
- max_length
- learning_rate
- output_dir

### 产物

- reranker checkpoint
- nDCG/MRR report

---

## 10.3 train_predictor.py

### 目标

训练分类/回归模型。

### 实现建议

先用最稳的结构化建模基线：

- XGBoost / LightGBM / CatBoost 风格树模型
- 再视情况加入深度学习或图模型

### 产物

- predictor.pkl / predictor.onnx
- calibration report
- feature importance report

---

## 10.4 train_sft.py

### 目标

训练 chemd 助手模型。

### 配置建议

- base_model
- sft_dataset
- peft_config
- learning_rate
- batch_size
- gradient_accumulation_steps
- max_length
- output_dir

### 产物

- adapter 权重
- eval report
- inference template

---

## 10.5 train_dpo.py

### 目标

做偏好对齐。

### 配置建议

- base_model_or_sft_model
- ref_model
- dpo_dataset
- beta
- batch_size
- learning_rate
- output_dir

### 产物

- dpo adapter 权重
- preference eval report

---

## 11. 评估体系

## 11.1 retrieval

离线：

- Recall@k
- MRR
- nDCG@k

在线/人工：

- Top-5 是否包含真正有帮助样本
- 相似失败案例可解释性

## 11.2 reranker

- Top-1 命中率
- Top-3 命中率
- nDCG@10
- hard negative 区分能力

## 11.3 predictor

分类：

- Accuracy
- Macro F1
- PR-AUC

回归：

- MAE
- RMSE
- 分箱误差分析

## 11.4 SFT

- 事实准确性
- 证据引用正确率
- 任务完成率
- 幻觉率
- 输出模板一致性

## 11.5 DPO

- 人工偏好胜率
- 是否破坏 factuality
- 是否出现风格过拟合

---

## 12. 数据质量与风险控制

## 12.1 主要风险

### 1. 标签不一致

例如：

- `success` 的标准不统一
- `purity` 的定义不统一
- `yield` 填写口径不一致

### 2. 泄漏

例如：

- 预测输入中混入结果字段
- SFT 输入里直接给了答案

### 3. 幸存者偏差

- 成功实验写得完整
- 失败实验记录不完整或缺失

### 4. 领域覆盖不足

- 只覆盖少数底物家族
- 只覆盖少数实验者习惯

### 5. 偏好数据漂移

- DPO 的 chosen/rejected 标准不稳定

## 12.2 控制策略

1. 所有任务统一从 export records 构造数据
2. 所有训练样本保留 `source_experiment_id`
3. 所有预测样本都经过 leakage check
4. 所有评估采用时间切分优先
5. 所有 DPO 样本建立标注规范

---

## 13. 算力与资源建议

## 13.1 最小可启动配置

### 检索 / reranker / predictor

- 单机即可启动
- GPU 不是绝对必须，但有更好
- 预测模型初期可不依赖大显存

### SFT

- 建议优先用较小 instruct 模型验证流程
- 优先 LoRA / PEFT，不建议一开始全量微调

### DPO

- 必须在 SFT 稳定后再上
- 数据质量比算力更关键

---

## 14. 里程碑计划

## Milestone 1：训练数据出口打通

### 完成标准

- `exporter-training` 可用
- `records.ndjson` 可批量导出
- 数据质量报告可生成

## Milestone 2：检索基线可用

### 完成标准

- embedding 模型训练完成
- 可在测试集上稳定超过通用基线

## Milestone 3：重排可用

### 完成标准

- reranker 能显著提高 Top-5 质量

## Milestone 4：预测基线可用

### 完成标准

- 成功/失败分类达到可用水平
- 产率回归有参考价值

## Milestone 5：SFT 助手可用

### 完成标准

- 能稳定完成实验摘要、失败解释、条件建议三类任务

## Milestone 6：偏好对齐完成

### 完成标准

- DPO 后输出风格明显更符合你的要求

---

## 15. 推荐的首月执行顺序

### 第 1 周

- 实现 `exporter-training`
- 产出 `records.ndjson`
- 完成质量分级 A/B/C

### 第 2 周

- 构造 retrieval 数据集
- 训练 embedding 基线模型
- 做第一轮检索评估

### 第 3 周

- 构造 reranker 数据集
- 训练 reranker
- 完成 Top-K 重排评估

### 第 4 周

- 构造 prediction 数据集
- 训练成功/失败分类模型
- 做时间切分验证

说明：

首月不建议同时推进 SFT 和 DPO。

---

## 16. 对 agent 的直接实施要求

当 agent 开工时，建议严格遵循：

1. 不绕过 `ChemdTrainingExportV1`
2. 不在训练脚本里重复写规范化逻辑
3. 先做可跑通的基线，再做优化
4. 每一阶段都先建立评估脚本
5. 所有产物都带版本号与报告
6. 所有训练数据都可回溯到源实验记录

---

## 17. 最终结论

对 `chemd` 来说，最正确的训练路线不是：

- 先训练一个很大的模型

而是：

- 先把实验记录变成高质量、可追溯、可多任务复用的训练数据底座
- 再分别训练检索、重排、预测
- 最后让 LLM 学会如何使用这些能力

一句话总结：

**chemd 的训练核心不是“把实验塞进模型里”，而是“先把实验变成系统可消费的结构，再让模型学会读、用、解释这套结构”。**

