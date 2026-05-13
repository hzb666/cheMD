# Chemd DRFP Hybrid Reaction Clustering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use Trellis workflow first. If dispatching implementation slices in this repo, use `parallel` / subagent-driven execution only for disjoint write scopes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 DRFP 引入 Chemd 反应智能内核，作为默认生产可用的反应 fingerprint 聚类底座，并与现有 RDKit、RXNFP、RXNMapper reaction center 和 semantic graph 形成可解释的 hybrid clustering pipeline。

**Architecture:** `chem-service` 新增可选 DRFP provider，主应用和 IDE 只消费 `ReactionIntelligenceArtifact`，不直接 import DRFP/RDKit/RXNFP/RXNMapper。聚类由 provider feature extraction、hybrid similarity edge、cluster assignment、layout/export 四层组成，缺失依赖必须显式 `SKIP`，不能伪造反应特征。

**Tech Stack:** TypeScript strict mode, Python 3.14 `chem-service`, optional DRFP worker/runtime, RDKit, RXNMapper, RXNFP, TMAP, Vitest, Python unittest/pytest, Ruff.

---

## 1. 背景与决策

当前 `reaction-intelligence-core` 已完成：

- TypeScript sidecar contract：`packages/exporter-training/src/reaction-intelligence-types.ts`
- Python reaction intelligence provider foundation：`services/chem-service/chem_service/reaction_intelligence/*`
- RDKit reaction fingerprint provider：`rdkit_fingerprint`
- RXNMapper atom mapping / reaction center provider：`rxnmapper` / `reaction_center`
- RXNFP embedding provider：`rxnfp`
- Hybrid similarity edge pipeline
- Optional TMAP layout CLI

本计划新增 DRFP，不替换现有实现。

### 1.1 为什么引入 DRFP

DRFP 是 Differential Reaction Fingerprint。它不是神经网络，不需要训练；它从 reaction SMILES 的反应物/产物差异生成固定长度 fingerprint。

对 Chemd 的价值：

- 比 RXNFP 更轻，适合作为默认 production baseline。
- 比纯 RDKit reaction fingerprint 更贴近“反应差异”语义。
- 可以在无 GPU、无模型下载、无远程服务时工作。
- 与 reaction center / semantic graph 互补，适合做 hybrid graph 的稳定底座。

### 1.2 DRFP 与现有 provider 的关系

```text
semantic graph       = 文档与知识上下文关系
RDKit fingerprint    = 本地确定性结构 fingerprint fallback
DRFP fingerprint     = 默认反应差异 fingerprint
RXNFP embedding      = 可选神经语义 embedding
RXNMapper center     = atom mapping / reaction center 解释层
TMAP                 = 可选二维布局，不决定聚类本身
```

生产默认顺序：

1. 有 DRFP 时优先用 `drfp_tanimoto`。
2. 没有 DRFP 但有 RDKit 时用 `rdkit_tanimoto`。
3. 有 RXNFP 时加入 `rxnfp_cosine`。
4. 有 RXNMapper reaction center 时加入 `atom_mapping_reaction_center`。
5. 永远保留 semantic/document graph 作为上下文边，但 semantic-only 边不得标记为 computed chemistry。

### 1.3 不做什么

- 不在 `apps/web` 或未来 desktop IDE 中直接安装/import DRFP。
- 不把 DRFP 作为硬依赖写入当前 Python 3.14 Poetry 主环境，除非完成兼容验证。
- 不训练神经网络。
- 不用 TMAP 作为 cluster assignment 算法。
- 不把 RXNFP 替换成 DRFP；两者并行，权重可配置。

---

## 2. 文件结构

### 2.1 新增文件

- `services/chem-service/chem_service/reaction_intelligence/providers/drfp_fingerprint.py`
  - DRFP lazy import、fake encoder injection、reaction fingerprint extraction。
- `services/chem-service/tests/test_reaction_intelligence_drfp.py`
  - provider success、missing dependency、invalid reaction、adapter normalization、similarity integration。
- `docs/chemd-drfp-hybrid-reaction-clustering-implementation-plan.zh-CN.md`
  - 本实施计划。

### 2.2 修改文件

- `packages/exporter-training/src/reaction-intelligence-types.ts`
  - 增加 `drfp` provider、`drfp_reaction_fingerprint` feature kind、`drfp_tanimoto` basis。
- `packages/exporter-training/tests/reaction-intelligence.test.ts`
  - 增加 DRFP artifact merge 测试。
- `services/chem-service/chem_service/reaction_intelligence/artifact_adapter.py`
  - normalize DRFP provider result，并输出 computed feature。
- `services/chem-service/chem_service/reaction_intelligence/similarity.py`
  - 增加 DRFP contribution，调整 fingerprint family weight 规则。
- `services/chem-service/chem_service/reaction_intelligence/pipeline.py`
  - 默认 `expected_providers` 增加 `drfp`，并允许 job options 覆盖权重。
- `services/chem-service/chem_service/reaction_intelligence/cli.py`
  - 增加 `--with-providers` 或 job option 读取，支持完整 reaction intelligence artifact，而不只是 TMAP layout artifact。
- `services/chem-service/README.md`
  - 记录 DRFP worker 安装、CLI 输入输出、SKIP 语义。
- `docs/chemd-reaction-intelligence-kernel-implementation-plan.zh-CN.md`
  - 更新进度，标记 DRFP 为下一阶段。

### 2.3 暂不修改

