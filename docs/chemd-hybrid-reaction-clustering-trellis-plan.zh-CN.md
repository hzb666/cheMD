# Chemd Hybrid Reaction Clustering Trellis Plan

## 目标

把 Chemd 反应聚类从“语义 key 分组为主”升级为严格、可解释、可回归测试的 hybrid reaction clustering：

```text
Chemd graph
  -> canonical reaction input
  -> computed chemistry evidence
  -> hybrid similarity edges
  -> strict / candidate / semantic 三类结果
  -> LLM-readable cluster profile
  -> CLI / docs / desktop 可消费输出
```

## 硬原则

- 不改 Chemd 语言层、parser、resolver 或 compiler 语法。
- 不从 prose 或普通语义字段推断 canonical reaction SMILES。
- 严格反应聚类必须由 computed chemistry evidence 主导。
- 语义上下文可以低权重参与排序和解释，但不能推翻化学证据。
- provider 不可用必须显式 warning / SKIP，不能伪装成 computed success。
- 不训练新模型；训练分类模型是后续增强，不是当前 blocker。
- 每个阶段独立 Trellis 闭环：写代码、审查、finishwork、提交 git、record，然后进入下一阶段。
- Trellis 开始任务本身不单独提交；阶段实现完成后再提交。

## 已完成阶段

### Phase 1: Canonical Reaction Input

Trellis task: `05-24-hybrid-reaction-canonical-input`

Commits:

- `d3315ee feat(exporter-training)：add canonical reaction input`
- `c04dd39 chore(trellis)：complete canonical input task`
- `d5bf97b chore: record journal`

产物：

- `buildReactionIntelligenceCanonicalInput()`
- `ReactionIntelligenceCanonicalInput`
- `ReactionIntelligenceCanonicalReactionInput`
- `canonical_rxn_smiles_not_available`
- `canonical_rxn_smiles_missing_for_reactions:N`

约束：

- 只接受调用方通过 `canonical_rxn_smiles_by_feature_ref` 明确提供的 canonical reaction SMILES。
- 缺失时保留 reaction input，但不视为 compute-ready。
- Chemd semantic context 只作为上下文保存。

验证记录：

```bash
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
git diff --check
```

### Phase 2: Evidence Contract / Service Job

Trellis task: `05-24-hybrid-reaction-evidence-contract`

Commits:

- `bc2d880 feat(exporter-training)：add reaction intelligence service job`
- `e7ed988 chore(trellis)：complete evidence contract task`
- `7b3b88d chore: record journal`

产物：

- `buildReactionIntelligenceServiceJob()`
- `ReactionIntelligenceServiceJob`
- `ReactionIntelligenceServiceProviderPolicy`
- `service_job_reaction_skipped_missing_canonical_rxn_smiles:<reaction_id>`

约束：

- 只有带 `canonical_rxn_smiles` 的 reaction 进入 `chem-cluster-service` job。
- 默认 provider policy:

```json
{
  "missing_dependency": "skip",
  "per_reaction_failure": "warn",
  "allow_network": false
}
```

验证记录：

```bash
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
python -m unittest services.chem-cluster-service.tests.test_intelligence_contracts
python -m unittest discover services/chem-cluster-service/tests
git diff --check
```

## 待完成阶段

### Phase 3: Hybrid Similarity Scoring

Trellis task slug: `hybrid-reaction-similarity-scoring`

目标：

让 `chem-cluster-service` 的 hybrid similarity 从简单 provider 合并升级为带 contributions、权重和 hard gates 的相似度评分。

数学逻辑：

```text
R_ij = RDKit / reaction fingerprint Tanimoto
X_ij = RXNFP cosine
C_ij = reaction center score
S_ij = Chemd semantic context score

H_ij =
  normalized_weighted_average(
    0.30 * R_ij,
    0.25 * X_ij,
    0.25 * C_ij,
    0.20 * S_ij
  )
```

语义分数：

