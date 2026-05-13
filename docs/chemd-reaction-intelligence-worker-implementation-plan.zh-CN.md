# Chemd Reaction Intelligence Worker 实施计划

状态：设计完成，待实施
更新时间：2026-05-13
目标：在不污染 Desktop IDE、`chem-service` 和前端 bundle 的前提下，引入 RXNMapper、RXNFP、fingerprint 与 TMAP，形成可解释的 hybrid reaction similarity graph。

---

## 1. 结论

Chemd 应采用 **应用发布体系内的本地独立 worker/sidecar**，默认不走外部 API。

```text
Chemd Desktop / CLI
  -> 导出 reaction graph index
  -> 调用本地 services/chem-cluster-service
      -> RDKit fingerprint provider
      -> RXNMapper provider
      -> RXNFP provider
      -> hybrid similarity builder
      -> TMAP layout provider
  -> 写回 intelligence artifacts
  -> Desktop 只读取 artifact 展示
```

关键原则：

- 本地优先：用户实验反应默认不上传外部服务。
- 独立环境：模型依赖不进入 `apps/desktop`、`apps/web`、`services/chem-service`。
- 可降级：任一 provider 缺失或失败时输出 `SKIP` / `ERROR` / `fallback`，不阻塞 IDE authoring。
- 可追溯：每条 embedding、mapping、reaction-center、similarity edge 都记录 source hash、provider、model version、参数和 warnings。
- 先稳后强：先做 RDKit/fingerprint baseline，再接 RXNMapper/RXNFP，最后合成 hybrid graph。

---

## 2. 开源代码库研究结论

本计划基于以下开源仓库当前 HEAD 与本地浅克隆/官方 raw 文档研究：

| 仓库 | HEAD | 与 Chemd 的关系 | 结论 |
| --- | --- | --- | --- |
| `rxn4chemistry/rxnmapper` | `a01ecdcd5ac944850e9691739c1df858e005fd39` | atom mapping / reaction center | 可作为本地 worker provider；模型随 package data 分发，`BatchedMapper` 已有批处理和错误隔离。 |
| `rxn4chemistry/rxnfp` | `6fd48f4927c2178555cc5d71dbfb225fb178f43c` | reaction embedding / nearest neighbor | 可作为独立 embedding provider；依赖较旧，不能并入 `chem-service`。 |
| `reymond-group/tmap` | `edd29345a16c992a79ad2e2e469da8d38cc448ca` | layout generator | 适合离线 layout；`LayoutFromEdgeList(vertex_count, edges, config, create_mst)` 正好匹配 Chemd 已有 edge list。 |

### 2.1 RXNMapper

代码入口：

- `rxnmapper.RXNMapper`
- `rxnmapper.BatchedMapper`
- `RXNMapper.get_attention_guided_atom_maps(rxns, detailed_output=...)`
- `BatchedMapper.map_reactions_with_info(reaction_smiles, detailed=...)`

依赖和模型：

- `python_requires >= 3.6`
- `torch >= 1.5.0`
- `transformers >= 4.0.0,<5.0.0`
- optional `rdkit`
- 默认模型路径在 package data：`models/transformers/albert_heads_8_uspto_all_1310k`

输出能力：

```json
{
  "mapped_rxn": "... atom-mapped reaction SMILES ...",
  "confidence": 0.9565,
  "pxr_mapping_vector": "... detailed mode only ...",
  "pxr_confidences": "... detailed mode only ...",
  "mapping_tuples": "... detailed mode only ..."
}
```

对 Chemd 的设计影响：

- 用 `BatchedMapper` 作为默认 provider，而不是直接循环 `RXNMapper`。
- 默认 `detailed=true`，以便提取 reaction center。
- 输入必须是标准 reaction SMILES；Chemd 需要在 worker 前建立 `reaction_entity_id -> canonical_rxn_smiles` 合同。
- 单条失败不能中断批次；空结果或异常要转成 per-reaction warning。

### 2.2 RXNFP

代码入口：

- `rxnfp.transformer_fingerprints.RXNBERTFingerprintGenerator`
- `rxnfp.transformer_fingerprints.get_default_model_and_tokenizer`
- `rxnfp.transformer_fingerprints.generate_fingerprints`
- `RXNBERTFingerprintGenerator.convert_batch(rxns)`

依赖和风险：

