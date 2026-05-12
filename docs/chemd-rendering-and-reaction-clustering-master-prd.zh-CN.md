# Chemd 节点渲染与反应聚类总 PRD

状态：PRD 草案
更新时间：2026-05-13
适用范围：Chemd DSL、AST、语义节点、Web 渲染、训练图索引、反应关联、反应聚类、聚类地图

关联文档：

- [Chemd 语义节点渲染 PRD](./chemd-semantic-node-rendering-prd.zh-CN.md)
- [Chemd 反应聚类与 TMAP 地图 PRD](./chemd-reaction-clustering-tmap-prd.zh-CN.md)
- [Chemd 模型、知识更新与反应预测架构](./chemd-model-knowledge-prediction-architecture.zh-CN.md)
- [chemd v0.3 实验理解、专家路由与训练架构](./chemd-v0.3-training-understanding-expert-architecture.zh-CN.md)

---

## 1. 背景

Chemd 当前已经具备从实验记录到结构化训练资产的基础链路：

```text
Chemd source
  -> AST
  -> resolved document
  -> trainingExport
  -> ragExport
  -> trainingUnderstanding
  -> graph index / reaction clusters
```

其中 `packages/exporter-training/src/graph-index.ts` 已经可以从 `trainingUnderstanding` 生成：

- `reaction_features`
- `reaction_clusters`
- `reaction_similarity_edges`
- document / knowledge graph nodes
- semantic graph edges

但当前图索引仍以规则和语义字段为主：

- 反应相似性依据包括同 reaction signature、reaction family、procedure signature、route、condition signature、shared chemistry feature ref。
- `fingerprint_status` 目前只有 `not_available` 和 `external_ref_available`。
- 非 fingerprint 推断会产生 `semantic_similarity_without_computed_fingerprint` 等 warning。

这说明 Chemd 已经有“反应关联和聚类”的第一层产品骨架，但还缺三件关键能力：

1. 语义节点如何稳定渲染。
2. 大规模反应关联和聚类如何成为可解释地图。
3. 反应聚类结果如何回到 Chemd 文档、证据和训练闭环。

本 PRD 用 Logseq、思源笔记和 TMAP 的代码库调研结果，定义 Chemd 下一阶段的产品和技术方向。

---

## 2. 调研结论

### 2.1 Logseq 的核心启发

Logseq 的节点渲染本质是“递归 outliner”：

- block 是基础渲染单元。
- block title/body 被解析为 markup AST。
- 前端用 Rum/React 递归渲染 block、children、bullet、content。
- 大页面通过 deferred rendering 和 virtualized list/grid 控制性能。

关键依据：

- `src/main/frontend/components/block.cljs`
  - `block-children` 负责递归渲染 children。
  - `block-content` 负责 block 外层 DOM 和 block title/body。
  - `block-content-inner` 负责把 AST body 渲染成 markup elements。
- `src/main/frontend/components/views.cljs`
  - 使用 `virtualized-list` 和 `virtualized-grid` 渲染大型视图。

对 Chemd 的判断：

- 适合学习其“块树递归 + 大树渐进渲染”。
- 适合实验步骤、证据链、引用树、反应路线的嵌套展示。
- 不适合作为大规模反应聚类图的主渲染方式。

### 2.2 思源笔记的核心启发

思源的节点渲染更接近 Chemd 应采用的模型：

- 后端维护结构化 block tree / BlockDOM。
- 前端 Protyle WYSIWYG 容器承载 block DOM。
- 前端扫描 `data-type` 和 `data-render`。
- 复杂 block 通过二次渲染和懒 hydration 激活。
- 渲染状态写在 DOM attribute 上，避免重复渲染。

关键依据：

- `kernel/api/block_op.go`
  - 使用 Lute 做 Markdown、BlockDOM、tree 转换。
  - `Md2BlockDOMTree` 和 `RenderNodeBlockDOM` 是核心转换路径。
- `app/src/protyle/wysiwyg/index.ts`
  - 创建 `.protyle-wysiwyg` 编辑容器。
- `app/src/protyle/render/blockRender.ts`
  - 查找 `data-type="NodeBlockQueryEmbed"` 且未 `data-render="true"` 的节点。
  - 设置 `data-render="true"` 后异步加载内容。
  - 插入 `.protyle-wysiwyg__embed` 后继续调用 `processRender`。
- `app/src/protyle/wysiwyg/transaction.ts`
  - 编辑事务后反复触发 `processRender`、`blockRender` 等渲染流程。

对 Chemd 的判断：