```text
S_ij =
  0.25 * reaction_family_similarity
+ 0.20 * procedure_similarity
+ 0.20 * condition_similarity
+ 0.15 * material_role_similarity
+ 0.10 * route_similarity
+ 0.05 * result_similarity
+ 0.05 * observation_similarity
```

Hard gates：

```text
if reaction_center_conflict and rdkit_tanimoto < 0.45:
  reject strict clustering

if no computed chemistry evidence:
  semantic group only

if only procedure / condition matches:
  never strict reaction cluster
```

主要文件：

- Modify: `services/chem-cluster-service/chem_cluster_service/intelligence/similarity.py`
- Modify: `services/chem-cluster-service/tests/test_hybrid_similarity.py`
- Modify: `services/chem-cluster-service/chem_cluster_service/intelligence/contracts.py` if contribution fields need contract support
- Modify: `packages/exporter-training/src/reaction-intelligence-types.ts` if TS merged artifact needs contribution alignment
- Modify: `apps/docs/content/docs/{en,zh}/exports/graph-reaction-map.mdx`

验收：

- hybrid edge 输出总分、basis、provider ids、warnings。
- contribution-level evidence 可见。
- missing computed support 不会静默当作 0；可用权重归一化。
- semantic-only support 仍标记为 semantic warning。

验证：

```bash
python -m unittest services/chem-cluster-service/tests/test_hybrid_similarity.py
python -m unittest discover services/chem-cluster-service/tests
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
git diff --check
```

提交建议：

```text
feat(cluster-service)：add gated hybrid similarity scoring

- Weight computed chemistry above semantic context
- Preserve contribution-level evidence
- Keep semantic-only support out of strict clustering
```

### Phase 4: Strict Cluster Builder

Trellis task slug: `hybrid-reaction-strict-clusters`

目标：

把 similarity edges 分成三类结果，避免语义分组冒充严格反应聚类。

输出结构：

```json
{
  "strict_reaction_clusters": [],
  "candidate_reaction_neighbors": [],
  "semantic_reaction_groups": []
}
```

分类规则：

- `strict_reaction_clusters`: 有 computed chemistry evidence，且通过 hard gates。
- `candidate_reaction_neighbors`: 有 computed evidence，但不足以进入 strict cluster。
- `semantic_reaction_groups`: 只有 Chemd semantic context，相似但不是严格反应聚类。

主要文件：

- Create: `services/chem-cluster-service/chem_cluster_service/intelligence/clustering.py`
- Create: `services/chem-cluster-service/tests/test_strict_clustering.py`
- Modify: `services/chem-cluster-service/chem_cluster_service/intelligence/pipeline.py`
- Modify: `services/chem-cluster-service/chem_cluster_service/intelligence/contracts.py`
- Modify: `packages/exporter-training/src/reaction-intelligence-types.ts`
- Modify: `packages/exporter-training/src/reaction-intelligence.ts`
- Modify: `packages/exporter-training/tests/reaction-intelligence.test.ts`
- Modify: `apps/docs/content/docs/{en,zh}/exports/graph-reaction-map.mdx`

聚类算法：

```text
G_strict = (V, E_strict)
E_strict = strict_computed_similarity edges
strict clusters = connected_components(G_strict)
```

注意：

- candidate neighbors 不形成 strict cluster。
- semantic groups 单独输出。
- bridge edge 过弱时输出 warning。

验证：

```bash
python -m unittest services/chem-cluster-service/tests/test_strict_clustering.py
python -m unittest discover services/chem-cluster-service/tests
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
git diff --check
```

提交建议：

```text
feat(cluster-service)：build strict reaction clusters

- Split strict clusters from candidate neighbors
- Keep semantic-only groups separate
- Add warnings for insufficient computed evidence
```

### Phase 5: Cluster Profile Generator

Trellis task slug: `hybrid-reaction-cluster-profiles`

目标：

生成 LLM/训练导出可读的 cluster profile。向量和 computed score 负责“像不像”，profile 负责“为什么像、怎么用”。

输出示例：