- README 推荐 `conda create -n rxnfp python=3.6`
- 推荐 `rdkit=2020.03.3`
- package requirements 包含 `transformers>=4.5.0`、`torch>=1.6`、`scipy==1.4.1`、`scikit-learn==0.23.1`、`faerun==0.3.20`
- Minhash 版本直接 `import tmap as tm`

输出能力：

- `RXNBERTFingerprintGenerator.convert()` 返回 BERT `[CLS]` float embedding。
- `convert_batch()` 返回批量 embedding。
- `RXNBERTMinhashFingerprintGenerator` 能转 MinHash，但会直接依赖 `tmap`。

对 Chemd 的设计影响：

- 第一阶段只接 float embedding，不把 RXNFP MinHash 作为必选路径。
- RXNFP provider 单独环境运行，不和 RDKit/OCR/render service 混装。
- 需要缓存：`reaction_hash + rxnfp_model_id + normalization_version -> embedding_ref`。
- 需要记录 embedding dimension、model name、device、batch size。

### 2.3 TMAP

代码/API 入口：

- Python 包名实际是 `tmap-viz`，import 名是 `tmap`。
- README 建议通过 conda 安装：`conda install -c tmap tmap`。
- 官方示例常用 `tm.LSHForest` + `tm.layout_from_lsh_forest`。
- C++/Python 文档提供 `LayoutFromEdgeList(vertex_count, edges, config, create_mst)`，输入 edge list 形如 `(from, to, weight)`，返回 `x`、`y`、`s`、`t` 和 `GraphProperties`。

构建/运行风险：

- CMake + C++17 + pybind11。
- 依赖 OGDF/COIN/OpenMP。
- Windows 支持依赖 WSL/工具链边界，不能作为 Desktop authoring 前置依赖。

对 Chemd 的设计影响：

- TMAP 只做离线 layout worker，不进前端 bundle。
- Chemd 已有 `ReactionMapWorkerLayoutInput`，可以稳定转成 vertex index + weighted edge list。
- 当 `tmap` 不可导入时保持现有 `SKIP` / `ERROR` / fallback 行为。
- TMAP 不负责 cluster label，只负责坐标和 MST/layout edges。

---

## 3. 与当前 Chemd 基线的关系

当前已存在：

- `packages/exporter-training`：`ChemdTrainingGraphIndexV1`、reaction features、semantic similarity edges。
- `packages/reaction-map`：`ReactionMapLayout`、`ReactionMapWorkerLayoutInput`、edge kind 已预留 `"semantic" | "fingerprint" | "rxnfp" | "reaction_center" | "hybrid"`。
- `services/chem-cluster-service`：deterministic fallback layout worker、输入归一化、缺 TMAP 分类。
- Desktop knowledge map：可显示 cluster、edge basis、warnings、source-ref。

当前缺口：

- 没有 computed reaction fingerprint artifact。
- 没有 RXNFP embedding artifact。
- 没有 RXNMapper atom mapping artifact。
- 没有 reaction center feature extractor。
- 没有 hybrid similarity graph builder。
- TMAP worker 还没有真正调用 `LayoutFromEdgeList`。

---

## 4. 目标合同

### 4.1 Reaction Intelligence Job Input

新增 JSON contract：

```ts
interface ChemdReactionIntelligenceJobInputV1 {
  schema_version: "chemd-reaction-intelligence-job/v0.1";
  job_id: string;
  graph_index_id: string;
  source_compile_run_ids: string[];
  reactions: Array<{
    reaction_entity_id: string;
    document_id: string;
    source_range?: unknown;
    canonical_rxn_smiles: string;
    participant_signature: string;
    reaction_family?: string;
    procedure_signature?: string;
    condition_signature?: string;
    source_hash: string;
  }>;
  requested_providers: Array<
    "rdkit_fingerprint" | "rxnmapper" | "rxnfp" | "hybrid_graph" | "tmap_layout"
  >;
  provider_policy: {
    missing_dependency: "skip" | "error" | "fallback";
    per_reaction_failure: "warn" | "error";
    allow_network: false;
  };
}
```

### 4.2 Reaction Intelligence Artifact

新增 JSON contract：

