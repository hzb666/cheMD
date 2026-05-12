# Chemd 语义节点渲染 PRD

状态：PRD 草案
更新时间：2026-05-13
适用范围：Chemd DSL、AST、render profile、HTML/JSON renderer、Web preview、reaction/molecule/evidence/cluster block

上位文档：

- [Chemd 节点渲染与反应聚类总 PRD](./chemd-rendering-and-reaction-clustering-master-prd.zh-CN.md)

---

## 1. 问题定义

Chemd 当前已经能把实验记录编译成 AST、resolved document、training export、RAG export 和 training understanding。现有 Web 也具备 molecule/reaction preview 和后端 hydration 基础。

但随着 Chemd 进入“反应关联和聚类”阶段，原有 preview 模型会遇到三个问题：

1. **节点类型增多**
   molecule、reaction、procedure、condition、result、evidence、cluster、cluster map 都需要渲染。

2. **重组件增多**
   分子图、反应图、聚类地图、证据表、训练质量面板不应阻塞首屏。

3. **语义回跳要求更强**
   用户从图上点一个 reaction，需要回到 Chemd source、semantic entity、evidence 和 cluster context。

因此 Chemd 需要从“字符串 HTML preview”升级为“语义节点树 + 懒 hydration”。

---

## 2. 外部调研依据

### 2.1 Logseq：递归 block tree

Logseq 的核心实现说明了一个成熟 outliner 如何处理节点树：

- `block-content` 构建 block 容器。
- `block-content-inner` 渲染 block body AST。
- `block-children` 递归渲染 children。
- 大型视图通过 `virtualized-list` 和 `virtualized-grid` 控制性能。

对 Chemd 的启发：

- Chemd 文档天然是树：document、section、reaction、procedure、result、evidence。
- 递归渲染适合普通文档节点。
- 大量 reaction/evidence 节点需要渐进渲染。

不采纳的部分：

- 不引入 ClojureScript/Rum 技术栈。
- 不把反应聚类地图做成 DOM outliner。
- 不在第一阶段复制完整块编辑器。

### 2.2 思源笔记：BlockDOM + hydration

思源更适合 Chemd 学习：

- 后端把 Markdown/tree 转成 BlockDOM。
- 前端 `.protyle-wysiwyg` 承载 block DOM。
- `blockRender` 查找 `data-type` 和 `data-render`。
- 未渲染的复杂 block 被异步加载并标记为已渲染。
- 事务完成后重新触发二次渲染。

对 Chemd 的启发：

- Chemd 应有稳定 BlockDOM / semantic node tree。
- DOM attribute 可以承载渲染状态。
- 复杂 chemistry widget 应通过 registry 懒加载。
- 渲染失败时不破坏原始文档结构。

---

## 3. 产品目标

### 3.1 目标

建立 Chemd 统一语义节点渲染系统：

```text
Chemd compiled result
  -> renderable semantic node tree
  -> lightweight DOM shell
  -> hydration registry
  -> typed visual components
```

用户能在同一文档中看到：

- 普通文本和段落。
- 分子结构。
- 反应结构。
- 条件和步骤。
- 结果和分析证据。
- 反应 cluster badge。
- 可跳转的 source/evidence 引用。

### 3.2 非目标

第一阶段不做：

- 完整 block editor。
- 思源式数据库视图。
- Logseq 式双链和页面图谱。
- 浏览器内大规模 graph layout。
- 对现有 DSL 做破坏性语法调整。

---

## 4. 用户需求

### 4.1 文档阅读

用户打开 Chemd 文档时：

- 首屏快速显示文本和轻量节点。
- 分子/反应图在可见时加载。
- 加载失败时显示 fallback。
- 节点 hover 或点击时显示 source ref。

### 4.2 反应详情

用户查看 reaction node 时：

- 能看到 reactants、products、conditions、procedure、result。
- 能看到 normalized fields 和 raw fields。
- 能看到 reaction family、route、procedure signature。
- 能看到所属 cluster 和相似反应入口。

### 4.3 证据审查

用户查看 evidence node 时：

- 能看到字段值来自哪段原文。
- 能看到 normalization 是否成功。
- 能看到相关 relation 和 confidence。
- 能回跳到 source。

### 4.4 聚类上下文

用户查看 cluster badge 时：

- 能看到 cluster basis。
- 能看到 confidence。
- 能看到 warning。
- 能打开 cluster map 或 cluster detail。

---

## 5. 核心概念

### 5.1 Semantic node

Semantic node 是 Chemd 渲染和交互的最小单位。它不是 React component，也不是数据库行，而是编译结果中的稳定中间结构。

```ts
export interface ChemdRenderableNodeV1 {
  schema_version: "chemd-renderable-node/v0.1";
  node_id: string;
  node_type: ChemdRenderableNodeTypeV1;
  document_id?: string;
  entity_id?: string;
  original_id?: string;
  source_ref?: ChemdSourceRefV1;
  attrs: Record<string, unknown>;
  children: ChemdRenderableNodeV1[];
  render: ChemdRenderDirectiveV1;
  diagnostics: ChemdNodeDiagnosticV1[];
}
```