- Chemd 应优先学习思源式“语义 BlockDOM + 前端 hydration”。
- Chemd 的重组件不应在 AST 编译时直接渲染成最终 UI。
- Chemd 需要稳定的 `data-chemd-type`、`data-chemd-id`、`data-render-state` 协议。

### 2.3 TMAP 的核心启发

TMAP 的定位是大规模高维数据可视化布局库：

- Python 可用。
- 图布局基于 OGDF。
- 支持通过 `LSHForest` 生成 kNN / MST。
- 支持从 edge list 生成 layout。
- 官方建议用 Faerun 负责交互式绘图。

关键依据：

- `README.md`
  - 定位为 large high-dimensional data visualization。
  - 安装方式为 `conda install -c tmap tmap`。
  - Windows 环境提示 WSL。
  - 建议 Faerun 做可视化。
- `doc/md/tmap.md`
  - `LayoutFromLSHForest`：从 LSHForest 生成坐标、边和 MST 属性。
  - `MSTFromLSHForest`：从 kNN graph 生成 MST。
  - `LayoutFromEdgeList`：从 edge list 生成坐标、边和图属性。
  - `LSHForest` 提供近邻图和 query 能力。

对 Chemd 的判断：

- TMAP 适合作为反应空间地图的后端 layout generator。
- TMAP 不应作为浏览器 runtime。
- TMAP 不是聚类算法，聚类需要由 Chemd 或独立 job 先完成。
- MVP 应优先使用 `LayoutFromEdgeList`，直接消费 Chemd 已有 similarity edges。

---

## 3. 产品目标

### 3.1 总目标

把 Chemd 从“可编译实验 DSL”推进到“可视化实验知识系统”：

```text
实验记录
  -> Chemd source
  -> 语义节点
  -> 可交互文档视图
  -> 反应关联图
  -> 反应聚类地图
  -> 证据回溯 / 训练数据 / 预测闭环
```

### 3.2 第一阶段目标

第一阶段只做可落地的 product slice：

1. 定义 Chemd 语义节点渲染协议。
2. 让 molecule、reaction、evidence、cluster map 都成为 typed node。
3. 把 `trainingGraphIndex` 的 reaction cluster / similarity edge 暴露为前端可消费数据。
4. 支持反应聚类地图的离线 layout artifact。
5. 在 Web 中展示 cluster map，并能点选回到 reaction detail。

### 3.3 非目标

第一阶段不做：

- 浏览器内运行 TMAP。
- 直接把 TMAP 加进 `apps/web` bundle。
- 直接改当前 Python 3.14 `chem-service` 环境以安装 TMAP。
- 用 TMAP 替代聚类算法。
- 一次性做完整 ELN 或思源/Logseq 级别编辑器。
- 大规模 schema migration，除非后续实施阶段单独确认。

---

## 4. 用户场景

### 4.1 研究员查看单条反应

用户打开 Chemd 文档，看到反应块：

- 反应物、产物、条件、步骤和结果结构化展示。
- 分子和反应图懒加载。
- 证据和原文引用可展开。
- 若该反应属于某个 cluster，显示 cluster badge。

价值：

- 用户不需要在纯文本和图谱之间来回切换。
- Chemd source、semantic graph、rendered view 保持一致。

### 4.2 研究员查看反应系列

用户查看一个优化系列或 campaign：

- 同一 reaction family / route / procedure 的反应自动聚合。
- 变化变量和控制变量可扫描。
- yield、conversion、selectivity 等结果可比较。
- cluster 内部的共同特征和 warning 明确展示。

价值：

- 当前 `campaign_trajectory` 和 `condition_signature` 能直接转为产品视图。
- 帮助用户发现“同一系列中的最好条件”和“变量变化导致的结果差异”。

### 4.3 研究员查看反应空间地图

用户打开 cluster map：

- 每个点是一条 reaction。
- 点颜色表示 cluster。
- 点大小可表示质量、yield、文献数或置信度。
- 边表示 similarity edge 或 TMAP MST edge。
- 点击点后打开 reaction detail。
- 点击 cluster 后显示 shared features、warnings 和代表性反应。

价值：

- 用户能从全局看反应空间，而不是只看列表。
- 聚类和相似反应召回可以被解释和审查。

### 4.4 模型训练人员审查数据资产

用户查看某个训练 dataset 的反应聚类：

- 哪些反应只有 semantic cluster。
- 哪些反应有 computed fingerprint。
- 哪些 cluster 只基于 reaction family，需人工审查。
- 哪些边可用于 retrieval、few-shot、eval split 或 expert routing。

