# 补强实验决策训练理解

## Goal

让 `trainingUnderstanding` 更适合训练和评估实验决策能力，包括产率预测、条件推荐、失败分析和实验方案生成，同时不增加 Chemd 作者端语法复杂度。

## Requirements

- 不新增必须手写的 Chemd 语法字段。
- 优先从现有 reaction/result/analysis/sample/procedure/observation 信息派生内部结构。
- 阶段 1 补强单条实验内部语义：
  - 实验设计上下文与优化线索。
  - 结果可信度。
  - 预测实例特征。
  - LoRA/SFT 任务提示中加入实验决策类任务。
- 阶段 2 增加任务化数据派生：
  - 产率预测样本。
  - 条件推荐样本。
  - 实验方案样本。
  - 失败分析样本。
- RAG、training understanding、full audit export 保持边界清晰。
- 审计信息、布局信息、render 信息不进入训练理解数据。

## Acceptance Criteria

- [ ] `trainingUnderstanding` 包含实验设计/优化上下文。
- [ ] `trainingUnderstanding` 包含结果质量和目标可用性信息。
- [ ] `prediction_instances` 覆盖更多反应、条件、操作、证据相关特征。
- [ ] LoRA/SFT hints 能区分总结/抽取任务和实验决策任务。
- [ ] 可从 `trainingUnderstanding` 派生任务化 SFT 数据。
- [ ] 新结构不要求用户增加 Chemd 书写负担。
- [ ] exporter-training 定向测试和 typecheck 通过。
- [ ] 完成代码审查、finish-work、git commit 和 record-session。

## Technical Notes

- 以 `packages/exporter-training` 为主要修改范围。
- 只复用编译链已有 typed graph、step graph、semantic layer，不重新解析原文。
- `trainingExport` 继续作为 full audit export；`trainingUnderstanding` 继续作为干净训练母数据。
- 阶段 1 先实现内部 schema 与导出逻辑；阶段 2 再实现任务化投影 API，避免一次性改动过大。