```ts
interface ChemdReactionIntelligenceArtifactV1 {
  schema_version: "chemd-reaction-intelligence-artifact/v0.1";
  artifact_id: string;
  job_id: string;
  graph_index_id: string;
  generated_at: string;
  providers: Array<{
    provider_id: string;
    kind: "rdkit_fingerprint" | "rxnmapper" | "rxnfp" | "hybrid_graph" | "tmap_layout";
    status: "PASS" | "SKIP" | "ERROR";
    package_name?: string;
    package_version?: string;
    model_id?: string;
    model_hash?: string;
    warnings: string[];
  }>;
  reaction_features: ChemdComputedReactionFeatureV1[];
  similarity_edges: ChemdComputedReactionSimilarityEdgeV1[];
  layout?: ChemdReactionClusterLayoutV1;
  warnings: string[];
}
```

### 4.3 Computed Reaction Feature

```ts
interface ChemdComputedReactionFeatureV1 {
  reaction_entity_id: string;
  source_hash: string;
  canonical_rxn_smiles: string;
  fingerprint_refs: Array<{
    feature_ref_id: string;
    provider: "rdkit" | "rxnfp";
    kind: "bit_vector" | "float_embedding" | "minhash";
    dimension: number;
    storage: "inline" | "sidecar_file" | "postgres_vector";
    hash: string;
  }>;
  atom_mapping?: {
    provider: "rxnmapper";
    mapped_rxn: string;
    confidence: number;
    mapping_hash: string;
    warnings: string[];
  };
  reaction_center?: {
    provider: "rxnmapper_derived";
    center_signature: string;
    changed_bonds: string[];
    changed_atoms: string[];
    confidence: "high" | "medium" | "low";
    warnings: string[];
  };
  warnings: string[];
}
```

---

## 5. Worker 架构

### 5.1 包结构

扩展现有服务，不新增第二个 Python service：

```text
services/chem-cluster-service/
  chem_cluster_service/
    cli.py
    layout.py
    intelligence/
      __init__.py
      contracts.py
      io.py
      providers/
        rdkit_fingerprint.py
        rxnmapper_provider.py
        rxnfp_provider.py
        tmap_layout.py
      reaction_center.py
      similarity.py
      pipeline.py
      classify.py
  tests/
    test_intelligence_contracts.py
    test_rdkit_fingerprint_provider.py
    test_rxnmapper_provider.py
    test_rxnfp_provider.py
    test_reaction_center.py
    test_hybrid_similarity.py
    test_tmap_layout_provider.py
```

### 5.2 CLI

现有 layout CLI 保留，新增 intelligence CLI：

```bash
cd services/chem-cluster-service
python -m chem_cluster_service.intelligence.cli \
  --input job.json \
  --output artifact.json \
  --providers rdkit_fingerprint,rxnmapper,rxnfp,hybrid_graph,tmap_layout \
  --missing-dependency skip \
  --pretty
```

返回码约定：

| 场景 | exit code | artifact |
| --- | --- | --- |
| 所有请求 provider 完成 | 0 | `PASS` |
| 可选 provider 缺失，策略为 `skip` | 0 | provider `SKIP` |
| provider 失败但 per-reaction 可降级 | 0 | reaction warnings |
| 必选 provider 缺失，策略为 `error` | 2 | provider `ERROR` |
| 输入 contract 无效 | 1 | validation error envelope |

### 5.3 Provider 边界

Provider 必须实现统一接口：

```python
class ReactionIntelligenceProvider(Protocol):
    provider_id: str
    kind: str

    def inspect(self) -> ProviderInspection:
        ...

    def run(self, reactions: list[ReactionInput]) -> ProviderResult:
        ...
```

`inspect()` 只检查依赖和版本，不加载大模型；`run()` 才加载模型。

---

## 6. Similarity 策略

### 6.1 Edge basis

新增 computed basis：

```ts
type ChemdComputedSimilarityBasisV1 =
  | "rdkit_fingerprint_tanimoto"
  | "rxnfp_cosine"
  | "same_reaction_center"
  | "compatible_reaction_center"
  | "semantic_family_support"
  | "semantic_procedure_support"
  | "hybrid_consensus";
```

### 6.2 Score 合成

第一版采用可解释线性权重，不引入训练模型：

```text
hybrid_score =
  0.30 * semantic_score
  + 0.25 * rdkit_fingerprint_score
  + 0.25 * rxnfp_cosine_score
  + 0.20 * reaction_center_score
```

降级规则：

- 缺某一项时按可用权重重新归一化。
- 只有 semantic 时，edge 继续带 `semantic_similarity_without_computed_fingerprint`。
- RXNMapper confidence 低于阈值时，reaction center edge 不能作为 high confidence。
- RXNFP embedding 维度不一致时，该 batch `ERROR`，不生成 RXNFP edge。

