# Chemd 反应聚类与 TMAP 地图 PRD

状态：PRD 草案
更新时间：2026-05-13
适用范围：反应关联、反应聚类、RXNFP、RXNMapper、TMAP、训练图索引、反应空间地图、Web cluster map

上位文档：

- [Chemd 节点渲染与反应聚类总 PRD](./chemd-rendering-and-reaction-clustering-master-prd.zh-CN.md)
- [Chemd 语义节点渲染 PRD](./chemd-semantic-node-rendering-prd.zh-CN.md)

---

## 1. 背景

Chemd 最重要的能力之一是“反应关联和聚类”。当前仓库已经在 `@chemd/exporter-training` 中实现了第一版 graph index：

- `reaction_features`
- `reaction_clusters`
- `reaction_similarity_edges`

当前实现的特点：

- 能从 reaction family、reaction signature、procedure signature、route、condition signature、chemistry feature ref 等字段派生 cluster key。
- 能生成 similarity edge，并为 edge 附上 basis、score、warnings。
- 能生成 campaign trajectory cluster。
- 但还没有 computed reaction fingerprint、RXNFP embedding、atom mapping 或 TMAP layout。

因此下一步不是重新做聚类，而是在现有 graph index 上增强：

```text
semantic cluster
  -> chemical representation
  -> similarity graph
  -> clustering label
  -> TMAP layout
  -> interactive map
  -> training and review loop
```

---

## 2. TMAP 调研结论

TMAP 适合 Chemd，但定位必须清楚。

### 2.1 TMAP 适合做什么

TMAP 适合：

- 大规模高维数据的二维布局。
- 从 LSHForest 生成 kNN graph / MST。
- 从 edge list 生成 layout。
- 生成 chemical space atlas 风格地图。
- 与 Faerun 或自研 canvas renderer 结合显示大量点。

依据：

- TMAP README 定位为 large high-dimensional data visualization。
- TMAP API 提供 `LayoutFromLSHForest`、`MSTFromLSHForest`、`LayoutFromEdgeList`。
- 示例中使用 `LSHForest`、`Minhash` 和 Faerun 可视化 ChEMBL、DrugBank 等数据。

### 2.2 TMAP 不适合做什么

TMAP 不适合：

- 当前端运行时依赖。
- 直接放进 Next.js bundle。
- 替代聚类算法。
- 替代 Chemd 的 similarity basis 和 evidence。
- 直接塞进现有 Python 3.14 `chem-service`。

原因：

- TMAP 是 C++/Python/conda 生态。
- README 的 Windows 说明指向 WSL。
- 官方建议安装方式是 conda。
- Chemd 当前 `services/chem-service` 的 Python/RDKit 环境很新，直接混装 TMAP/RXNFP/RXNMapper 风险高。

### 2.3 推荐定位

TMAP 在 Chemd 中的定位：

```text
离线/后端 layout generator
```

不是：

```text
前端渲染库
```

也不是：

```text
聚类算法
```

---

## 3. 产品目标

### 3.1 总目标

建立 Chemd Reaction Atlas：

```text
每个点 = 一条 reaction
点位置 = TMAP layout
点颜色 = cluster label
边 = similarity / MST
点击 = reaction detail + evidence + source
```

### 3.2 MVP 目标

第一阶段只做以下闭环：

1. 从 `trainingGraphIndex.reaction_similarity_edges` 构造 edge list。
2. 用 TMAP `LayoutFromEdgeList` 生成 layout。
3. 输出 `ChemdReactionClusterLayoutV1` JSON artifact。
4. Web 端用 Canvas/WebGL 读取 artifact。
5. 用户点击点能打开 reaction detail。
6. 用户点击 cluster 能看到 basis、shared features、warnings。

### 3.3 后续目标

后续再接入：

- RXNFP embedding。
- RXNMapper atom mapping。
- reaction center feature。
- Leiden / HDBSCAN 等聚类算法。
- 多 layout 对比。
- 人工审查和训练闭环。

---

## 4. 用户需求

### 4.1 查看反应空间