### 5.2 Render directive

```ts
export interface ChemdRenderDirectiveV1 {
  mode: "inline" | "block" | "panel" | "canvas";
  component: string;
  hydrate: "never" | "visible" | "manual" | "background";
  priority: "critical" | "normal" | "deferred";
  data_ref?: string;
}
```

解释：

- `mode` 决定视觉区域和布局。
- `component` 决定 hydration registry 中的组件。
- `hydrate` 决定何时加载。
- `priority` 决定队列调度。
- `data_ref` 指向重数据，不把所有 payload 塞进 DOM。

### 5.3 Source ref

```ts
export interface ChemdSourceRefV1 {
  source_kind: "chemd" | "markdown" | "ocr" | "external";
  source_uri?: string;
  start_line?: number;
  end_line?: number;
  start_offset?: number;
  end_offset?: number;
  source_hash?: string;
}
```

Source ref 是 Chemd 可信度和可追溯性的关键，不应只留在 diagnostics 中。

### 5.4 DOM shell

DOM shell 是首屏可渲染的轻量壳：

```html
<div
  data-chemd-node-id="reaction::rxn_001"
  data-chemd-type="ChemdReactionNode"
  data-chemd-entity-id="rxn_001"
  data-chemd-component="ReactionBlock"
  data-chemd-hydrate="visible"
  data-chemd-render-state="placeholder"
></div>
```

### 5.5 Hydration registry

Hydration registry 负责把 semantic node 映射为组件：

```ts
type ChemdHydrationRegistry = Record<
  string,
  {
    load: () => Promise<ChemdHydratableComponent>;
    mode: "inline" | "block" | "panel" | "canvas";
    fallback: ChemdFallbackRenderer;
  }
>;
```

---

## 6. 节点类型

### 6.1 文档节点

- `ChemdDocumentNode`
- `ChemdSectionNode`
- `ChemdParagraphNode`
- `ChemdListNode`
- `ChemdTableNode`

渲染方式：

- 默认同步渲染。
- 不需要 hydration。

### 6.2 化学实体节点

- `ChemdMoleculeNode`
- `ChemdReactionNode`
- `ChemdConditionNode`
- `ChemdProcedureNode`
- `ChemdResultNode`
- `ChemdAnalysisNode`
- `ChemdSampleNode`

渲染方式：

- molecule/reaction 使用 hydration。
- condition/result 可先同步渲染为结构化表格。
- analysis/sample 按证据丰富度决定是否 hydration。

### 6.3 证据节点

- `ChemdEvidenceNode`
- `ChemdFieldEvidenceNode`
- `ChemdDiagnosticNode`
- `ChemdSourceQuoteNode`

渲染方式：

- 默认折叠。
- 展开后加载完整 evidence。
- 必须保留 source ref。

### 6.4 图和聚类节点

- `ChemdReactionClusterNode`
- `ChemdReactionSimilarityEdgeNode`
- `ChemdReactionClusterMapNode`
- `ChemdReactionRouteNode`

渲染方式：

- cluster summary 可同步渲染。
- cluster map 必须 hydration。
- cluster map 使用 canvas/webgl。

---

## 7. 渲染生命周期

### 7.1 状态机

```text
placeholder
  -> hydrating
  -> ready
  -> stale
  -> hydrating
  -> ready

placeholder
  -> hydrating
  -> error
```

状态含义：

- `placeholder`：DOM shell 已存在，组件未加载。
- `hydrating`：组件和数据加载中。
- `ready`：组件已渲染。
- `stale`：数据版本变化，需要刷新。
- `error`：加载失败，显示 fallback。

### 7.2 触发方式

- `never`：普通文档节点，直接静态渲染。
- `visible`：进入 viewport 后触发。
- `manual`：用户点击展开后触发。
- `background`：空闲时预加载。

### 7.3 失败处理

失败时必须保留：

- node id
- source ref
- error code
- fallback text
- retry action

不能把失败节点直接从 DOM 删除。

---

## 8. 与现有 Chemd 包的关系

### 8.1 `@chemd/core`

建议承载：

- 基础 node type。
- source ref type。
- render directive type。

### 8.2 `@chemd/render-profile`

建议承载：

- 不同输出目标的渲染策略。
- web/html/docx/json 对节点支持能力的 profile。

### 8.3 `@chemd/renderer-html`

建议承载：

- DOM shell 输出。
- `data-chemd-*` attribute 输出。
- SSR-safe fallback。

### 8.4 `@chemd/renderer-json`

建议承载：

- renderable node tree JSON 输出。
- 前端 hydration 所需 data refs。

### 8.5 `@chemd/web`

建议承载：

- hydration registry。
- React components。
- viewport scheduler。
- canvas map renderer。
- inspector/detail panel。

### 8.6 `@chemd/exporter-training`

建议承载：

- reaction cluster / similarity node 派生。
- graph index 到 renderable graph node 的 adapter。

---

## 9. 数据流