- `apps/web/*`
- `apps/desktop/*`
- 根 `package.json`
- 根 lockfile
- CI 配置

原因：DRFP 是 provider/worker 能力，前端与桌面端只消费 artifact schema。

---

## 3. 数据合约

### 3.1 Provider 枚举

TypeScript 中新增：

```ts
export type ReactionIntelligenceProvider =
  | "semantic"
  | "drfp"
  | "rdkit_fingerprint"
  | "rxnmapper"
  | "rxnfp"
  | "reaction_center"
  | "tmap_layout";
```

### 3.2 Computed feature kind

新增：

```ts
export type ReactionIntelligenceComputedFeatureKind =
  | "drfp_reaction_fingerprint"
  | "rdkit_reaction_fingerprint"
  | "rxnfp_embedding"
  | "atom_mapping"
  | "reaction_center";
```

### 3.3 Similarity basis

新增：

```ts
export type ReactionIntelligenceComputedSimilarityBasis =
  | "semantic_similarity"
  | "drfp_tanimoto"
  | "rdkit_tanimoto"
  | "rxnfp_cosine"
  | "atom_mapping_reaction_center"
  | "reaction_center_overlap"
  | "fingerprint_tanimoto"
  | "hybrid_computed";
```

### 3.4 DRFP provider result

Python provider 内部结果使用 snake_case：

```json
{
  "provider": "drfp",
  "status": "ok",
  "reaction_id": "rxn-1",
  "fingerprint": [0, 5, 17, 42],
  "fingerprint_ref": "drfp::rxn-1::d4e5f6a7b8c9d0e1",
  "fingerprint_hash": "sha256...",
  "dimension": 2048,
  "metadata": {
    "source": "drfp",
    "n_folded_length": 2048,
    "encoding": "on_bits"
  },
  "warnings": []
}
```

Artifact computed feature 输出：

```json
{
  "feature_id": "ri-feature::rxn-1::drfp",
  "reaction_entity_id": "rxn-1",
  "provider": "drfp",
  "feature_kind": "drfp_reaction_fingerprint",
  "status": "AVAILABLE",
  "source": "computed_artifact",
  "fingerprint_ref": "drfp::rxn-1::d4e5f6a7b8c9d0e1",
  "warnings": [],
  "metadata": {
    "on_bits": [0, 5, 17, 42],
    "dimension": 2048
  }
}
```

---

## 4. Hybrid Scoring 规则

### 4.1 默认权重

推荐默认权重：

```python
HybridSimilarityWeights(
    semantic=0.25,
    fingerprint=0.30,
    rxnfp=0.25,
    reaction_center=0.20,
)
```

解释：

- `fingerprint` 是一个 family weight，不是 DRFP 和 RDKit 各 0.30。
- DRFP 可用时，fingerprint family 使用 DRFP。
- DRFP 不可用而 RDKit 可用时，fingerprint family 使用 RDKit。
- 如果 DRFP 和 RDKit 都可用，RDKit contribution 可以进入 diagnostics，但不重复加权，避免同类 fingerprint 双算。

### 4.2 Contribution 选择

每条边的 contribution 结构：

```json
{
  "provider": "drfp",
  "basis": "drfp_tanimoto",
  "status": "ok",
  "score": 0.8125,
  "weight": 0.3,
  "weighted_score": 0.24375,
  "warnings": []
}
```

当 DRFP 缺失：

```json
{
  "provider": "drfp",
  "basis": "drfp_tanimoto",
  "status": "skipped",
  "score": null,
  "weight": 0.3,
  "weighted_score": 0.0,
  "warnings": ["drfp_provider_skipped"]
}
```

### 4.3 聚类算法

MVP 不引入重型聚类库，先实现 graph-based deterministic cluster assignment：

1. 过滤 `computed_similarity_edges` 中 `score >= threshold` 的边。
2. 用 connected components 形成初始 clusters。
3. 每个 cluster 输出：
   - `cluster_id`
   - `reaction_entity_ids`
   - `representative_reaction_entity_id`
   - `mean_score`
   - `basis_summary`
   - `warnings`

默认 threshold：

```json
{
  "cluster_threshold": 0.72,
  "min_cluster_size": 2
}
```

后续可选增强：

- HDBSCAN：适合 embedding 空间，但增加依赖。
- Leiden/Louvain：适合大图社区发现，但增加图算法依赖。
- Butina：适合 fingerprint similarity matrix，化学信息学常见，但先不强依赖。

---

## 5. 任务拆分

### Task 1: 更新 TypeScript Contract

**Files:**

- Modify: `packages/exporter-training/src/reaction-intelligence-types.ts`
- Modify: `packages/exporter-training/tests/reaction-intelligence.test.ts`

- [ ] **Step 1: 增加失败测试**

在 `reaction-intelligence.test.ts` 增加一个 artifact merge 测试，输入包含 `drfp` feature 和 `drfp_tanimoto` edge：