用户希望看到全部反应在一个地图中的分布：

- 哪些反应聚在一起。
- 哪些反应是孤岛。
- 哪些 cluster 只靠语义规则生成。
- 哪些 cluster 有 computed fingerprint 支撑。

### 4.2 审查相似反应

用户点击一条 reaction：

- 看到最相似的 N 条 reaction。
- 看到每条 similarity edge 的 basis。
- 看到 score 和 warning。
- 能打开原始 Chemd 文档和 evidence。

### 4.3 审查 cluster

用户点击一个 cluster：

- 看到 member count。
- 看到 shared features。
- 看到 confidence。
- 看到 warning。
- 看到代表性 reaction。
- 能筛选 yield / condition / route。

### 4.4 训练数据分层

训练人员希望知道：

- 哪些 cluster 适合做 positive pairs。
- 哪些 cluster 只适合 retrieval。
- 哪些 cluster 需要人工审查。
- 哪些 cluster 不能进入 eval，避免 leakage。

---

## 5. 核心概念

### 5.1 Reaction feature

当前 Chemd 已有：

- `reaction_entity_id`
- `document_id`
- `reaction_signature`
- `participant_signature`
- `fingerprint_status`
- `chemistry_feature_ref_ids`
- `cluster_keys`
- `changed_variable_fields`
- `controlled_variable_fields`
- `condition_signature`
- `procedure_signature`
- `reaction_family`
- `route_id`

下一阶段建议增加：

- `embedding_refs`
- `atom_mapping_ref`
- `reaction_center_ref`
- `computed_fingerprint_ref`
- `feature_quality`

### 5.2 Similarity edge

Similarity edge 是“为什么两条反应有关”的产品解释核心。

当前 basis：

- `same_reaction_signature`
- `same_reaction_family`
- `same_procedure_signature`
- `same_family_procedure`
- `same_route`
- `same_condition_signature`
- `shared_chemistry_feature_ref`

建议扩展：

- `rxnfp_nearest_neighbor`
- `computed_fingerprint_similarity`
- `same_atom_mapped_reaction_center`
- `same_reaction_center_template`
- `hybrid_semantic_embedding_similarity`

### 5.3 Cluster

Cluster 是一组 reaction 的解释性集合。

Cluster 不应该只存成员列表，还应存：

- basis
- confidence
- shared features
- warnings
- representative reaction
- quality summary
- training usage recommendation

### 5.4 Layout

Layout 是可视化 artifact，不是事实本身。

必须记录：

- layout engine
- input edge kind
- input graph ref
- parameters
- generated at
- warnings

---

## 6. 推荐算法链路

### 6.1 MVP 链路：语义边到 TMAP

```text
trainingGraphIndex.reaction_features
trainingGraphIndex.reaction_similarity_edges
  -> edge list
  -> TMAP LayoutFromEdgeList
  -> layout artifact
  -> Web map
```

优点：

- 最快利用现有 Chemd graph index。
- 不依赖 RXNFP/RXNMapper 环境。
- 能立刻暴露 semantic-only warning。

缺点：

- 化学相似性不够强。
- 边较稀疏或偏规则。
- 地图更像“语义实验地图”，不是完整 reaction chemical space。

### 6.2 Phase 2：RXNFP embedding

```text
reaction SMILES
  -> RXNFP embedding
  -> vector similarity
  -> kNN graph
  -> clustering labels
  -> TMAP layout
```

优点：

- 反应表征更接近化学反应本身。
- 可用于相似反应召回和 expert routing。

风险：

- RXNFP 生态可能依赖较旧 Python/transformer 版本。
- 需要标准 reaction SMILES。
- 需要质量门禁，避免 OCR/解析错误污染 embedding。

### 6.3 Phase 3：RXNMapper / reaction center

```text
reaction SMILES
  -> atom mapping
  -> reaction center
  -> template / center features
  -> similarity graph
  -> cluster refinement
```

优点：

- 能解释“为什么这些反应化学上相似”。
- 可增强 reaction family、expert routing、prediction task。

风险：