价值：

- 防止把弱关联反应当强监督样本。
- 让训练数据质量门禁可视化。

---

## 5. 核心产品需求

### 5.1 语义节点协议

Chemd 需要一套稳定的 semantic node rendering contract：

```ts
interface ChemdRenderableNodeV1 {
  node_id: string;
  node_type: string;
  document_id?: string;
  entity_id?: string;
  source_ref?: ChemdSourceRefV1;
  attrs: Record<string, unknown>;
  children: ChemdRenderableNodeV1[];
  render: {
    mode: "inline" | "block" | "panel" | "canvas";
    hydrate: "never" | "visible" | "manual" | "background";
    component: string;
    data_ref?: string;
  };
}
```

必须支持的节点类型：

- `ChemdDocumentNode`
- `ChemdSectionNode`
- `ChemdMoleculeNode`
- `ChemdReactionNode`
- `ChemdProcedureNode`
- `ChemdConditionNode`
- `ChemdResultNode`
- `ChemdEvidenceNode`
- `ChemdReactionClusterNode`
- `ChemdReactionClusterMapNode`

### 5.2 渲染协议

HTML / DOM 层建议采用：

```html
<section
  data-chemd-node-id="rxn_001"
  data-chemd-type="ChemdReactionNode"
  data-chemd-entity-id="reaction::rxn_001"
  data-chemd-render-state="placeholder"
></section>
```

状态枚举：

- `placeholder`
- `hydrating`
- `ready`
- `error`
- `stale`

交互规则：

- 可见区域内的 heavy node 自动 hydration。
- 手动展开的 node 优先 hydration。
- 失败时保留 source fallback 和 error reason。
- 数据版本变化时标记 `stale`，再重新 hydration。

### 5.3 反应关联需求

Chemd 当前已有 similarity edge 基础。下一阶段需要把 basis 分级：

强关联：

- same computed reaction fingerprint nearest neighbor。
- same reaction signature。
- shared reaction center / atom mapping。
- high score RXNFP cosine similarity。

中关联：

- same family + same procedure signature。
- same route。
- same condition signature。
- same campaign trajectory。

弱关联：

- same reaction family only。
- shared chemistry feature ref without vector。
- semantic inference without computed fingerprint。

前端必须展示关联依据和 warning，不能只展示“相似”。

### 5.4 反应聚类需求

每个 cluster 至少需要：

- `cluster_id`
- `basis`
- `member_reaction_entity_ids`
- `document_ids`
- `confidence`
- `shared_features`
- `warnings`
- `representative_reaction_entity_id`
- `quality_summary`
- `layout_ref`

聚类 basis 可以保留现有枚举，并逐步扩展：

- `reaction_signature`
- `reaction_family`
- `procedure_signature`
- `family_procedure`
- `route`
- `condition_signature`
- `chemistry_feature_ref`
- `campaign_trajectory`
- `computed_fingerprint`
- `rxnfp_embedding`
- `atom_mapped_reaction_center`

### 5.5 反应地图需求

反应地图不是普通 force graph。它应是可解释的 chemical atlas：

- 支持 1k 到 100k reaction points 的渐进加载。
- 点和边使用 Canvas/WebGL 渲染。
- detail panel 使用普通 React / DOM。
- layout artifact 可复现，不能每次刷新随机变化。
- map selection 能回跳到 Chemd 文档和 evidence block。

---

## 6. 技术方案

### 6.1 总链路

```text
Chemd source
  -> compileChemd()
  -> trainingUnderstanding
  -> trainingGraphIndex
  -> reaction feature store
  -> embedding / fingerprint job
  -> similarity graph
  -> clustering job
  -> TMAP layout job
  -> cluster map artifact
  -> web canvas renderer
  -> reaction detail / evidence panel
```

### 6.2 节点渲染链路

```text
AST / resolved document
  -> renderable semantic node tree
  -> lightweight DOM shell
  -> hydration registry
  -> component loader
  -> molecule/reaction/cluster widgets
```

### 6.3 聚类地图链路

```text
reaction_features
  -> semantic similarity edges
  -> computed fingerprint / RXNFP vectors
  -> kNN graph
  -> clustering labels
  -> TMAP LayoutFromEdgeList
  -> x/y + MST edges
  -> front-end map tiles / chunks
```

### 6.4 为什么优先 `LayoutFromEdgeList`

Chemd 已经能生成 `reaction_similarity_edges`。因此 MVP 不需要先把所有 embedding 转成 TMAP MinHash 输入。

优先 `LayoutFromEdgeList` 的理由：