### 6.3 Confidence

| 条件 | confidence |
| --- | --- |
| hybrid_score >= 0.85 且至少两个 computed provider 支撑 | `high` |
| hybrid_score >= 0.65 且至少一个 computed provider 支撑 | `medium` |
| 只有 semantic 或 warnings 非空 | `low` |

---

## 7. 实施阶段

### Phase 0：合同和基线测试

目标：先冻结 JSON contract，不接真实模型。

任务：

- [x] 在 `packages/reaction-map` 定义 TS contract，不新增 workspace package。
- [x] 在 `services/chem-cluster-service/chem_cluster_service/intelligence/contracts.py` 定义 Python TypedDict 与轻量 validation helper。
- [x] 写 fixture：2 个 esterification、2 个 Suzuki、1 个无效 reaction。
- [x] 写 schema round-trip 测试，覆盖 job input、artifact、provider status、computed feature、computed edge 字段。
- [x] 文档更新：本文件记录 Phase 0 Worker B 合同冻结状态；后续生产实施计划互链由集成切片统一补齐。

验收：

- [x] Python contract tests 通过。
- [x] TS contract tests 通过。
- [x] fixture 能从现有 `ChemdTrainingGraphIndexV1` 生成 job input。

状态记录（Worker B / `reaction-intel-contracts`）：

- 固定 `chemd-reaction-intelligence-job/v0.1` 与 `chemd-reaction-intelligence-artifact/v0.1` JSON contract。
- 仅提供 TS/Python 类型、fixture builder、required-field validation 与 round-trip 测试。
- 不接入 RDKit、RXNMapper、RXNFP、TMAP，也不新增 package、根 alias 或依赖。

### Phase 1：RDKit / fingerprint baseline

目标：先得到低风险 computed chemistry feature。

任务：

- [x] 独立 provider 检测 RDKit 可用性。
- [x] 从 `canonical_rxn_smiles` 生成 reactant/product fingerprints 或 reaction delta fingerprint。
- [x] 输出 `feature_ref_id`、dimension、hash、warnings。
- [x] 计算 Tanimoto edges。
- [x] 把 edge basis 写成 `rdkit_fingerprint_tanimoto`。

验收：

- [x] RDKit 缺失时 provider `SKIP`，IDE 不受影响。
- [x] 指纹相同/相似反应生成 computed edge。
- [x] 无效 SMILES 只产生 per-reaction warning。

状态记录（Worker C / `reaction-intel-rdkit-baseline`）：

- 新增 `rdkit_fingerprint.py`，真实 RDKit adapter 懒加载依赖；缺失时 provider 返回 `SKIP`。
- PASS 路径通过可注入 fake adapter 测试，不要求本机安装 RDKit。
- fingerprint refs 使用 inline bit vector refs，记录 `feature_ref_id`、`provider`、`kind`、`dimension`、`storage`、`hash`、`bit_indices`。
- 相似度边使用 Tanimoto，basis 固定为 `rdkit_fingerprint_tanimoto`。
- 单条无效 reaction smiles 转为该 reaction 的 warning，不中断 batch。

### Phase 2：RXNMapper atom mapping

目标：生成 atom mapping 和 reaction center。

任务：

- [x] 新增 `rxnmapper_provider.py`。
- [x] 用 `BatchedMapper(batch_size=N)` 处理输入，并保留可注入 adapter 测试路径。
- [x] 默认 detailed 输出，保存 `mapped_rxn`、confidence、mapping hash。
- [x] 低 confidence / 空结果转 warning。
- [x] 从 mapped reaction 中提取 changed atoms / changed bonds / center signature。
- [x] 生成 `same_reaction_center` / `compatible_reaction_center` edges。

验收：

- [x] `rxnmapper` 缺失时 provider `SKIP`。
- [x] 单条 mapping 失败不影响 batch。
- [x] mapped_rxn 和 confidence 可回写 artifact。
- [x] reaction center edge 不会在低 confidence 时标成 high。

状态记录（Worker D / `reaction-intel-rxnmapper-center`）：