- atom mapping 对脏数据敏感。
- 需要失败 fallback。
- 需要把 mapping confidence 暴露给 UI。

### 6.4 Phase 4：Hybrid graph

```text
semantic edge
  + RXNFP nearest neighbor
  + reaction center edge
  + condition similarity
  + campaign trajectory
  -> hybrid weighted graph
  -> clustering
  -> TMAP layout
```

优点：

- 最符合 Chemd 目标：结构、条件、步骤、结果、证据都参与。

风险：

- 权重选择容易误导。
- 必须保留 basis，而不是只输出一个总分。

---

## 7. 数据合同

### 7.1 Layout artifact

```ts
export interface ChemdReactionClusterLayoutV1 {
  schema_version: "chemd-reaction-cluster-layout/v0.1";
  layout_id: string;
  graph_index_id: string;
  source_compile_run_ids: string[];
  generated_at: string;
  layout_engine: "tmap";
  layout_engine_version?: string;
  input_edge_kind: "semantic" | "fingerprint" | "rxnfp" | "reaction_center" | "hybrid";
  input_summary: {
    reaction_count: number;
    edge_count: number;
    cluster_count: number;
    singleton_count: number;
  };
  tmap_config: {
    create_mst: boolean;
    used_layout_from_edge_list: boolean;
    k?: number;
    kc?: number;
    weighted?: boolean;
  };
  nodes: ChemdReactionLayoutNodeV1[];
  edges: ChemdReactionLayoutEdgeV1[];
  clusters: ChemdReactionLayoutClusterV1[];
  warnings: string[];
}
```

### 7.2 Layout node

```ts
export interface ChemdReactionLayoutNodeV1 {
  reaction_entity_id: string;
  document_id: string;
  x: number;
  y: number;
  cluster_id?: string;
  reaction_family?: string;
  procedure_signature?: string;
  confidence?: string;
  quality_tier?: string;
  warnings: string[];
}
```

### 7.3 Layout edge

```ts
export interface ChemdReactionLayoutEdgeV1 {
  from_reaction_entity_id: string;
  to_reaction_entity_id: string;
  edge_kind: "similarity" | "mst";
  score?: number;
  basis: string[];
  warnings: string[];
}
```

### 7.4 Cluster summary

```ts
export interface ChemdReactionLayoutClusterV1 {
  cluster_id: string;
  label: string;
  basis: string;
  confidence: "low" | "medium" | "high";
  member_count: number;
  representative_reaction_entity_id?: string;
  shared_features: string[];
  warnings: string[];
  training_use: {
    retrieval: boolean;
    positive_pair: boolean;
    eval_split_guard: boolean;
    requires_human_review: boolean;
  };
}
```

---

## 8. 后端/离线任务设计

### 8.1 不放入现有 `chem-service`

不建议把 TMAP/RXNFP/RXNMapper 直接加入当前 `services/chem-service`：

- 当前服务已有 RDKit、OCR、reaction SVG 责任。
- TMAP 依赖栈偏离 HTTP render service。
- Python 版本兼容风险高。
- layout job 是批处理，不是 request/response 渲染。

### 8.2 推荐新 worker

推荐新增独立 worker：

```text
services/chem-cluster-service
```

职责：

- 读取 graph index artifact。
- 生成 reaction representation。
- 生成 similarity graph。
- 运行 clustering。
- 调用 TMAP layout。
- 输出 layout artifact。

运行方式：

- 本地 CLI。
- CI 可选 smoke。
- 后续接入队列或后台任务。

### 8.3 环境建议

建议使用 conda 或 micromamba 环境：

```text
chemd-cluster-env
  - python 3.10/3.11
  - rdkit
  - tmap
  - rxnfp
  - rxnmapper
  - numpy
  - scikit-learn
  - networkx
```

实际版本要在实施前通过最小安装实验确认。

---

## 9. 前端地图设计

### 9.1 组件结构

```text
ReactionClusterMap
  - MapToolbar
  - ClusterCanvas
  - ClusterLegend
  - ReactionInspector
  - ClusterInspector
```