- 直接消费现有 edge list，实施成本最低。
- 保留 Chemd 自己的 similarity basis 和 warning。
- 便于用语义边、fingerprint 边、RXNFP 边做对比实验。
- 减少 TMAP 对 Chemd 核心数据模型的侵入。

---

## 7. 数据合同

### 7.1 Graph index 扩展方向

现有 `ChemdTrainingGraphIndexV1` 可以保持兼容，新增可选字段：

```ts
interface TrainingReactionGraphFeatureV1 {
  fingerprint_status:
    | "not_available"
    | "external_ref_available"
    | "computed_fingerprint_available"
    | "embedding_available";
  embedding_refs?: Array<{
    embedding_model: string;
    vector_ref: string;
    dim: number;
  }>;
  atom_mapping_ref?: string;
  reaction_center_ref?: string;
}
```

新增 layout artifact：

```ts
interface ChemdReactionClusterLayoutV1 {
  schema_version: "chemd-reaction-cluster-layout/v0.1";
  layout_id: string;
  graph_index_ref: string;
  layout_engine: "tmap";
  layout_engine_version?: string;
  input_edge_kind: "semantic" | "fingerprint" | "rxnfp" | "hybrid";
  nodes: Array<{
    reaction_entity_id: string;
    x: number;
    y: number;
    cluster_id?: string;
    document_id: string;
    quality_tier?: string;
  }>;
  edges: Array<{
    from_reaction_entity_id: string;
    to_reaction_entity_id: string;
    edge_kind: "similarity" | "mst";
    score?: number;
    basis?: string[];
  }>;
  clusters: Array<{
    cluster_id: string;
    label: string;
    member_count: number;
    basis: string;
    confidence: string;
    warnings: string[];
  }>;
  warnings: string[];
}
```

### 7.2 存储边界

`packages/storage-postgres` 当前已经定义：

- `chemd_compile_artifacts`
- `chemd_semantic_entities`
- `chemd_semantic_relations`
- `chemd_rag_chunks`
- `chemd_embedding_models`
- `chemd_rag_chunk_embeddings`
- `chemd_dataset_projections`

下一阶段不建议直接把 TMAP 运行逻辑放入 `storage-postgres`。该包应继续保持“纯合同库”，只定义 SQL、类型和映射。

如需持久化 layout，建议后续新增：

- `chemd_reaction_graph_indexes`
- `chemd_reaction_cluster_layouts`
- `chemd_reaction_feature_embeddings`

但这属于实施阶段的 schema PRD，不在本文档直接落地。

---

## 8. 前端体验需求

### 8.1 文档视图

文档视图应支持：

- 源码和渲染视图并排。
- reaction block 和 molecule block 懒加载 SVG。
- evidence block 可展开原文。
- cluster badge 显示所属聚类。
- warning 明确可见，尤其是 semantic-only cluster。

### 8.2 Cluster map 视图

视图结构：

```text
Toolbar
  - basis filter
  - confidence filter
  - warning filter
  - layout source selector

Canvas map
  - reaction points
  - MST / similarity edges
  - cluster coloring

Inspector
  - selected reaction detail
  - selected cluster summary
  - evidence links
  - source document links
```

### 8.3 性能要求

MVP：

- 1k reactions 可流畅交互。
- 10k reactions 可浏览、筛选和点选。
- 首屏不能等待所有 heavy node hydration。

后续目标：

- 100k reactions 通过分块、LOD 或 server-side tiles 支持。

---

## 9. 验收标准

### 9.1 文档节点渲染

- [ ] Chemd 编译结果能输出 renderable node tree。
- [ ] 节点有稳定 `node_id`、`node_type`、`entity_id`。
- [ ] molecule / reaction heavy node 使用 hydration，不阻塞文档首屏。
- [ ] hydration 失败时有 fallback 和 error state。
- [ ] source ref 能回跳到 Chemd source。

### 9.2 反应关联

- [ ] reaction similarity edge 展示 score、basis、warnings。
- [ ] semantic-only similarity 不被展示成强 fingerprint 相似。
- [ ] reaction cluster 详情展示 shared features 和 confidence。
- [ ] cluster member 能回跳到 reaction detail。

### 9.3 TMAP 聚类地图

- [ ] 后端或离线 job 能从 edge list 生成 layout artifact。
- [ ] layout artifact 包含 x/y、edges、cluster labels、warnings。
- [ ] Web 端不直接依赖 TMAP runtime。
- [ ] 点击地图节点能打开 Chemd reaction detail。
- [ ] 地图视图能区分 semantic、fingerprint、RXNFP、hybrid layout。