```json
{
  "cluster_id": "strict-cluster::...",
  "label": "C-N bond formation under basic conditions",
  "representative_reaction_entity_id": "reaction::rxn-1",
  "common_reaction_center": "formed:C-N:single",
  "common_material_roles": {
    "reactants": ["aryl halide", "amine"],
    "reagents": ["base"],
    "solvents": ["DMF"]
  },
  "common_steps": ["charge", "add", "hold", "quench", "purify"],
  "condition_summary": {
    "temperature": "ambient_to_heated",
    "time": "hours"
  },
  "nearest_neighbors": [],
  "warnings": []
}
```

主要文件：

- Create: `packages/exporter-training/src/reaction-cluster-profile.ts`
- Create: `packages/exporter-training/tests/reaction-cluster-profile.test.ts`
- Modify: `packages/exporter-training/src/reaction-intelligence.ts`
- Modify: `packages/exporter-training/src/reaction-intelligence-types.ts`
- Modify: `packages/exporter-training/src/index.ts`
- Modify: `apps/docs/content/docs/{en,zh}/exports/graph-reaction-map.mdx`

验收：

- profile 不改变 strict cluster 结果，只解释结果。
- profile 保留 common materials / roles / steps / conditions / warnings。
- representative reaction deterministic。
- 缺少 evidence 时明确 warning。

验证：

```bash
pnpm --filter @chemd/exporter-training test -- reaction-cluster-profile.test.ts
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
git diff --check
```

提交建议：

```text
feat(exporter-training)：add reaction cluster profiles

- Summarize strict clusters for LLM use
- Include common materials, steps, conditions, and warnings
- Keep profile generation separate from clustering decisions
```

### Phase 6: CLI / Docs / User-Facing Contract

Trellis task slug: `hybrid-reaction-cli-docs`

目标：

让 CLI 和文档明确区分 strict clusters、candidate neighbors、semantic groups。

主要文件：

- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/cli.spec.ts`
- Modify: `apps/docs/content/docs/{en,zh}/exports/graph-reaction-map.mdx`
- Modify: `apps/docs/content/docs/{en,zh}/codebase/services.mdx`

CLI 输出目标：

```text
strict reaction clusters: N
candidate reaction neighbors: N
semantic reaction groups: N
computed providers: rdkit PASS, rxnfp SKIP, rxnmapper PASS
warnings: ...
```

文档必须说明：

- strict reaction clusters 以 computed chemistry evidence 为主。
- semantic context 低权重参与。
- provider unavailable 不伪装成功。
- 没有 computed evidence 时只能输出 semantic group。

验证：

```bash
pnpm --filter @chemd/cli test
pnpm --filter @chemd/cli typecheck
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
git diff --check
```

提交建议：

```text
docs(exports)：document hybrid reaction clustering

