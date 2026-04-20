# 补充实验内涵训练投影

## Goal

在不增加 Chemd 作者语法复杂度的前提下，继续增强
`@chemd/exporter-training` 的实验理解和训练数据派生能力，使 Chemd
可以支撑“小模型学习实验内涵、反应归类、专家路由、产率预测和方案建议”的训练链路。

## Requirements

- 不修改 Chemd 语法、parser、resolver 或作者书写规范。
- 继续以 `ChemdTrainingUnderstandingV1` 作为训练母数据。
- 补充反应分类、实验优化轨迹、失败模式和 MoE 专家路由标签。
- 从 `trainingUnderstanding` 派生任务化数据，不直接使用 RAG chunks 或 full audit export。
- 派生样本必须带来源实体、质量/弱监督标记和适用性标签。
- 补充 eval/annotation 所需的轻量结构，但不实现模型训练框架。
- 更新 exporter-training contract 文档。

## Phase Plan

### Phase 1: 实验内涵标签

- 在 `trainingUnderstanding` 中补充 reaction taxonomy。
- 在 `trainingUnderstanding` 中补充 expert routing labels。
- 在 `trainingUnderstanding` 中补充 optimization trajectory。
- 在 `trainingUnderstanding` 中补充 failure mode signals。

### Phase 2: 任务数据与评估/修正入口

- 扩展 task dataset 派生，加入 reaction classification 和 expert routing 样本。
- 增加 eval split / holdout metadata，避免训练与评估混淆。
- 增加 annotation/correction envelope 类型，供后续人工修正回流。

## Acceptance Criteria

- [x] `trainingUnderstanding` 包含反应分类和专家路由标签。
- [x] `trainingUnderstanding` 包含优化轨迹和失败模式信号。
- [ ] task dataset 可以派生 reaction classification 和 expert routing 样本。
- [ ] task dataset 明确区分 SFT 样本和 eval/holdout 适用性。
- [ ] annotation/correction 类型只作为训练回流入口，不污染自动派生监督。
- [x] 新结构不要求用户改变 Chemd 写法。
- [x] 不把 RAG chunks、audit/layout/source_layer/raw AST 混入训练任务。
- [ ] exporter-training 定向测试、typecheck、eslint 通过。
- [ ] 根级 `pnpm typecheck` 和 `pnpm test` 通过。
- [ ] 每阶段完成代码审查、finish-work、git commit 和 record-session。

## Technical Notes

- 复杂性应放在纯 transform/projection 层，不能放进作者语法。
- taxonomy/routing 先使用保守启发式和 evidence/warnings，后续可接入人工标注或外部分类器。
- yield prediction 的 input 仍不得包含 linked result text 或目标泄漏字段。
- full audit export 仍只是审计视图，不直接喂给 LoRA/SFT。
