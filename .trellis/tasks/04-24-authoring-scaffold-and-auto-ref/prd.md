# Authoring Scaffold and Auto Reference

## Goal

把 authoring assistance 从单点字段补全扩展到成组 scaffold 和更强自动引用，进一步降低手写实验记录的负担。

## Requirements

- compiler 需要为常见实验记录生成成组 scaffold，而不只是单个 block 模板
- scaffold 必须预填稳定引用，避免用户再手工补 `ref`
- 对 `condition-varies` 需要支持按 attempt 生成成组结果/分析/观察 scaffold
- editor 面板需要按用途清晰展示 grouped scaffold 与保守 suggestion
- 继续保持“显式应用才改源码”的契约，compiler 不得自动改写 source truth

## Acceptance Criteria

- [x] 单 reaction 文档可获得带自动 `ref` 的 grouped scaffold
- [x] `condition-varies` attempt 可获得按 `varN/resN/noteN` 对齐的 grouped scaffold
- [x] 建议列表可覆盖更强的自动引用补全，但仍然保持保守唯一匹配策略
- [x] web editor 能展示并应用 grouped scaffold
- [x] compiler/web 测试覆盖新增行为
- [x] 相关 Trellis spec 已同步

## Technical Notes

- 复用现有 `AuthoringPatch` 应用机制，不引入隐式 source rewrite
- 优先扩展 `AuthoringTemplate` / `AuthoringSuggestion` 契约，必要时补充分组元数据
- 先覆盖高价值常见流：reaction/result/analysis/observation 和 condition optimization attempts