```ts
const artifact = {
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: "artifact-drfp",
  job_id: "job-drfp",
  provider_statuses: [
    {
      provider: "drfp",
      status: "OK",
      warnings: []
    }
  ],
  computed_features: [
    {
      feature_id: "ri-feature::rxn-1::drfp",
      reaction_entity_id: "rxn-1",
      provider: "drfp",
      feature_kind: "drfp_reaction_fingerprint",
      status: "AVAILABLE",
      source: "computed_artifact",
      fingerprint_ref: "drfp::rxn-1::abc",
      warnings: [],
      metadata: { on_bits: [1, 8, 13], dimension: 2048 }
    }
  ],
  computed_similarity_edges: [
    {
      edge_id: "reaction-similarity::drfp",
      from_reaction_entity_id: "rxn-1",
      to_reaction_entity_id: "rxn-2",
      basis: ["hybrid_computed", "drfp_tanimoto"],
      score: 0.82,
      source: "computed_artifact",
      contributions: [
        {
          basis: "drfp_tanimoto",
          provider: "drfp",
          score: 0.82,
          weight: 0.3,
          warnings: []
        }
      ],
      warnings: []
    }
  ],
  warnings: []
} as const;
```

断言：

```ts
expect(merged.reaction_intelligence.provider_statuses[0]?.provider).toBe("drfp");
expect(merged.reaction_intelligence.computed_features[0]?.feature_kind)
  .toBe("drfp_reaction_fingerprint");
expect(merged.reaction_intelligence.computed_similarity_edges[0]?.basis)
  .toContain("drfp_tanimoto");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
pnpm --filter @chemd/exporter-training test -- reaction-intelligence
```

Expected: TypeScript 类型或断言失败，因为 `drfp` contract 尚未定义。

- [ ] **Step 3: 修改 contract**

在 `reaction-intelligence-types.ts` 中增加：

```ts
| "drfp"
```

到 `ReactionIntelligenceProvider`。

增加：

```ts
| "drfp_reaction_fingerprint"
```

到 `ReactionIntelligenceComputedFeatureKind`。

增加：

```ts
| "drfp_tanimoto"
```

到 `ReactionIntelligenceComputedSimilarityBasis`。

- [ ] **Step 4: 运行定向验证**

Run:

```bash
pnpm --filter @chemd/exporter-training test -- reaction-intelligence
pnpm --filter @chemd/exporter-training typecheck
```

Expected: tests pass，typecheck pass。

- [ ] **Step 5: 提交**

```bash
git add packages/exporter-training/src/reaction-intelligence-types.ts packages/exporter-training/tests/reaction-intelligence.test.ts
git commit -m "feat(reaction)：扩展 DRFP 反应智能合约"
```

Commit body:

```text
- 添加 drfp provider contract
- 添加 drfp fingerprint feature kind
- 添加 drfp_tanimoto similarity basis
```

### Task 2: 新增 DRFP Provider

**Files:**

- Create: `services/chem-service/chem_service/reaction_intelligence/providers/drfp_fingerprint.py`
- Create: `services/chem-service/tests/test_reaction_intelligence_drfp.py`

- [ ] **Step 1: 写 provider 成功路径测试**

测试 fake encoder，避免 CI 依赖真实 DRFP：

```python
class FakeDrfpEncoder:
    @staticmethod
    def encode(reactions, n_folded_length=2048):
        assert reactions == ["CCO.O=C(O)C>>CCOC(=O)C"]
        assert n_folded_length == 2048
        return [[0, 1, 0, 1, 1]]


def test_drfp_provider_uses_injected_encoder() -> None:
    provider = DrfpFingerprintProvider(encoder_loader=lambda: FakeDrfpEncoder)
    results = provider.fingerprint_reactions([
        {"reaction_id": "rxn-1", "reaction_smiles": "CCO.O=C(O)C>>CCOC(=O)C"}
    ])

    assert results[0]["provider"] == "drfp"
    assert results[0]["status"] == "ok"
    assert results[0]["reaction_id"] == "rxn-1"
    assert results[0]["fingerprint"] == [1, 3, 4]
    assert results[0]["dimension"] == 5
    assert results[0]["fingerprint_ref"].startswith("drfp::rxn-1::")
```

- [ ] **Step 2: 写缺失依赖测试**

```python
def test_drfp_provider_skips_when_dependency_missing() -> None:
    provider = DrfpFingerprintProvider(
        encoder_loader=lambda: (_ for _ in ()).throw(
            DrfpProviderUnavailable("DRFP is not available: missing")
        )
    )
    results = provider.fingerprint_reactions([
        {"reaction_id": "rxn-1", "reaction_smiles": "A>>B"}
    ])

    assert results[0]["status"] == "skipped"
    assert results[0]["dimension"] == 0
    assert "DRFP is not available" in results[0]["warnings"][0]
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py
```

Expected: import error because provider file does not exist.

- [ ] **Step 4: 实现 provider**

核心实现结构：

```python
from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any, TypedDict


class ReactionInput(TypedDict, total=False):
    reaction_id: str
    id: str
    rxn_smiles: str
    reaction_smiles: str
    equation: str


class DrfpProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class DrfpProviderConfig:
    provider: str = "drfp"
    n_folded_length: int = 2048
    vector_ref_prefix: str = "drfp"


def load_drfp_encoder() -> Any:
    try:
        from drfp import DrfpEncoder  # type: ignore[import-not-found]
    except Exception as error:
        raise DrfpProviderUnavailable(f"DRFP is not available: {error}") from error
    return DrfpEncoder
```

关键函数：