- 新增 `rxnmapper_provider.py`，真实 RXNMapper 依赖仅在 provider run 时加载；缺失时 provider 返回 `SKIP`。
- PASS 路径通过可注入 fake adapter 测试，不要求本机安装 RXNMapper。
- atom mapping 记录 `mapped_rxn`、confidence、`mapping_hash` 与 per-reaction warnings。
- `reaction_center.py` 从 atom-mapped reaction 提取 `center_signature`、changed atoms 与 changed bonds；无法可靠提取时返回 low confidence warning。
- provider result 返回 reaction-center computed edges，basis 为 `same_reaction_center` 或 `compatible_reaction_center`，低 confidence 不会提升为 high。

### Phase 3：RXNFP embedding

目标：生成 reaction embedding 和 nearest-neighbor edges。

任务：

- [x] 新增 `rxnfp_provider.py`。
- [x] 独立加载 `get_default_model_and_tokenizer()`。
- [x] 用 `RXNBERTFingerprintGenerator.convert_batch()` 生成 float embedding。
- [x] 输出 sidecar refs，避免把大向量内联到主 artifact；测试可使用小向量 inline。
- [x] 计算 cosine similarity top-k。
- [x] 生成 `rxnfp_cosine` edges。

验收：

- [x] RXNFP 依赖缺失时 provider `SKIP`。
- [x] embedding 记录 model id、dimension、hash。
- [x] top-k edge 可稳定复现。
- [ ] embedding 缓存命中时不重复加载模型。

状态记录（Worker E / `reaction-intel-rxnfp-baseline`）：

- 新增 `rxnfp_provider.py`，真实 RXNFP adapter 只在 run 路径加载模型；缺失依赖时 provider 返回 `SKIP`。
- PASS 路径通过可注入 fake adapter 测试，不要求本机安装 RXNFP。
- embedding ref 默认使用 `sidecar_file`，记录 `model_id`、dimension、hash、device 与 batch size；测试中的小向量可 inline。
- cosine top-k edge 使用 basis `rxnfp_cosine`。
- embedding 维度不一致时 provider 标记 `ERROR`，不生成错误 edge。
- 缓存持久化和模型复用策略仍留给 Phase 6 pipeline / artifact cache 统一处理。

### Phase 4：Hybrid similarity graph

目标：合并 semantic、fingerprint、RXNFP、reaction center。

任务：

- [x] 读取现有 `reaction_similarity_edges` 作为 semantic base。
- [x] 读取 computed provider edges。
- [x] 按 pair 合并 basis、score、warnings、provider_ids、source_hashes。
- [x] 应用 hybrid score 和 confidence 规则。
- [x] 输出 `ChemdComputedReactionSimilarityEdgeV1`。
- [ ] 更新 `@chemd/reaction-map` 让 computed edge 进入 layout。

验收：

- [x] semantic-only edge 仍带 warning。
- [x] computed 支撑 edge 可升为 medium/high。
- [ ] UI 能区分 semantic、fingerprint、rxnfp、reaction_center、hybrid。

状态记录（Worker F / `reaction-intel-hybrid-similarity`）：

- 新增 `similarity.py`，接受 semantic graph edge 与 computed provider edge 两类输入。
- 按 pair 稳定合并 basis、score、warnings、provider_ids、source_hashes。
- 固定权重为 semantic 0.30、RDKit 0.25、RXNFP 0.25、reaction center 0.20，缺项时按可用权重重归一。
- semantic-only edge 保留 `semantic_similarity_without_computed_fingerprint`，computed 支撑可提升为 medium/high；warnings 非空不标 high。
- layout/UI 消费 computed hybrid edge 仍留给 Phase 6 桌面集成切片。

### Phase 5：TMAP LayoutFromEdgeList

目标：替换 worker 中“tmap 可用但仍 fallback”的占位实现。

任务：

- [x] 在 `tmap_layout.py` 中导入 `tmap`。
- [x] 建立 `reaction_entity_id <-> vertex_index` 映射。
- [x] 生成 `(from_index, to_index, weight)` edge list。
- [ ] 调用 `LayoutConfiguration()`。
- [x] 调用 `layout_from_edge_list` 或对应 Python binding。
- [x] 输出 positions 和 MST edges。
- [x] 保留当前 deterministic fallback。

验收：

- [ ] `--engine tmap` 在有 tmap 环境时输出 `layout_engine: "tmap"`。
- [x] tmap 缺失时 `SKIP` / `ERROR` / fallback 行为保持。
- [x] layout artifact 保留 input edge kind、basis、warnings。

状态记录（Worker G / `reaction-intel-tmap-layout`）：