### 9.2 交互

- hover point：显示 reaction summary。
- click point：打开 reaction inspector。
- click cluster legend：筛选 cluster。
- click edge：显示 similarity basis。
- filter warning：只看 semantic-only 或 low-confidence。
- switch layout：semantic / rxnfp / hybrid。

### 9.3 渲染策略

MVP：

- Canvas 2D。
- 先渲染点，再按 zoom 渲染边。
- 点选通过空间索引或简单网格索引。

后续：

- WebGL 或 deck.gl。
- LOD。
- server-side tiles。

### 9.4 Inspector 信息

Reaction inspector：

- reaction id
- document title
- reaction family
- reactants/products summary
- conditions
- result summary
- cluster membership
- nearest neighbors
- source/evidence links

Cluster inspector：

- cluster label
- basis
- confidence
- member count
- shared features
- warnings
- representative reactions
- training use recommendation

---

## 10. 训练闭环

反应聚类地图不是只服务可视化，也服务训练数据质量。

### 10.1 Positive pairs

可作为 positive pair 的条件：

- computed fingerprint 或 RXNFP 相似度足够高。
- reaction center 相同或高度一致。
- cluster confidence high。
- 无 critical warnings。

### 10.2 Retrieval-only

只适合 retrieval 的情况：

- same reaction family only。
- semantic edge without computed fingerprint。
- weak condition similarity。
- human review pending。

### 10.3 Eval split guard

同 cluster 的反应可能不能同时进入 train 和 eval，否则会 leakage。

Layout cluster 应输出：

- `eval_split_guard: true`
- `cluster_id`
- `member_reaction_entity_ids`

### 10.4 Human review

人工审查可以写回：

- cluster accepted/rejected。
- edge accepted/rejected。
- wrong reaction family。
- wrong atom mapping。
- wrong condition normalization。

这些结果应进入 training experience / correction pattern。

---

## 11. 质量门禁

### 11.1 输入质量

进入 embedding/layout 前必须检查：

- reaction 有 reactants/products。
- reaction SMILES 可解析。
- normalized conditions 不为空或明确缺失。
- source document 有 compile status。
- critical diagnostics 不超阈值。

### 11.2 Edge 质量

每条 edge 必须有：

- basis
- score 或 score unavailable reason
- warnings
- source feature refs

### 11.3 Cluster 质量

每个 cluster 必须有：

- confidence
- warnings
- shared features
- member count
- basis

### 11.4 Layout 质量

每个 layout artifact 必须有：

- input summary
- layout engine
- config
- generated at
- warning list

---

## 12. 验收标准

### 12.1 MVP 验收

- [ ] 能从现有 graph index 生成 TMAP edge list。
- [ ] 能生成 layout artifact JSON。
- [ ] layout artifact 中每个 reaction 有 x/y。
- [ ] layout artifact 中保留 similarity basis 和 warnings。
- [ ] Web map 能显示点、边、cluster color。
- [ ] 点选 reaction 能打开 detail。
- [ ] cluster inspector 显示 confidence 和 warnings。

### 12.2 工程验收

- [ ] TMAP 不进入 `apps/web` bundle。
- [ ] TMAP 不强行加入现有 `chem-service`。
- [ ] layout job 可独立运行。
- [ ] semantic-only cluster 不被标成 high-confidence chemical similarity。

### 12.3 数据验收

- [ ] computed fingerprint 缺失时 warning 明确。
- [ ] RXNFP/RXNMapper 失败时不阻断 semantic graph。
- [ ] cluster training use recommendation 可被导出。

---

## 13. 风险与应对

### 13.1 TMAP 安装风险

风险：

- conda 依赖和 Windows 支持有约束。

应对：

- 先做独立环境 spike。
- worker 支持跳过 TMAP，只输出 edge list。
- 失败时 Web 仍可显示 cluster list。

### 13.2 化学表征质量风险

风险：

- OCR 或解析错误会污染 RXNFP/atom mapping。

应对：

- 低质量 reaction 不进入 embedding。
- embedding status 和 warning 必须存回 feature。