```python
def _read_reaction_id(reaction: ReactionInput) -> str:
    reaction_id = reaction.get("reaction_id") or reaction.get("id")
    if not isinstance(reaction_id, str) or not reaction_id.strip():
        raise ValueError("reaction_id is required for DRFP fingerprint")
    return reaction_id.strip()


def _read_reaction_smiles(reaction: ReactionInput) -> str | None:
    for key in ("rxn_smiles", "reaction_smiles", "equation"):
        value = reaction.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _stable_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _coerce_on_bits(value: Any) -> tuple[list[int], int]:
    if hasattr(value, "tolist"):
        value = value.tolist()
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ValueError("DRFP encoder did not return a sequence")
    bits = [int(item) for item in value]
    on_bits = [index for index, bit in enumerate(bits) if bit != 0]
    return on_bits, len(bits)
```

Provider class：

```python
class DrfpFingerprintProvider:
    def __init__(
        self,
        *,
        encoder_loader: Callable[[], Any] = load_drfp_encoder,
        config: DrfpProviderConfig | None = None,
    ) -> None:
        self._encoder_loader = encoder_loader
        self._config = config or DrfpProviderConfig()

    def fingerprint_reactions(self, reactions: Iterable[ReactionInput]) -> list[dict[str, Any]]:
        materialized = list(reactions)
        try:
            encoder = self._encoder_loader()
        except DrfpProviderUnavailable as error:
            return [
                _skipped_result(reaction, str(error), provider=self._config.provider)
                for reaction in materialized
            ]

        results: list[dict[str, Any]] = []
        for reaction in materialized:
            reaction_id = _read_reaction_id(reaction)
            reaction_smiles = _read_reaction_smiles(reaction)
            if reaction_smiles is None:
                results.append(_skipped_result(
                    reaction,
                    "DRFP skipped because reaction SMILES is missing.",
                    provider=self._config.provider,
                ))
                continue

            try:
                encoded = encoder.encode(
                    [reaction_smiles],
                    n_folded_length=self._config.n_folded_length,
                )
                vector = encoded[0]
                on_bits, dimension = _coerce_on_bits(vector)
            except (AttributeError, IndexError, TypeError, ValueError) as error:
                results.append(_failed_result(reaction_id, str(error), self._config))
                continue

            fingerprint_hash = _stable_hash(on_bits)
            results.append({
                "provider": self._config.provider,
                "status": "ok",
                "reaction_id": reaction_id,
                "fingerprint": on_bits,
                "fingerprint_ref": (
                    f"{self._config.vector_ref_prefix}::{reaction_id}::"
                    f"{fingerprint_hash[:16]}"
                ),
                "fingerprint_hash": fingerprint_hash,
                "dimension": dimension,
                "metadata": {
                    "source": "drfp",
                    "n_folded_length": self._config.n_folded_length,
                    "encoding": "on_bits",
                },
                "warnings": [],
            })
        return results
```

- [ ] **Step 5: 运行 provider 测试**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py
```

Expected: all tests pass。

- [ ] **Step 6: 运行 Ruff**

Run:

```bash
cd services/chem-service
poetry run ruff check app.py chem_service
```

Expected: pass。

- [ ] **Step 7: 提交**

```bash
git add services/chem-service/chem_service/reaction_intelligence/providers/drfp_fingerprint.py services/chem-service/tests/test_reaction_intelligence_drfp.py
git commit -m "feat(reaction)：添加 DRFP fingerprint provider"
```

Commit body:

```text
- 新增 DRFP lazy import provider
- 支持 fake encoder 注入测试
- 缺失依赖时返回 skipped result
```

### Task 3: 接入 Artifact Adapter

**Files:**

- Modify: `services/chem-service/chem_service/reaction_intelligence/artifact_adapter.py`
- Modify: `services/chem-service/tests/test_reaction_intelligence_drfp.py`

- [ ] **Step 1: 写 adapter 测试**

```python
def test_drfp_result_becomes_computed_feature() -> None:
    features = computed_features_from_results(normalize_provider_results({
        "drfp": [
            {
                "provider": "drfp",
                "status": "ok",
                "reaction_id": "rxn-1",
                "fingerprint": [1, 3, 4],
                "fingerprint_ref": "drfp::rxn-1::abc",
                "dimension": 2048,
                "warnings": [],
            }
        ]
    }))

    assert features == [
        {
            "feature_id": "ri-feature::rxn-1::drfp",
            "reaction_entity_id": "rxn-1",
            "provider": "drfp",
            "feature_kind": "drfp_reaction_fingerprint",
            "status": "AVAILABLE",
            "source": "computed_artifact",
            "fingerprint_ref": "drfp::rxn-1::abc",
            "warnings": [],
            "metadata": {"on_bits": [1, 3, 4], "dimension": 2048},
        }
    ]
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py
```

Expected: feature list is empty because adapter does not know `drfp` yet。

- [ ] **Step 3: 修改 adapter**

在 `_feature_from_result()` 增加：

```python
if provider == "drfp":
    return _drfp_feature(reaction_id, result)
```

新增：

```python
def _drfp_feature(reaction_id: str, result: ProviderResult) -> dict[str, Any]:
    return {
        **_base_feature(reaction_id, "drfp", "drfp_reaction_fingerprint"),
        "fingerprint_ref": result.get("fingerprint_ref"),
        "warnings": result.get("warnings", []),
        "metadata": {
            "on_bits": result.get("fingerprint", []),
            "dimension": result.get("dimension"),
        },
    }
```

- [ ] **Step 4: 运行测试**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py tests/test_reaction_intelligence_similarity.py
```

Expected: pass。

- [ ] **Step 5: 提交**