- Explain strict clusters and semantic groups
- Add CLI output examples
- Document provider warning behavior
```

### Phase 7: End-to-End Gold Corpus

Trellis task slug: `hybrid-reaction-gold-corpus`

目标：

建立固定 fixtures，防止后续改动把“步骤相似”误判为“反应相似”。

必须覆盖：

1. 同 reaction center + 高 RDKit / RXNFP，相同 strict cluster。
2. procedure / condition 相同，但 reaction center 不同，不进 strict cluster。
3. 没有 canonical SMILES，只进 semantic group。
4. provider unavailable，输出 warning。
5. mixed evidence 输出 contributions。
6. semantic context 只提升边缘分数，不推翻 chemistry gate。

主要文件：

- Create or modify: `fixtures/reaction-intelligence/*.json`
- Modify: `services/chem-cluster-service/tests/test_intelligence_pipeline.py`
- Modify: `packages/exporter-training/tests/reaction-intelligence.test.ts`
- Modify: `packages/cli/src/cli.spec.ts`

验证：

```bash
python -m unittest discover services/chem-cluster-service/tests
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/cli test
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
git diff --check
```

提交建议：

```text
test(reaction-intelligence)：add hybrid clustering gold cases

- Cover strict cluster gates
- Cover semantic-only grouping
- Cover provider unavailable warnings
```

### Phase 8: Final Integration Review

Trellis task slug: `hybrid-reaction-final-contract-review`

目标：

统一 contract、命名、docs、warnings，消除遗留漂移。

审查清单：

- `reaction_clusters` 是否仍被误用为 strict computed clusters。
- `semantic_reaction_groups` 是否明确不是 strict reaction clusters。
- Python artifact 和 TS merged graph 字段是否一致。
- EN/ZH docs 是否同步。
- CLI / desktop panel 是否不会误导用户。
- 所有 warning 是否保留，没有静默省略。
- `docs/hybrid-reaction-clustering-math.tex` 是否需要移入可提交路径或转成 Markdown 附录；当前 `docs/` 被 `.gitignore` 忽略时要特别确认。

验证：

```bash
pnpm --filter @chemd/exporter-training typecheck
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/cli typecheck
pnpm --filter @chemd/cli test
pnpm --filter @chemd/docs typecheck
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
python -m unittest discover services/chem-cluster-service/tests
git diff --check
```

提交建议：

```text
refactor(reaction-intelligence)：finalize hybrid clustering contract

- Remove ambiguous cluster naming
- Align docs, CLI, and merged artifact output
- Preserve strict computed clustering boundaries
```

## 每阶段 Trellis Closeout 模板

每个阶段完成前执行：

```bash
git status --short --untracked-files=all
git diff --check
# run targeted tests
# run affected package typecheck/tests
git add <files>
git commit -m "<type(scope)：summary>" -m "- <body line>" -m "- <body line>"
# mark task completed in task.json when task.py finish only clears current task
python ./.trellis/scripts/add_session.py --title "<phase title>" --commit "<hash>" --summary "<what changed and verified>"
python ./.trellis/scripts/task.py finish
git status --short --untracked-files=all
```

如果 `task.py finish` 只清除 current task 而没有改 `task.json.status`，需要显式把当前阶段 task 标记为：

```json
{
  "status": "completed",
  "completedAt": "YYYY-MM-DD",
  "commit": "<implementation commit>"
}
```

并单独提交：

```text
chore(trellis)：complete <phase> task

- Mark phase task completed
- Link task record to implementation commit
```

## 推荐执行顺序

后续从 Phase 3 继续，不要重做 Phase 1 / Phase 2：

```text
Phase 3 completed -> Phase 4 completed -> Phase 5 completed -> Phase 6 completed -> Phase 7 completed -> Phase 8 in closeout
```

## 进度记录

- 2026-05-24: Phase 1/2/3 已完成并 record。
- 2026-05-24: Phase 4 已完成并 record。
- 2026-05-24: Phase 5 已完成并 record。
- 2026-05-24: Phase 6 已完成并 record。
- 2026-05-24: Phase 7 已完成并 record。
- 2026-05-24: Phase 8 审查确认 Python artifact、TS merge、CLI text、EN/ZH docs 的 strict/candidate/semantic/profile 命名一致；`reaction_clusters` 仍是 graph-index semantic clusters；`docs/hybrid-reaction-clustering-math.tex` 需要显式纳入提交。

## Phase 8 审查结果

- `reaction_clusters` 仍由 `packages/exporter-training/src/graph-index.ts` 生成，语义是 graph-index semantic source truth。
- strict computed 聚类只通过 `strict_reaction_clusters` 输出。
- 弱 computed 邻居只通过 `candidate_reaction_neighbors` 输出。
- semantic-only 相似性只通过 `semantic_reaction_groups` 输出。
- LLM/训练解释层只通过 `strict_reaction_cluster_profiles` 输出，不改变聚类成员。
- provider skip、semantic-only、hard reject、dropped merge group 都有 warning 路径。
- CLI text 已显式区分 semantic graph-index clusters 和 reaction-intelligence strict clusters。
- EN/ZH docs 已同步字段、示例与 gold case 说明。
