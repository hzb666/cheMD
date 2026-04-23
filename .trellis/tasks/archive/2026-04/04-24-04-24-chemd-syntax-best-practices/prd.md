# Chemd Syntax Best Practices

## Goal
给 `chemd` 增加一份面向人和 LLM 的语法最佳实践说明，并提供一份可编译、可验证的 golden record 示例，明确“最低可用写法 / 推荐写法 / 金标准写法”的边界。

## Requirements
- 明确当前 canonical chemd surface 的推荐写法，不再停留在历史设计稿层面。
- 总结最小必写字段、推荐补充字段，以及为了让实验逻辑最清楚应显式写出的关系。
- 覆盖 reaction、result、procedure、observation、analysis、sample、artifact、condition-varies 的最佳实践。
- 给出一份完整 golden record，展示引用、样品谱系、证据链、条件优化尝试和 attempt 级引用。
- 用编译测试保护 golden record，避免后续语法演进把示例写法悄悄写坏。

## Acceptance Criteria
- [x] 新增中文最佳实践文档，能直接回答“chemd 该怎么写才最清楚”。
- [x] 文档包含最低可用、推荐、金标准三层写法和明确的反例/注意事项。
- [x] 新增或嵌入一个 golden chemd 示例，覆盖 condition-varies attempt、sample lineage、artifact/evidence。
- [x] 编译测试验证 golden record 能通过当前 compiler pipeline 并产出关键语义关系。

## Technical Notes
- 以当前实现和测试中的真实语法为准，不引入未实现的新语法糖。
- Golden record 优先复用现有 compiler/exporter-training 支持的结构字段。
- 文档和示例需要适合 LLM 直接模仿生成。