```bash
git add services/chem-service/chem_service/reaction_intelligence/artifact_adapter.py services/chem-service/tests/test_reaction_intelligence_drfp.py
git commit -m "feat(reaction)：合并 DRFP artifact feature"
```

Commit body:

```text
- 标准化 drfp provider result
- 输出 drfp_reaction_fingerprint feature
- 保持 skipped provider 不生成可用 feature
```

### Task 4: 接入 Hybrid Similarity

**Files:**

- Modify: `services/chem-service/chem_service/reaction_intelligence/similarity.py`
- Modify: `services/chem-service/chem_service/reaction_intelligence/pipeline.py`
- Modify: `services/chem-service/tests/test_reaction_intelligence_similarity.py`
- Modify: `services/chem-service/tests/test_reaction_intelligence_drfp.py`

- [ ] **Step 1: 写 DRFP contribution 测试**

```python
def test_hybrid_similarity_prefers_drfp_fingerprint_family() -> None:
    edge = build_hybrid_similarity_edge(
        left_reaction_id="rxn-1",
        right_reaction_id="rxn-2",
        left_results={
            "drfp": {"status": "ok", "fingerprint": [1, 3, 5]},
            "rdkit_fingerprint": {"status": "ok", "fingerprint": [1]},
        },
        right_results={
            "drfp": {"status": "ok", "fingerprint": [1, 5, 8]},
            "rdkit_fingerprint": {"status": "ok", "fingerprint": [1]},
        },
        expected_providers=("drfp", "rdkit_fingerprint"),
    )

    ok = [item for item in edge["contributions"] if item["status"] == "ok"]
    assert ok[0]["provider"] == "drfp"
    assert ok[0]["basis"] == "drfp_tanimoto"
    assert "drfp_tanimoto" in edge["basis"]
    assert "rdkit_tanimoto" not in edge["basis"]
```

- [ ] **Step 2: 写 DRFP fallback 测试**

```python
def test_hybrid_similarity_falls_back_to_rdkit_when_drfp_missing() -> None:
    edge = build_hybrid_similarity_edge(
        left_reaction_id="rxn-1",
        right_reaction_id="rxn-2",
        left_results={"rdkit_fingerprint": {"status": "ok", "fingerprint": [1, 2]}},
        right_results={"rdkit_fingerprint": {"status": "ok", "fingerprint": [2, 3]}},
        expected_providers=("drfp", "rdkit_fingerprint"),
    )

    assert "rdkit_tanimoto" in edge["basis"]
    assert "drfp_provider_skipped" in edge["warnings"]
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py tests/test_reaction_intelligence_similarity.py
```

Expected: DRFP is unsupported or RDKit is double-counted。

- [ ] **Step 4: 修改 weights**

将 `HybridSimilarityWeights` 保持字段稳定，但明确 `fingerprint` family：

```python
@dataclass(frozen=True, slots=True)
class HybridSimilarityWeights:
    semantic: float = 0.25
    fingerprint: float = 0.30
    rxnfp: float = 0.25
    reaction_center: float = 0.20

    def weight_for(self, provider: str) -> float:
        if provider in {"drfp", "rdkit_fingerprint"}:
            return self.fingerprint
        return float(getattr(self, provider, 0.0))
```

- [ ] **Step 5: 修改 provider contribution**

在 `_provider_contribution()` 中支持：

```python
if provider == "drfp":
    score = tanimoto_like_score(left.get("fingerprint"), right.get("fingerprint"))
    return _ok_contribution("drfp", "drfp_tanimoto", score, weight)
```

保留 RDKit：

```python
if provider in {"fingerprint", "rdkit_fingerprint"}:
    score = tanimoto_like_score(left.get("fingerprint"), right.get("fingerprint"))
    return _ok_contribution("rdkit_fingerprint", "rdkit_tanimoto", score, weight)
```

- [ ] **Step 6: 增加 fingerprint family selection**

在 `build_hybrid_similarity_edge()` 内，将 provider 列表按 family 处理：

```python
selected_providers = _select_similarity_providers(provider_names, left, right)
```

规则：

```python
def _select_similarity_providers(
    providers: Iterable[str],
    left: Mapping[str, ProviderResult],
    right: Mapping[str, ProviderResult],
) -> list[str]:
    requested = list(providers)
    if "drfp" in requested and _has_ok_result(left, right, "drfp"):
        return [provider for provider in requested if provider != "rdkit_fingerprint"]
    return requested
```

辅助函数：

```python
def _has_ok_result(
    left: Mapping[str, ProviderResult],
    right: Mapping[str, ProviderResult],
    provider: str,
) -> bool:
    left_result = _provider_result(left, provider)
    right_result = _provider_result(right, provider)
    return (
        left_result is not None
        and right_result is not None
        and left_result.get("status") == "ok"
        and right_result.get("status") == "ok"
    )
```

- [ ] **Step 7: 修改 pipeline 默认 providers**

`pipeline.py` 默认：

```python
expected_providers: Iterable[str] = (
    "drfp",
    "rdkit_fingerprint",
    "rxnfp",
    "reaction_center",
)
```