- 新增 `providers/tmap_layout.py`，真实 TMAP 依赖通过 adapter 隔离；缺失时 provider 返回 `SKIP`。
- provider 支持 `skip` / `error` / `fallback` 策略，fallback 生成 deterministic layout。
- adapter 路径接收 vertex count 与 weighted edge list，输出 positions、MST edges 与 warnings。
- layout artifact 保留 vertex index 映射、edge basis 与 edge warnings。
- 真实 TMAP Windows 环境和 `LayoutConfiguration()` 参数调优仍需在有 TMAP 运行时的机器上验收。

### Phase 6：Desktop / CLI 集成

目标：IDE 只消费 artifact，不直接跑模型。

任务：

- [x] CLI 增加 `python -m chem_cluster_service.intelligence.cli` worker 入口。
- [x] Desktop 增加“Run intelligence job”入口，默认后台任务。
- [x] 显示 provider 状态：PASS / SKIP / ERROR 摘要。
- [x] Knowledge map 增加 edge basis filter。
- [x] Cluster inspector 展示 computed evidence。
- [x] Artifact 存入 workspace local store；DB 可用时再同步仍留给 shared schema 阶段。

验收：

- [x] 没有模型依赖时 worker CLI 输出 `SKIP` / fallback artifact，不阻塞 IDE 编辑链路。
- [x] 有 artifact 时 cluster/map 展示 computed basis。
- [x] source-ref 和 reaction detail 跳转保持可用。

状态记录（Worker H / `reaction-intel-pipeline-cli` + 主控集成）：

- 新增 `intelligence/io.py`、`pipeline.py`、`cli.py`，支持读取 job、验证 contract、执行 provider、写出 artifact。
- pipeline 已接入 RDKit、RXNMapper、RXNFP、hybrid graph 与 TMAP layout provider。
- provider dependency policy 支持 `skip` / `error` / `fallback`；invalid job input exit 1，missing dependency error exit 2，skip/fallback exit 0。
- fixture CLI smoke 已验证：无真实 RDKit/RXNMapper/RXNFP/TMAP 依赖时，5 个 provider 均可分类，artifact contract validation 通过，并在 fallback 策略下写出 layout。
- Desktop 后台任务入口和 edge basis filter 仍留给下一轮桌面集成切片。

状态记录（Desktop artifact / UI 消费集成）：

- 新增 `save_local_reaction_intelligence_artifact` 与 `list_local_reaction_intelligence_artifacts` Tauri 命令契约，artifact 以独立 JSON local-store 文件保存，不进入 runtime outbox。
- 新增 `buildLocalReactionIntelligenceArtifactInput`，使用 graph index / artifact id / job id 生成稳定 local id 与 idempotency key。
- Knowledge map view model 保持 `buildDesktopKnowledgeMapViewModel(output)` 兼容，并可选消费 reaction intelligence artifact，展示 provider PASS/SKIP/ERROR、computed edge count、basis、warnings 与 TMAP layout 来源。
- Cluster inspector 已区分 computed basis 与 semantic basis，包含 hybrid/computed edge 时不再被 warning 中的 `fingerprint` 字样误标为 semantic-only。
- 本轮不启动真实模型、不联网、不接 PostgreSQL artifact sync；真实 worker 后台任务入口和 shared schema 同步仍是后续产品化项。

状态记录（Desktop artifact 读取 / edge filter 集成）：

- Knowledge map 新增 edge basis options 与 basis filter，和 cluster filter 可组合生效；无匹配 edge 时显示空过滤状态。
- Desktop App 现在会通过 `list_local_reaction_intelligence_artifacts` 读取本地最新 artifact，并传入 knowledge map view model。
- 为避免跨文档污染，App 注入前会校验 artifact reaction ids 与当前 compile output 的 reaction ids 有交集；不匹配时按无 artifact 降级。
- `App.tsx` focused ESLint 仍有既有复杂度/函数长度 3 项，按当前策略记录到最终 UI 组件化/复杂度治理阶段，不阻塞本轮功能主线。

状态记录（Desktop Run intelligence job 本地入口）：

- 新增 `run_reaction_intelligence_worker` Tauri command，桌面端可一次性调用
  `services/chem-cluster-service` 的 reaction intelligence CLI；找不到 service、Python
  或缺少真实模型依赖时返回结构化 `skipped`/`failed` 与日志 tail，不阻断 IDE 编辑链路。