---

## 10. 风险与边界

### 10.1 TMAP 依赖风险

风险：

- TMAP 是 C++/Python/conda 生态。
- Windows 原生支持不稳定，README 提示 WSL。
- 当前 `chem-service` Python 版本较新，可能与 TMAP/RXNFP/RXNMapper 生态冲突。

处理：

- 使用独立 conda worker 或离线 job。
- 不把 TMAP 放入 `apps/web`。
- 不强行塞进现有 `chem-service`。

### 10.2 聚类误导风险

风险：

- 同 reaction family 不代表化学上真正相似。
- semantic edge 可能来自弱证据。
- 没有 fingerprint 的 cluster 不能当作强监督。

处理：

- UI 必须显示 basis 和 warning。
- 训练数据导出必须带 confidence。
- semantic-only cluster 默认需要人工审查。

### 10.3 渲染复杂度风险

风险：

- 如果每种 Chemd block 都各自实现渲染入口，会快速变成重复代码。
- 如果一开始做完整编辑器，会偏离当前核心目标。

处理：

- 先定义 renderable node contract。
- 先做 viewer/hydration，不做完整块编辑器。
- 重组件通过 registry 接入。

---

## 11. 分阶段路线图

### Phase 0：合同设计

- 定义 `ChemdRenderableNodeV1`。
- 定义 DOM data attribute 协议。
- 定义 `ChemdReactionClusterLayoutV1`。
- 更新 docs/spec，不改运行时。

### Phase 1：节点渲染 MVP

- 从 compile result 派生 renderable node tree。
- Web 端实现 hydration registry。
- reaction/molecule/evidence block 接入 registry。
- 保持现有 preview 能力兼容。

### Phase 2：聚类数据 MVP

- 把 `trainingGraphIndex` 暴露给 Web。
- cluster list / cluster detail 可视化。
- similarity edge inspection。
- semantic-only warning 显示。

### Phase 3：TMAP layout MVP

- 新建独立 layout job。
- 输入 `reaction_similarity_edges`。
- 输出 layout artifact JSON。
- Web canvas 渲染地图。

### Phase 4：化学表征增强

- 接入 RXNFP embedding。
- 接入 RXNMapper atom mapping。
- 增加 computed fingerprint status。
- 对比 semantic layout 与 embedding layout。

### Phase 5：训练闭环

- cluster quality 进入 dataset projection。
- cluster map 支持人工审查标签。
- 审查结果写入 training experience / correction pattern。

---

## 12. 推荐决策

建议立即采用以下决策：

1. Chemd 节点渲染学习思源，不直接复制 Logseq。
2. Chemd 文档树学习 Logseq 的递归和虚拟化，不学习其 ClojureScript 技术栈。
3. TMAP 作为后端/离线 layout generator，不进入前端 runtime。
4. 第一版 TMAP 使用 `LayoutFromEdgeList`，消费 Chemd 自有 similarity graph。
5. 聚类算法与 layout 算法分离，TMAP 不负责 cluster label。
6. 所有聚类、相似性和地图节点必须保留 evidence、basis、confidence、warnings。

---

## 13. 参考依据

外部代码库快照：

- Logseq：`0096415 dev: run lint-and-test in parallel`
- 思源笔记：`96dfe0b :bookmark: Release v3.6.5`
- TMAP：`edd2934 Merge pull request #71 from reymond-group/chore/collate_wheels`

外部源码：

- Logseq block 渲染：https://github.com/logseq/logseq/blob/master/src/main/frontend/components/block.cljs
- Logseq views：https://github.com/logseq/logseq/blob/master/src/main/frontend/components/views.cljs
- 思源 WYSIWYG：https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/wysiwyg/index.ts
- 思源 blockRender：https://github.com/siyuan-note/siyuan/blob/master/app/src/protyle/render/blockRender.ts
- 思源 BlockDOM API：https://github.com/siyuan-note/siyuan/blob/master/kernel/api/block_op.go
- TMAP：https://github.com/reymond-group/tmap
- TMAP API 文档：https://github.com/reymond-group/tmap/blob/master/doc/md/tmap.md

Chemd 当前依据：

- `packages/exporter-training/src/graph-index.ts`
- `packages/exporter-training/src/graph-index-types.ts`
- `packages/storage-postgres/src/schema.ts`
- `docs/chemd-v0.3-training-understanding-expert-architecture.zh-CN.md`
- `docs/chemd-model-knowledge-prediction-architecture.zh-CN.md`