- [ ] **Step 8: 运行验证**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py tests/test_reaction_intelligence_similarity.py
poetry run ruff check app.py chem_service
```

Expected: pass。

- [ ] **Step 9: 提交**

```bash
git add services/chem-service/chem_service/reaction_intelligence/similarity.py services/chem-service/chem_service/reaction_intelligence/pipeline.py services/chem-service/tests/test_reaction_intelligence_similarity.py services/chem-service/tests/test_reaction_intelligence_drfp.py
git commit -m "feat(reaction)：接入 DRFP hybrid similarity"
```

Commit body:

```text
- 添加 drfp_tanimoto contribution
- 优先使用 DRFP fingerprint family
- 缺失 DRFP 时回退 RDKit fingerprint
```

### Task 5: 增加 Cluster Assignment

**Files:**

- Create: `services/chem-service/chem_service/reaction_intelligence/clustering.py`
- Create: `services/chem-service/tests/test_reaction_intelligence_clustering.py`
- Modify: `packages/exporter-training/src/reaction-intelligence-types.ts`

- [ ] **Step 1: 定义 cluster artifact contract**

TypeScript 新增：

```ts
export interface ReactionIntelligenceCluster {
  cluster_id: string;
  reaction_entity_ids: string[];
  representative_reaction_entity_id: string;
  mean_score: number;
  basis_summary: ReactionIntelligenceComputedSimilarityBasis[];
  warnings: string[];
  metadata?: ReactionIntelligenceJsonObject;
}
```

在 `ReactionIntelligenceArtifact` 和 `MergedReactionIntelligenceLayer` 增加：

```ts
clusters?: ReactionIntelligenceCluster[];
```

- [ ] **Step 2: 写 clustering 测试**

```python
def test_assign_clusters_from_similarity_edges() -> None:
    clusters = assign_similarity_clusters(
        reaction_ids=["rxn-a", "rxn-b", "rxn-c", "rxn-d"],
        edges=[
            {
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": 0.9,
                "basis": ["hybrid_computed", "drfp_tanimoto"],
                "warnings": [],
            },
            {
                "from_reaction_entity_id": "rxn-c",
                "to_reaction_entity_id": "rxn-d",
                "score": 0.65,
                "basis": ["hybrid_computed", "drfp_tanimoto"],
                "warnings": [],
            },
        ],
        threshold=0.72,
        min_cluster_size=2,
    )

    assert len(clusters) == 1
    assert clusters[0]["reaction_entity_ids"] == ["rxn-a", "rxn-b"]
    assert clusters[0]["representative_reaction_entity_id"] == "rxn-a"
    assert clusters[0]["mean_score"] == 0.9
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_clustering.py
```

Expected: clustering module missing。

- [ ] **Step 4: 实现 deterministic connected components**

核心接口：

```python
def assign_similarity_clusters(
    *,
    reaction_ids: list[str],
    edges: list[dict[str, Any]],
    threshold: float = 0.72,
    min_cluster_size: int = 2,
) -> list[dict[str, Any]]:
```

实现要求：

- reaction ids 排序稳定。
- 只使用 `score >= threshold` 的边。
- connected component 小于 `min_cluster_size` 时丢弃。
- representative 选 component 内 degree 最高，再按 reaction id 排序。
- `cluster_id` 使用 sorted reaction ids 的 sha256 前 16 位。

代表节点选择代码：

```python
def _representative(component: list[str], edges: list[dict[str, Any]]) -> str:
    scores = {reaction_id: 0 for reaction_id in component}
    for edge in edges:
        left = edge["from_reaction_entity_id"]
        right = edge["to_reaction_entity_id"]
        score = float(edge["score"])
        if left in scores:
            scores[left] += score
        if right in scores:
            scores[right] += score
    return sorted(component, key=lambda item: (-scores[item], item))[0]
```

- [ ] **Step 5: 接入 pipeline artifact**

`build_reaction_intelligence_artifact()` 在生成 `computed_similarity_edges` 后调用：

```python
clusters = assign_similarity_clusters(
    reaction_ids=[_read_reaction_id(reaction) for reaction in materialized],
    edges=computed_edges,
    threshold=_read_cluster_threshold(options),
    min_cluster_size=_read_min_cluster_size(options),
)
```

Artifact 增加：

```python
"clusters": clusters,
```

- [ ] **Step 6: 运行验证**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_clustering.py tests/test_reaction_intelligence_similarity.py
poetry run ruff check app.py chem_service
pnpm --filter @chemd/exporter-training test -- reaction-intelligence
pnpm --filter @chemd/exporter-training typecheck
```

Expected: pass。

- [ ] **Step 7: 提交**

```bash
git add packages/exporter-training/src/reaction-intelligence-types.ts services/chem-service/chem_service/reaction_intelligence/clustering.py services/chem-service/chem_service/reaction_intelligence/pipeline.py services/chem-service/tests/test_reaction_intelligence_clustering.py
git commit -m "feat(reaction)：添加 hybrid reaction clustering"
```

Commit body:

```text
- 基于 similarity graph 输出 cluster artifact
- 使用确定性 connected components
- 支持 threshold 和 min cluster size
```

### Task 6: CLI 支持完整 Provider Pipeline

**Files:**

- Modify: `services/chem-service/chem_service/reaction_intelligence/cli.py`
- Modify: `services/chem-service/tests/test_reaction_intelligence_layout_cli.py`
- Create: `services/chem-service/tests/test_reaction_intelligence_cli_pipeline.py`

- [ ] **Step 1: 写 CLI pipeline 测试**

输入 job：

```json
{
  "job_id": "job-drfp",
  "reactions": [
    {
      "reaction_id": "rxn-1",
      "reaction_smiles": "CCO.O=C(O)C>>CCOC(=O)C"
    },
    {
      "reaction_id": "rxn-2",
      "reaction_smiles": "CCN.O=C(O)C>>CCNC(=O)C"
    }
  ],
  "options": {
    "providers": ["drfp"],
    "cluster_threshold": 0.5,
    "layout": false
  }
}
```

