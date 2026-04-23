# Authoring UX and Inference

## Goal

降低 Chemd Markdown 的手写负担，让常见实验记录在不牺牲训练导出质量的前提下更容易写。

## Requirements

- 定义面向作者的最小必写集，并在编译结果中给出缺失提示。
- 为常见实验场景提供可直接插入的模板。
- 在编辑器中提供自动补引用、自动继承、自动建议的 authoring UI。
- 对可保守推断的关系和默认值，尽量由编译端给出建议或派生结果，而不是要求作者显式写满。
- 保持现有训练导出和预览链路稳定，不引入新的重语法块。

## Acceptance Criteria

- [x] `compileChemd()` 提供稳定的 authoring assistance 输出，至少覆盖：
  - 最小必写集状态
  - 模板建议
  - 自动补引用建议
  - 自动继承/条件屏蔽建议
- [x] Playground 编辑器新增 authoring 面板，可插入模板并一键应用建议。
- [x] 至少支持以下常见场景：
  - 单反应 + 单结果
  - 单反应 + analysis / observation 自动补引用
  - condition-varies baseline / attempt 模板
  - condition-varies attempt 的结果/备注配对建议
- [x] 当文档存在唯一可推断目标时，编译器 authoring assistance 能生成保守建议，而不是要求作者手写全部 `ref`。
- [x] `@chemd/compiler`、`@chemd/web` 有回归测试覆盖新增行为。
- [x] 相关 Trellis spec 同步更新。

## Technical Notes

- 优先把推断做成 `authoring assistance`，由编辑器选择性应用；不要直接重写 source truth。
- 仅做保守推断：唯一候选、无歧义时才给出自动建议。
- 先复用现有 quick-fix / source patch 模式，避免引入复杂编辑器框架。
- 模板和建议以常见实验工作流为中心，不做通用 DSL IDE。