```text
compileChemd(source)
  -> resolved document
  -> render profile
  -> renderable node tree
  -> renderer-html static shell
  -> apps/web hydration registry
  -> heavy widgets
```

对于反应节点：

```text
Reaction entity
  -> ChemdReactionNode
  -> static summary shell
  -> ReactionBlock hydration
  -> SVG / Ketcher / evidence / cluster badge
```

对于 cluster map：

```text
Graph index + layout artifact
  -> ChemdReactionClusterMapNode
  -> canvas placeholder
  -> ClusterMap hydration
  -> map points / edges / inspector
```

---

## 10. UI 需求

### 10.1 Reaction block

必须展示：

- reaction id
- reactants/products
- conditions
- procedure signature
- result summary
- cluster badges
- warnings

可展开：

- normalized fields
- raw fields
- evidence
- similar reactions

### 10.2 Molecule block

必须展示：

- molecule id
- name / original id
- canonical structure if available
- role context
- related reactions

### 10.3 Evidence panel

必须展示：

- source text
- normalized value
- confidence
- source relation ids
- diagnostic warnings

### 10.4 Cluster badge

必须展示：

- cluster label
- basis
- confidence
- member count
- warning indicator

---

## 11. 性能需求

### 11.1 文档首屏

- 首屏不等待 molecule/reaction SVG 完成。
- 首屏不等待 cluster map 数据完成。
- 只有静态文本、summary 和 placeholder 必须立即可见。

### 11.2 大文档

- 支持至少 1k 个 semantic nodes 的文档浏览。
- 子树默认可折叠。
- 大型 evidence list 需要分页或虚拟化。

### 11.3 Hydration 队列

调度优先级：

1. 当前 viewport 中的 reaction/molecule。
2. 用户手动展开的 evidence。
3. 当前选中 reaction 的 cluster context。
4. 背景预加载的相邻节点。

---

## 12. 验收标准

### 12.1 合同验收

- [ ] 定义 `ChemdRenderableNodeV1`。
- [ ] 定义 `ChemdRenderDirectiveV1`。
- [ ] 定义 `data-chemd-*` DOM attribute 协议。
- [ ] 定义 hydration state 枚举。
- [ ] 所有节点包含稳定 id。

### 12.2 功能验收

- [ ] reaction node 可静态展示 summary。
- [ ] reaction SVG 可懒加载。
- [ ] molecule SVG 可懒加载。
- [ ] evidence 可展开并回跳 source。
- [ ] cluster badge 可打开 cluster detail。

### 12.3 质量验收

- [ ] hydration failure 不破坏文档渲染。
- [ ] semantic-only cluster warning 能被展示。
- [ ] source ref 不丢失。
- [ ] SSR/static export 有 fallback。

---

## 13. 风险

### 13.1 过早做编辑器

风险：

- 完整 block editor 会吞掉大量实现成本。
- 当前 Chemd 更需要 viewer、inspector 和 cluster map。

决策：

- 第一阶段只做语义 viewer 和 hydration。
- 编辑能力保留现有 editor/preview 工作流。

### 13.2 节点协议膨胀

风险：

- 如果 `attrs` 没有边界，会变成任意 JSON dump。

决策：

- 公共字段放顶层。
- 重数据使用 `data_ref`。
- 每种 node type 有独立 schema。

### 13.3 Hydration 与 source 不一致

风险：

- 后端重新编译后，前端旧组件仍显示旧数据。

决策：

- 节点带 `source_hash` 或 `compile_run_id`。
- 数据版本变化时标记 `stale`。

---

## 14. 实施路线

### Phase 0：文档合同

- 完成本文档。
- 补充 renderable node schema 草案。
- 明确 package ownership。

### Phase 1：JSON node tree

- 在 renderer-json 或新 adapter 中输出 renderable node tree。
- 覆盖 document、section、reaction、molecule、evidence。

### Phase 2：HTML shell

- renderer-html 输出 `data-chemd-*` shell。
- 保持现有 HTML preview 兼容。

### Phase 3：Web hydration

- `apps/web` 增加 hydration registry。
- reaction/molecule 迁入统一 hydration flow。
- evidence panel 接入。

### Phase 4：Cluster context

- cluster badge 接入 graph index。
- cluster detail 接入 reaction cluster data。
- cluster map node 留出入口。

---

## 15. 参考依据

外部源码：

- Logseq block 渲染：https://github.com/logseq/logseq/blob/master/src/main/frontend/components/block.cljs
- Logseq virtualized views：https://github.com/logseq/logseq/blob/master/src/main/frontend/components/views.cljs
- 思源 WYSIWYG：https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/wysiwyg/index.ts
- 思源 blockRender：https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/blockRender.ts
- 思源 BlockDOM API：https://github.com/siyuan-note/siyuan/blob/master/kernel/api/block_op.go

Chemd 当前依据：

- `packages/exporter-training/src/graph-index.ts`
- `packages/exporter-training/src/graph-index-types.ts`
- `docs/2026-04-10-backend-refactor-remediation-implementation-plan.md`
- `docs/chemd-v0.1-render-profile-spec.zh-CN.md`