- 新增纯 TS job controller，封装 run worker -> save artifact -> refresh latest artifact
  状态机，并覆盖 worker failed/skipped、无 artifact、save failed、latest refresh failed
  与并发 guard。
- 新增 desktop job builder：只有 reaction 的 reactants/products 能解析到真实
  `smiles`/`canonical_smiles` 时才构造 `canonical_rxn_smiles`；结构数据缺失时返回
  `skipped`，不从 symbol label 伪造化学反应。
- Local Store 面板新增 “Run intelligence job” 入口，成功后 artifact 写入本地
  local store，并触发本地 artifact refresh；默认 Suzuki sample 已补齐 molecule SMILES，
  可生成合法 job。
- 当前仍未做长时间 worker 的取消/超时 UI、后台队列持久化、以及 artifact shared
  schema/PostgreSQL sync；这些进入后续产品化硬化阶段。

状态记录（Desktop worker timeout / source jump 硬化）：

- `run_reaction_intelligence_worker` 增加 `timeoutMs` 可选输入，默认 120s，并对过小/过大
  值做 clamp；执行改为 bounded child wait，超时后只 kill 自己启动的直接 child，并返回
  `reaction_intelligence_worker_timeout`，保留可获得的 stdout/stderr tail。
- Knowledge map 的 source-ref/evidence action 已接到 Monaco editor：当前文件匹配时
  设置 selection、reveal range 并 focus editor；跨文件 source ref 只提示当前阶段不自动
  打开其它文件，避免跳错文件。
- 当前未做真实模型长挂 smoke，也未做后台任务取消按钮或持久队列；这些归后续 release
  hardening / background job 产品化阶段。

状态记录（Shared schema adapter / workspace outbox bridge）：

- `@chemd/storage-postgres` 新增 reaction intelligence runtime adapter，可把 artifact
  similarity edge 转为 shared schema runtime graph edge，保留 basis、provider、source
  hash、artifact/job id、warnings 与 computed feature evidence；adapter 直接引用
  `@chemd/reaction-map` 的 artifact 类型和 schema 常量，避免复制合同。
- Desktop workspace ingest 新增 outbox bridge，可把带 `runtimePayload` 的 pending /
  retryable failed queue item 幂等转为 Local Store snapshot input；skipped、synced、
  running、缺 payload、retry exhausted 都有结构化原因。
- 当前仍未把 reaction intelligence artifact sync 接到 Tauri command/UI，也未跑真实
  artifact PostgreSQL 写入；这一步进入后续 M5/M6 集成。

状态记录（Workspace ingest runner / diagnostics provider coverage）：

- Desktop workspace ingest 新增纯 TypeScript outbox save runner，串联 workspace
  ingest、outbox input 构造与注入式 `saveSnapshot`；eligible / retryable item 会写入
  本地 snapshot outbox，单条保存失败会脱敏记录并继续后续 item。
- Diagnostics bundle 已覆盖 reaction intelligence worker、local artifact 与 outbox
  sync command 清单，并新增 provider/model/artifact/sync 的支持上下文分类。
- 当前验证：desktop workspace ingest runner/local store Vitest 33/33、diagnostics
  Node 测试 8/8、Rust diagnostics tests 3/3、focused ESLint、`pnpm typecheck`、
  `pnpm test`、desktop build 与完整 Tauri `cargo test` 均通过。
- 当前仍未执行真实 provider/model/DB 写入；这些按环境增强路径记录为 `SKIP`，
  不阻塞离线优先主线。

状态记录（Workspace ingest UI/Tauri local save）：

- Desktop Local Store 面板的 Scan/Ingest 已从内存队列切换为
  `runWorkspaceIngestOutboxSave`，每个可编译 workspace 文档复用 runtime payload
  builder 构造 Graph/RAG snapshot，并通过 `save_local_runtime_snapshot` 写入本地
  outbox。
- UI 完成态现在显示 scan count 与 runner save 摘要，运行后刷新 Local Store 状态；
  pending outbox count 可反映 workspace ingest 产生的本地同步队列。
- 当前验证：desktop workspace ingest runner/local store Vitest 33/33、desktop
  typecheck、`pnpm typecheck`、`pnpm test`、desktop build 与 `git diff --check`
  均通过；focused ESLint 仍仅报 `App.tsx` 既有复杂度/函数长度 4 项，按 M11 处理。

---

## 8. 验证矩阵

### Python