测试用 patch 注入 fake DRFP result：

```python
with patch.object(
    cli,
    "compute_provider_results",
    return_value={
        "drfp": [
            {"provider": "drfp", "status": "ok", "reaction_id": "rxn-1", "fingerprint": [1, 2]},
            {"provider": "drfp", "status": "ok", "reaction_id": "rxn-2", "fingerprint": [2, 3]},
        ]
    },
):
    exit_code = cli.main([str(job_path), "--output", str(artifact_path)])
```

断言：

```python
assert exit_code == 0
assert artifact["provider_statuses"][0]["provider"] == "drfp"
assert artifact["computed_similarity_edges"]
assert artifact["clusters"]
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_cli_pipeline.py
```

Expected: CLI 目前只构建 TMAP layout artifact。

- [ ] **Step 3: 抽出 provider orchestration**

在 `cli.py` 增加：

```python
def compute_provider_results(job: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    reactions = _job_reactions(job)
    providers = _requested_providers(job)
    results: dict[str, list[dict[str, Any]]] = {}
    if "drfp" in providers:
        results["drfp"] = DrfpFingerprintProvider().fingerprint_reactions(reactions)
    if "rxnfp" in providers:
        results["rxnfp"] = RxnfpProvider().embed_reactions(reactions)
    return results
```

MVP 中不要在 CLI 阶段强制启用所有重 provider；按 job options 启用。

- [ ] **Step 4: 修改 build_artifact**

如果 job 包含 `reactions`，走完整 pipeline：

```python
if _has_reaction_inputs(job):
    provider_results = compute_provider_results(job)
    artifact = build_reaction_intelligence_artifact(
        reactions=_job_reactions(job),
        job_id=_job_id(job) or "reaction-intelligence-job",
        provider_results=provider_results,
        semantic_edges=_job_semantic_edges(job),
        expected_providers=_requested_providers(job),
    )
    return _maybe_add_layout(artifact, job)
```

如果只有 `reactionIds` / `similarityEdges`，保留当前 TMAP layout-only 兼容路径。

- [ ] **Step 5: 运行 CLI 测试**

Run:

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_cli_pipeline.py tests/test_reaction_intelligence_layout_cli.py
```

Expected: pass。

- [ ] **Step 6: 提交**

```bash
git add services/chem-service/chem_service/reaction_intelligence/cli.py services/chem-service/tests/test_reaction_intelligence_cli_pipeline.py services/chem-service/tests/test_reaction_intelligence_layout_cli.py
git commit -m "feat(reaction)：扩展反应智能 CLI pipeline"
```

Commit body:

```text
- CLI 支持 provider feature extraction
- 保留 TMAP layout-only 兼容路径
- 输出完整 reaction intelligence artifact
```

### Task 7: 文档与部署说明

**Files:**

- Modify: `services/chem-service/README.md`
- Modify: `docs/chemd-reaction-intelligence-kernel-implementation-plan.zh-CN.md`
- Modify: `docs/chemd-drfp-hybrid-reaction-clustering-implementation-plan.zh-CN.md`

- [ ] **Step 1: README 增加 DRFP worker 安装说明**

添加：

````markdown
Reaction intelligence DRFP provider:

- DRFP is optional and lazily imported.
- Do not expose DRFP/RXNFP/RXNMapper through the Flask app startup path.
- Preferred production deployment is a local worker env that runs the CLI and writes artifact JSON.

Example:

```bash
conda create -n chemd-ri python=3.10 -y
conda activate chemd-ri
pip install drfp
cd services/chem-service
python -m chem_service.reaction_intelligence.cli job.json --output artifact.json
```

If DRFP is unavailable, artifacts remain parseable and report:

```json
{
  "provider": "drfp",
  "status": "SKIP",
  "reason_code": "provider_skipped"
}
```
````

- [ ] **Step 2: 更新内核实施计划进度**

在 `docs/chemd-reaction-intelligence-kernel-implementation-plan.zh-CN.md` 增加：

```markdown
- 2026-05-13：新增 DRFP hybrid clustering 下一阶段计划；DRFP 作为默认 deterministic reaction fingerprint provider，RXNFP 保持 optional semantic embedding provider。
```

- [ ] **Step 3: 运行文档相关快速检查**

Run:

```powershell
$patterns = @("TB" + "D", "TO" + "DO", "fill" + " in", "implement" + " later", "待" + "补")
foreach ($pattern in $patterns) {
  rg -n $pattern docs/chemd-drfp-hybrid-reaction-clustering-implementation-plan.zh-CN.md services/chem-service/README.md
}
```

Expected: no output。

- [ ] **Step 4: 提交**

```bash
git add services/chem-service/README.md docs/chemd-reaction-intelligence-kernel-implementation-plan.zh-CN.md docs/chemd-drfp-hybrid-reaction-clustering-implementation-plan.zh-CN.md
git commit -m "docs(reaction)：记录 DRFP 聚类实施计划"
```

Commit body:

```text
- 说明 DRFP worker 配置方式
- 记录 hybrid clustering 默认策略
- 对齐 reaction intelligence 内核路线
```

---

## 6. 并行实施建议

适合并行的任务：

- 子任务 A：Task 1 TypeScript contract。
- 子任务 B：Task 2 DRFP provider。
- 子任务 C：Task 5 clustering module。

必须串行或由架构会话整合：

- Task 3 adapter，因为依赖 Task 1/2 的字段。
- Task 4 similarity，因为会影响已有 RXNFP/RDKit tests。
- Task 6 CLI，因为会同时接 provider、pipeline、layout。
- Task 7 docs，因为要记录最终事实。

推荐分支/worktree：

```text
reaction-intelligence-core
  -> ri-drfp-contract
  -> ri-drfp-provider
  -> ri-drfp-clustering
