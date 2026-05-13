# Chemd 反应智能内核实施计划

状态：进行中  
分支：`reaction-intelligence-core`  
基线：创建自当前 `HEAD`，不是 `develop` 合并线  
Trellis task：`.trellis/tasks/05-13-reaction-intelligence-core`

## 1. 目标

本阶段把 Chemd 的反应关联与聚类从“语义占位”推进到可生产使用的反应智能内核：

- 支持独立的本地 worker/sidecar 计算反应特征，不把重依赖强塞进 Web/IDE 入口。
- 接入 DRFP 作为默认 deterministic reaction fingerprint provider，生产聚类不依赖神经网络。
- 接入可选 RDKit reaction fingerprint、RXNMapper atom mapping/reaction center、RXNFP embedding。
- 生成 hybrid similarity graph：semantic + DRFP/RDKit fingerprint + RXNFP + atom mapping/reaction center。
- 可选输出 TMAP 兼容布局数据，但应用内默认展示普通 map/graph；TMAP 作为大规模反应空间投影，不作为基础节点渲染机制。
- 保持现有 `@chemd/exporter-training` 的 source truth 约束：没有真实向量或 mapping 时必须显式 SKIP/warning，不能伪造 fingerprint。

## 2. 开源库研究结论

### 2.1 RXNMapper

代码库：`rxn4chemistry/rxnmapper`。核心接口是 `RXNMapper` 与批处理 mapper，输出 atom-mapped reaction SMILES 以及 confidence。模型包默认依赖 transformers/torch，并使用预训练模型做 attention-guided atom mapping。

落地原则：

- 只能作为可选 provider，不能成为 Chemd 编译/导出主路径的硬依赖。
- provider 层返回 `mapped_rxn`、`confidence`、warnings，并由 Chemd 自己派生 reaction center signature。
- 低置信度、mapping 失败、依赖缺失都要进入 artifact/provider status，不能静默降级成 semantic。

### 2.2 RXNFP

代码库：`rxn4chemistry/rxnfp`。核心接口是 RXNBERT/RXNFP transformer fingerprint generator，典型输出是 CLS embedding。上游安装栈偏旧，依赖 torch/transformers/scipy/scikit-learn，生产环境应隔离。

落地原则：

- 作为独立 worker provider，主应用仅消费 embedding metadata、vector ref 或相似边。
- 默认不把完整高维向量写进单文档 training export；向量适合 sidecar cache / artifact ref。
- 测试必须支持 fake generator，避免 CI 因模型下载或 GPU/torch 环境失败。

### 2.3 TMAP

代码库：`reymond-group/tmap`。核心能力是把高维近邻图压成二维树/图布局，典型接口包含 edge list layout。它适合大规模 reaction space overview，不等价于思源/Logseq 的块节点渲染。

落地原则：

- 作为 optional layout provider：输入 similarity edge list，输出 node positions + layout diagnostics。
- 应用内没有必要强制显示 TMAP；小规模文档/引用图继续用普通节点图，只有成百上千反应、需要“反应空间地图”时再启用。
- tmap 的 C++/OpenMP/OGDF/COIN 安装风险不得阻塞 Chemd 基础功能。

### 2.4 DRFP

代码库：`reymond-group/drfp`。核心能力是从 reaction SMILES 的反应物/产物差异生成 deterministic reaction fingerprint。它不是神经网络，不需要训练，适合作为 Chemd 反应聚类的默认生产底座。

落地原则：

- 作为 optional provider lazy import；当前 `chem-service` Python 3.14 主环境不强制安装 DRFP。
- 有 DRFP 时优先使用 `drfp_tanimoto`，无 DRFP 时回退 `rdkit_tanimoto`。
- DRFP 与 RDKit 属于同一 fingerprint family，hybrid scoring 不得双算同类权重。
- 输出 deterministic clusters，并保留每条边的 contribution 和 warnings。

## 3. 架构边界

```text
Chemd compile/export
  -> ChemdTrainingUnderstandingV1
  -> buildTrainingGraphIndexFromUnderstandings()
  -> ReactionIntelligenceJob
  -> services/chem-service/chem_service/reaction_intelligence/*
  -> ReactionIntelligenceArtifact
  -> merge/enrich graph index for app/IDE consumption
```

边界规则：

- TypeScript 层定义稳定 schema、合并语义边、暴露 public API。
- Python `chem-service` 只负责重化学计算和可选布局。
- `apps/web`、未来 desktop IDE 不直接 import RDKit/RXNFP/RXNMapper。
- 外部 API 不是默认方案；默认是本机独立 worker。将来可加 remote provider，但必须复用同一 artifact contract。

## 4. 并行任务拆分