### 13.3 视觉误导风险

风险：

- 用户可能把二维距离误读为严格化学距离。

应对：

- Inspector 展示 similarity basis。
- 图例说明 layout source。
- 默认隐藏低置信 edge 或弱化显示。

### 13.4 聚类算法和 layout 混淆

风险：

- 把 TMAP 当作 cluster label 来源。

应对：

- 文档和类型中明确区分 `cluster_id` 与 `layout_id`。
- TMAP 只生成 x/y 和 MST/layout edges。

---

## 14. 分阶段实施

### Phase 0：数据合同

- 定义 `ChemdReactionClusterLayoutV1`。
- 定义 cluster training use recommendation。
- 明确 graph index 到 layout artifact 的映射。

### Phase 1：Semantic edge layout

- 从 `reaction_similarity_edges` 生成 edge list。
- 调用 TMAP `LayoutFromEdgeList`。
- 输出 layout artifact。

### Phase 2：Web map MVP

- 实现 Canvas map。
- 实现 reaction inspector。
- 实现 cluster inspector。
- 支持 warning/filter。

### Phase 3：RXNFP

- 标准化 reaction SMILES。
- 生成 RXNFP embedding。
- 生成 kNN edge。
- 与 semantic layout 对比。

### Phase 4：RXNMapper

- 生成 atom mapping。
- 提取 reaction center。
- 增强 cluster basis。

### Phase 5：训练闭环

- 人工审查 cluster/edge。
- 审查结果进入 training experience。
- cluster 结果参与 dataset projection。

---

## 15. 推荐 MVP 任务拆分

### Task 1：Layout artifact schema

范围：

- 新增文档和类型草案。
- 不改数据库。

验收：

- schema 覆盖 nodes、edges、clusters、warnings、layout metadata。

### Task 2：Graph index to edge list

范围：

- 读取 `ChemdTrainingGraphIndexV1`。
- 输出 TMAP input edge list。

验收：

- semantic edge basis 不丢失。
- score 和 warning 可回填。

### Task 3：TMAP worker spike

范围：

- 独立 conda 环境。
- 最小 Python 脚本。
- 输入 edge list，输出 x/y。

验收：

- 不影响 pnpm workspace。
- 不影响现有 `chem-service`。

### Task 4：Cluster map viewer

范围：

- Web canvas component。
- 读取静态 layout artifact。
- 支持点选和 inspector。

验收：

- 1k points 流畅。
- 点选 reaction 能定位 detail。

---

## 16. 最终建议

建议 Chemd 采用以下策略：

1. 先把当前 semantic graph index 可视化，不等待 RXNFP/RXNMapper。
2. TMAP 先用 `LayoutFromEdgeList`，减少依赖和数据模型侵入。
3. 聚类标签由 Chemd graph/cluster job 生成，TMAP 只生成 layout。
4. Web 使用 Canvas/WebGL 自研展示，不使用 Faerun 作为产品前端。
5. RXNFP/RXNMapper 放到第二阶段，作为化学相似性增强。
6. 每条边、每个 cluster、每个 layout 都必须保留 basis、confidence、warnings。

---

## 17. 参考依据

外部源码：

- TMAP repo：https://github.com/reymond-group/tmap
- TMAP README：https://github.com/reymond-group/tmap/blob/master/README.md
- TMAP API 文档：https://github.com/reymond-group/tmap/blob/master/doc/md/tmap.md
- TMAP ChEMBL 示例：https://github.com/reymond-group/tmap/blob/master/examples/chembl/chembl.py
- TMAP DrugBank 示例：https://github.com/reymond-group/tmap/blob/master/examples/drugbank/drugbank.py

Chemd 当前依据：

- `packages/exporter-training/src/graph-index.ts`
- `packages/exporter-training/src/graph-index-types.ts`
- `packages/storage-postgres/src/schema.ts`
- `docs/chemd-v0.3-training-understanding-expert-architecture.zh-CN.md`
- `docs/chemd-model-knowledge-prediction-architecture.zh-CN.md`