```

合并顺序：

1. `ri-drfp-contract`
2. `ri-drfp-provider`
3. `ri-drfp-clustering`
4. 架构会话完成 adapter/similarity/CLI/docs integration

---

## 7. 验证矩阵

### 7.1 Python 定向验证

```bash
cd services/chem-service
poetry run pytest tests/test_reaction_intelligence_drfp.py
poetry run pytest tests/test_reaction_intelligence_similarity.py
poetry run pytest tests/test_reaction_intelligence_clustering.py
poetry run pytest tests/test_reaction_intelligence_cli_pipeline.py
poetry run pytest tests/test_reaction_intelligence_layout_cli.py
poetry run ruff check app.py chem_service
```

### 7.2 Python 全量验证

```bash
cd services/chem-service
poetry run pytest
poetry run python -m unittest discover tests
```

### 7.3 TypeScript 定向验证

```bash
pnpm --filter @chemd/exporter-training test -- reaction-intelligence
pnpm --filter @chemd/exporter-training typecheck
```

### 7.4 根级验证

```bash
pnpm test
pnpm typecheck
```

### 7.5 Runtime smoke

使用 fake provider artifact：

```bash
cd services/chem-service
poetry run python -m chem_service.reaction_intelligence.cli examples/reaction-intelligence/drfp-job.json --output .tmp/drfp-artifact.json
```

Expected artifact invariants：

```text
schema_version == chemd-reaction-intelligence-artifact/v0.1
provider_statuses contains drfp
computed_features contains drfp_reaction_fingerprint when DRFP is available
computed_similarity_edges contains drfp_tanimoto when two DRFP fingerprints exist
clusters exists when at least two reactions pass threshold
layout is absent unless layout is requested
```

真实 DRFP runtime smoke：

```bash
conda activate chemd-ri
python -c "from drfp import DrfpEncoder; print(DrfpEncoder.encode(['CCO>>CC=O'])[0][:8])"
python -m chem_service.reaction_intelligence.cli examples/reaction-intelligence/drfp-job.json --output .tmp/drfp-artifact.json
```

如果本机未安装 DRFP，不把 runtime smoke 标记为失败；应记录为 environment `SKIP`，并确认 artifact JSON 可解析。

---

## 8. 生产可用门禁

必须满足：

- DRFP 缺失时 artifact 可解析，provider status 是 `SKIP`。
- DRFP 成功时 computed feature 不写入伪造向量，只写真实 fingerprint on bits/ref/hash。
- DRFP 与 RDKit 同时存在时不会双算 fingerprint family 权重。
- RXNFP 仍保持 optional provider，不受 DRFP 接入影响。
- TMAP 仍只作为 layout provider，不进入 cluster assignment。
- 所有新增 Python 文件小于 300 行；函数小于 50 行。
- `services/chem-service` Ruff pass。
- `@chemd/exporter-training` test/typecheck pass。
- 根级 `pnpm test` 和 `pnpm typecheck` pass，或明确记录环境阻塞。

---

## 9. 风险与处理

### 9.1 DRFP 与 Python 3.14 兼容性

风险：当前 `chem-service` Poetry 使用 Python `>=3.14,<3.15`，DRFP 可能尚未支持该版本。

处理：

- 不把 DRFP 作为 Poetry 主依赖。
- provider lazy import。
- 生产部署优先独立 conda worker。
- CI 使用 fake encoder 覆盖逻辑。

### 9.2 Fingerprint 双算

风险：DRFP 与 RDKit 都是 fingerprint，相似度可能重复放大结构相似性。

处理：

- `fingerprint` 作为 family weight。
- DRFP 可用时优先 DRFP。
- RDKit 保留为 fallback 或 diagnostics。

### 9.3 聚类解释性不足

风险：单纯 score/cluster id 对用户不可解释。

处理：

- cluster 输出 `basis_summary`。
- edge 输出 contribution。
- reaction center 输出 signature。
- UI 后续展示“为什么归为一类”时读取 contribution，而不是重新计算。

### 9.4 大规模性能

风险：全量两两组合是 O(n²)。

处理：

- MVP 先限定 worker batch size。
- 后续加入 ANN / MinHash LSH / nearest-neighbor top-k。
- TMAP 只消费 top-k similarity edges。

---

## 10. 完成定义

本计划完成时，Chemd 应具备：

1. DRFP provider contract。
2. DRFP optional Python provider。
3. DRFP artifact feature merge。
4. DRFP hybrid similarity contribution。
5. Deterministic reaction clusters。
6. CLI 可输出完整 reaction intelligence artifact。
7. 文档记录 worker 配置、降级行为和验证命令。

完成后推荐下一步：

- 做真实 DRFP worker 环境 smoke。
- 用 50 到 200 条代表性反应样本评估 threshold。
- 再决定是否加入 HDBSCAN/Leiden/Butina 作为高级聚类 provider。