### A. Contract + TS graph index

Owner：子代理 A  
Write scope：

- `packages/exporter-training/src/reaction-intelligence-types.ts`
- `packages/exporter-training/src/reaction-intelligence.ts`
- `packages/exporter-training/src/index.ts`
- `packages/exporter-training/tests/reaction-intelligence.test.ts`

验收：

- 定义 job/artifact/provider/similarity/layout schema。
- 能把 computed artifact 合并进 graph index，不改变 source truth。
- 没有 computed feature 时维持现有 warnings。

### B. Python provider foundation + RDKit/RXNMapper/reaction center

Owner：子代理 B  
Write scope：

- `services/chem-service/chem_service/reaction_intelligence/contracts.py`
- `services/chem-service/chem_service/reaction_intelligence/providers/base.py`
- `services/chem-service/chem_service/reaction_intelligence/providers/rdkit_fingerprint.py`
- `services/chem-service/chem_service/reaction_intelligence/providers/rxnmapper_provider.py`
- `services/chem-service/chem_service/reaction_intelligence/reaction_center.py`
- `services/chem-service/tests/test_reaction_intelligence_providers.py`

验收：

- provider lazy import 外部依赖，缺失时返回 SKIP。
- 支持 fake toolkit/mapper 测试。
- reaction center signature 从 mapped reaction 派生并带 confidence/warnings。

### C. RXNFP + hybrid similarity + pipeline

Owner：子代理 C  
Write scope：

- `services/chem-service/chem_service/reaction_intelligence/providers/rxnfp_provider.py`
- `services/chem-service/chem_service/reaction_intelligence/similarity.py`
- `services/chem-service/chem_service/reaction_intelligence/pipeline.py`
- `services/chem-service/tests/test_reaction_intelligence_similarity.py`

验收：

- RXNFP provider lazy import，支持 fake generator。
- hybrid scoring 权重可配置，输出 basis 和 per-provider contribution。
- 不把 semantic-only 边伪装成 computed chemistry。

### D. TMAP layout + CLI/文档

Owner：子代理 D  
Write scope：

- `services/chem-service/chem_service/reaction_intelligence/providers/tmap_layout.py`
- `services/chem-service/chem_service/reaction_intelligence/cli.py`
- `services/chem-service/tests/test_reaction_intelligence_layout_cli.py`
- `services/chem-service/README.md`

验收：

- tmap 缺失时返回 SKIP。
- edge-list 到 layout 的转换稳定、可测试。
- CLI 可从 JSON job 生成 artifact JSON，便于 desktop/IDE 后续调用。

## 5. 串行整合项

由架构主会话负责：

- 合并各子分支，解决公共 `__init__.py`、README、index export 的冲突。
- 运行 package/service 定向测试，再运行根级 `pnpm test` 与 `pnpm typecheck`。
- 更新本文件进度、Trellis task、session journal。
- 安全删除已合并子 worktree 和本地子分支。

## 6. 生产可用验收

- Contract 可审计：TS 与 Python artifact 字段语义一致。
- Provider 可降级：RDKit/RXNMapper/RXNFP/TMAP 缺失时显式 SKIP。
- Graph 可解释：每条 computed similarity edge 有 basis、score、warnings。
- 不污染主入口：业务逻辑不写入 app 入口、主 Flask app 或大型单文件。
- 测试覆盖 good/base/bad：
  - 有真实或 fake computed features。
  - provider 缺失。
  - low confidence mapping。
  - semantic-only fallback。
  - TMAP optional layout。
- 文档说明何时应用内显示 TMAP，何时只使用普通 map。

## 7. 进度记录

- 2026-05-13：从当前 `HEAD` 创建 `reaction-intelligence-core` worktree。
- 2026-05-13：建立 Trellis task 与本实施计划。
- 2026-05-13：合入 TS graph sidecar contract，新增 `reaction_intelligence` graph layer 和 good/base/bad 测试。
- 2026-05-13：合入 Python RDKit/RXNMapper provider foundation，外部依赖均 lazy import，缺失时显式 SKIP。
- 2026-05-13：合入 RXNFP provider、hybrid similarity 和 pipeline，semantic-only 边不标记为 computed chemistry。
- 2026-05-13：合入 TMAP optional layout CLI；应用内默认不强制显示 TMAP，CLI 输出统一 artifact schema。
- 2026-05-13：主分支整合 provider key、status、artifact 字段命名，统一到 `chemd-reaction-intelligence-artifact/v0.1`。
- 2026-05-13：新增 DRFP hybrid reaction clustering 实施计划；DRFP 作为默认 deterministic fingerprint provider，RXNFP 保持 optional semantic embedding provider。