```bash
python -m unittest discover services/chem-cluster-service/tests
python -m compileall services\chem-cluster-service\chem_cluster_service services\chem-cluster-service\tests
```

可选环境：

```bash
python -m chem_cluster_service.intelligence.cli --input fixtures/job.json --output artifacts/intelligence.json --providers rdkit_fingerprint --missing-dependency skip
python -m chem_cluster_service.intelligence.cli --input fixtures/job.json --output artifacts/intelligence.json --providers rxnmapper --missing-dependency skip
python -m chem_cluster_service.intelligence.cli --input fixtures/job.json --output artifacts/intelligence.json --providers rxnfp --missing-dependency skip
python -m chem_cluster_service.cli --input artifacts/layout-input.json --output artifacts/layout.json --engine tmap --missing-tmap skip
```

### TypeScript

```bash
pnpm --filter @chemd/reaction-map test
pnpm --filter @chemd/reaction-map typecheck
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/desktop typecheck
```

### Full regression

```bash
pnpm typecheck
pnpm test
pnpm --filter @chemd/desktop build
```

### Smoke

```bash
pnpm desktop:offline-core-smoke
pnpm desktop:runtime-smoke
```

---

## 9. 风险与决策

| 风险 | 影响 | 决策 |
| --- | --- | --- |
| RXNFP 依赖老旧 | 安装失败、污染环境 | 独立 conda/venv worker，默认可 SKIP |
| RXNMapper 模型较大 | 启动慢、包体积增加 | 模型只在 provider run 时加载，artifact 缓存 |
| TMAP Windows 工具链复杂 | clean install 不稳定 | 默认 fallback，TMAP 作为可选 provider |
| 用户私有反应外泄 | 合规风险 | 默认禁用 external API，`allow_network: false` |
| semantic edge 被误解为化学相似 | 产品误导 | UI 强制显示 basis/warnings |
| hybrid score 不可解释 | 研究结果不可审计 | 第一版用固定权重并记录每项 score |
| mapping 低置信污染 center | 错误聚类 | confidence 阈值和 review_required warning |

---

## 10. 并行实施建议

可以拆成 4 个不冲突 worktree：

| 分支 | 写入范围 | 目标 |
| --- | --- | --- |
| `reaction-intel-contracts` | `packages/reaction-map/**`、`services/chem-cluster-service/chem_cluster_service/intelligence/contracts.py`、docs | 合同和 fixture |
| `reaction-intel-rdkit-mapper` | `services/chem-cluster-service/chem_cluster_service/intelligence/providers/rdkit_fingerprint.py`、`rxnmapper_provider.py`、tests | RDKit + RXNMapper |
| `reaction-intel-rxnfp` | `services/chem-cluster-service/chem_cluster_service/intelligence/providers/rxnfp_provider.py`、tests | RXNFP embedding |
| `reaction-intel-hybrid-tmap` | `services/chem-cluster-service/chem_cluster_service/intelligence/similarity.py`、`tmap_layout.py`、`packages/reaction-map/**` | hybrid graph + TMAP layout |

串行保留：

- 根依赖、lockfile、环境模板。
- Desktop command/UI 接入。
- release smoke 和 clean-machine 验收。

---

## 11. 完成定义

第一阶段生产可接受：

- [ ] 无 RXNFP/RXNMapper/TMAP 环境时，所有 provider 明确 `SKIP`，IDE 不受影响。
- [ ] 有 RDKit 时可生成 computed fingerprint edge。
- [ ] 有 RXNMapper 时可生成 atom mapping 与 reaction center。
- [ ] 有 RXNFP 时可生成 embedding 与 cosine edge。
- [ ] 有 TMAP 时可从 edge list 生成 layout artifact。
- [ ] hybrid edge 明确记录 semantic/fingerprint/rxnfp/reaction_center basis。
- [ ] Desktop 能显示 provider 状态、computed edge basis、warnings。
- [ ] `pnpm typecheck`、`pnpm test`、Python worker tests 通过。

第二阶段生产增强：

- [ ] worker 环境可随 installer 分发或按需下载。
- [ ] artifact 可同步到 PostgreSQL shared schema。
  - 已完成纯 adapter：artifact similarity edge 可转 shared schema runtime graph edge；
    Tauri command/UI 和真实 DB artifact smoke 尚未接入。
- [ ] clean-machine smoke 覆盖“无模型依赖”和“有本地 worker 依赖”两种路径。
- [ ] 人工审查 cluster/edge 可写回 training memory。
