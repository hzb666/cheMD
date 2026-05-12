# Chemd 生产级 IDE、语义节点渲染与反应聚类地图实施计划

状态：实施计划草案
更新时间：2026-05-13
目标：生产可用
适用范围：Chemd Desktop IDE、Monaco language service、语义节点渲染、workspace 引用库、反应关联、反应聚类、TMAP layout、Graph/RAG/训练闭环

输入 PRD：

- [Chemd Monaco 自动补全与 Snippets PRD](./chemd-monaco-autocomplete-prd.zh-CN.md)
- [Chemd Monaco 自动补全实施计划](./chemd-monaco-autocomplete-implementation-plan.zh-CN.md)
- [Chemd 节点渲染与反应聚类总 PRD](./chemd-rendering-and-reaction-clustering-master-prd.zh-CN.md)
- [Chemd 语义节点渲染 PRD](./chemd-semantic-node-rendering-prd.zh-CN.md)
- [Chemd 反应聚类与 TMAP 地图 PRD](./chemd-reaction-clustering-tmap-prd.zh-CN.md)
- 外部工作树证据：`D:\Code\chemd-wt-desktop-ide-docs\docs\desktop-ide\offline-first-productization-implementation.zh-CN.md`

---

## 1. 总目标

把 Chemd 从“可编译 DSL + 预览工作台”推进到生产可用的化学实验 IDE。

生产可用的定义不是“功能能跑”，而是满足以下闭环：

```text
本地 workspace 打开
  -> Monaco 编辑 Chemd
  -> 自动补全 / snippets / 引用跳转 / diagnostics / quick fix
  -> 编译出语义节点树
  -> 文档预览按 typed node 懒渲染
  -> reaction graph / cluster / map 可解释展示
  -> Graph/RAG/训练数据可追溯持久化
  -> 离线可用，联网后可同步
```

---

## 2. 当前基线

### 2.1 主线 `D:\Code\chemd`

当前 `develop` 主线中：

- Web 编辑器仍是 `textarea`。
- 已有 parser、resolver、compiler、renderers、training export、graph index。
- 已有反应关联和聚类的第一版 `trainingGraphIndex`。
- 已有 PostgreSQL storage contract 和 pgvector 基础。
- 本轮新增了多份 PRD 文档，但未改运行时代码。

### 2.2 Desktop IDE 工作树

从 `D:\Code\chemd-wt-workspace-ingest-ui` / `desktop-ide` 系列工作树看到：

- `apps/desktop` 已接入 Monaco。
- `apps/desktop/src/MonacoChemdEditor.tsx` 已实现 language id、基础 tokenization、theme、markers、worker、save command。
- `packages/language-service` 已提供 diagnostics、outline、symbols、Monaco marker/code action DTO、Graph/RAG DTO。
- workspace ingest runner 已有纯 TypeScript 基础。
- 当前尚未完成 completion/snippet provider、hover、definition、workspace symbol index、cross-document reference completion。

### 2.3 已有可复用资产

可直接复用：

- `compileChemd()`
- `compileChemdForEditor()`
- `ChemdEditorDiagnostic`
- `ChemdOutlineItem`
- `ChemdSymbol`
- `toMonacoLanguageServiceModel()`
- `toMonacoCodeActions()`
- `buildEditorGraphRagRecords()`
- `buildTrainingGraphIndexFromUnderstandings()`
- `TrainingReactionClusterV1`
- `TrainingReactionSimilarityEdgeV1`

---

## 3. 生产范围

### 3.1 P0 必须交付

P0 是生产可用最低闭环：

1. Monaco Chemd authoring assistance。
2. Workspace symbol index。
3. 当前文档和跨文档引用补全。
4. Diagnostics markers 和 code actions。
5. 语义节点 renderable tree 合同。
6. 文档预览支持 typed node shell 和 heavy node hydration。
7. 反应 cluster list/detail。
8. 离线 workspace 打开、编辑、保存、重启恢复。

### 3.2 P1 应交付

P1 是完整 IDE 体验：

1. Hover。
2. Go to definition。
3. Find references。
4. Template completion。
5. Cluster map MVP。
6. Graph/RAG 持久化闭环。
7. 生产 smoke 自动化。

### 3.3 P2 后续增强

P2 是化学智能增强：

1. RXNFP embedding。
2. RXNMapper atom mapping。
3. TMAP layout worker。
4. Hybrid similarity graph。
5. 人工审查 cluster/edge。
6. 训练数据闭环。

---

## 4. 架构总览

### 4.1 IDE authoring 层

```text
MonacoChemdEditor
  -> Chemd providers
  -> @chemd/language-service
  -> compiler output
  -> diagnostics / outline / symbols / completion / quick fixes
```

### 4.2 Workspace index 层

```text
workspace files
  -> ingest runner
  -> compile each file
  -> symbols + diagnostics + graph/rag records
  -> in-memory symbol index
  -> optional persistence
```

### 4.3 渲染层

```text
compile output
  -> renderable semantic node tree
  -> HTML/React shell
  -> hydration registry
  -> molecule / reaction / evidence / cluster components
```

### 4.4 反应聚类层

```text
trainingUnderstanding
  -> trainingGraphIndex
  -> reaction features
  -> similarity edges
  -> clusters
  -> cluster detail / cluster map
  -> optional TMAP layout artifact
```

---

## 5. 里程碑计划

## M0：合同冻结与工作树对齐

目标：在开始实现前固定跨层合同，避免 Monaco、language-service、renderer、storage 各写一套。

### M0.1 合同清单

需要冻结：

- `ChemdCompletionRequest`
- `ChemdCompletionItem`
- `ChemdWorkspaceSymbol`
- `ChemdWorkspaceSymbolIndex`
- `ChemdRenderableNodeV1`
- `ChemdRenderDirectiveV1`
- `ChemdReactionClusterLayoutV1`

### M0.2 工作树对齐

当前 Monaco 实现位于 desktop-ide 工作树，不在 `develop` 主线。实施前必须决定：

- 在现有 desktop-ide 工作树继续。
- 或从 desktop-ide 分支 merge/rebase 到新的 feature worktree。

建议：

```text
以 desktop-ide 工作树为基础继续实现 IDE 功能。
develop 只承接最终合并后的文档和稳定合同。
```

### M0.3 验收

- [ ] 所有新增合同有 TypeScript 类型草案。
- [ ] package ownership 明确。
- [ ] 不同工作树的代码进度记录到实施文档。
- [ ] `git status` 中用户已有未跟踪文档不被覆盖。

---

## M1：Monaco 补全 MVP

目标：Chemd 编辑器能提供生产可用的基础写作辅助。

### M1.1 Language-service completion core

新增文件：

```text
packages/language-service/src/completion-types.ts
packages/language-service/src/completion-context.ts
packages/language-service/src/completion-snippets.ts
packages/language-service/src/completion-fields.ts
packages/language-service/src/completion-values.ts
packages/language-service/src/completion.ts
```

实现内容：

- 解析当前光标上下文。
- 判断当前 block。
- 判断当前 field key/value。
- 返回 snippets、field、value suggestions。
- 保持 Monaco-neutral。

验收：

- [ ] `reaction` snippet 可生成合法 `:::chemd kind: reaction`。
- [ ] `molecule` snippet 可生成合法 `:::chemd kind: molecule`。
- [ ] reaction block 中提示 reaction fields。
- [ ] molecule block 中提示 molecule fields。
- [ ] `kind:` 后提示 `molecule` / `reaction`。
- [ ] `stage:` 后提示 `reaction_setup` / `reaction` / `workup` / `purification` / `analysis`。

测试：

```bash
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/language-service typecheck
```

如果 package 没有 test script，运行对应 Vitest 文件。

### M1.2 Monaco completion provider

新增：

```text
apps/desktop/src/monaco/chemdProviders.ts
apps/desktop/src/monaco/providerDisposables.ts
```

实现内容：

- `registerCompletionItemProvider`
- trigger characters：`:`、`@`、`#`、空格。
- completion DTO 到 Monaco item 映射。
- snippet item 使用 `InsertAsSnippet`。
- provider dispose 生命周期。

验收：

- [ ] completion popup 正常出现。
- [ ] snippet tabstop 可用。
- [ ] provider 不重复注册。
- [ ] unmount 时 dispose。

测试：

```bash
pnpm --filter @chemd/desktop typecheck
pnpm --filter @chemd/desktop build
```

---

## M2：当前文档引用与 quick actions

目标：引用不用手写，diagnostics 能直接修。

### M2.1 当前文档 reference completion

新增：

```text
packages/language-service/src/completion-references.ts
```

实现内容：

- 从 `compileOutput.symbols` 读取当前文档 symbols。
- 按字段过滤 kind。
- `@` 后补全 local references。
- `reaction:`、`prev:`、`reactants:`、`products:` 有不同排序。

验收：

- [ ] `reactants: @` 优先提示 molecule。
- [ ] `reaction: @` 优先提示 reaction。
- [ ] `prev: @` 优先提示 reaction。
- [ ] completion detail 显示 kind 和 source line。

### M2.2 Monaco code action provider

实现内容：

- 注册 `registerCodeActionProvider`。
- 复用 `toMonacoCodeActions()`。
- 应用 patch 前校验 `beforeHash`。
- hash 不匹配时提示重新编译。

验收：

- [ ] `W_CHEMD_KIND_AMBIGUOUS` 能通过 Monaco lightbulb 插入 `kind`。
- [ ] patch 应用后 compile diagnostics 减少或不增加 error。
- [ ] hash 失配时不应用 patch。

### M2.3 验证

```bash
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/desktop typecheck
pnpm --filter @chemd/desktop build
```

手测：

- 打开 desktop IDE。
- 创建 ambiguous `:::chemd`。
- 观察 marker。
- 执行 code action。
- 保存并重启确认内容存在。

---

## M3：Workspace symbol index 与跨文档引用

目标：形成类似“引用库”的 workspace 级索引。

### M3.1 Symbol index core

新增：

```text
packages/language-service/src/workspace-symbols.ts
packages/language-service/tests/workspace-symbols.test.ts
```

实现内容：

- 从多个 compile output 收集 symbols。
- 生成 `documentId#localId`。
- 记录 documentUri、range、kind、summary、sourceHash。
- 编译失败文件只记录 diagnostics，不写入 symbols。

验收：

- [ ] 多文件 symbols 可合并。
- [ ] 同名 local id 通过 documentId 区分。
- [ ] stale symbol 可标记。

### M3.2 Desktop workspace index integration

接入现有 workspace ingest runner：

```text
scan workspace
  -> compile file
  -> update symbol index
  -> update provider snapshot
```

验收：

- [ ] 打开 workspace 后跨文档补全可用。
- [ ] 文件变更后 index 更新。
- [ ] 大 workspace 不在每次输入时扫描。

### M3.3 Cross-document reference completion

实现内容：

- 支持 `doc#id` 建议。
- 支持 `@doc#id` 或现有 reference 语法兼容策略。
- 补全 detail 显示文件路径和文档标题。

验收：

- [ ] `reaction: route-doc#` 提示 `route-doc#rxn-step-01`。
- [ ] 当前文档 symbols 排在跨文档 symbols 前。
- [ ] stale symbols 降权并标记。

---

## M4：Hover、Definition 与基础导航

目标：实现 IDE 级读写闭环。

### M4.1 Hover

新增：

```text
packages/language-service/src/hover.ts
apps/desktop/src/monaco/chemdProviders.ts
```

Hover 内容：

- symbol kind。
- source document。
- summary。
- diagnostics code/message。
- template params。

验收：

- [ ] hover `@mol-a` 显示 molecule summary。
- [ ] hover diagnostic range 显示 code 和 quick fix count。
- [ ] hover template name 显示 params。

### M4.2 Definition

新增：

```text
packages/language-service/src/definition.ts
```

实现内容：

- 当前文档引用跳转。
- 跨文档引用返回 open-document intent。
- Desktop app 执行打开文件并跳转 range。

验收：

- [ ] Ctrl/Cmd click 当前文档引用跳转成功。
- [ ] 跨文档引用打开目标文档。
- [ ] 未找到目标时显示 unresolved reference。

### M4.3 Find references

P1 可选：

- 当前 workspace index 反查 symbol usages。
- 不要求 rename。

验收：

- [ ] 能列出当前 symbol 的使用位置。

---

## M5：语义节点渲染合同与 MVP

目标：让 Chemd preview 从字符串 HTML 走向 typed semantic node rendering。

### M5.1 Renderable node core

新增或扩展：

```text
packages/core/src/renderable-node.ts
packages/renderer-json/src/renderable-node.ts
```

类型：

- `ChemdRenderableNodeV1`
- `ChemdRenderDirectiveV1`
- `ChemdSourceRefV1`

验收：

- [ ] document、molecule、reaction、procedure、result、evidence 可输出 node。
- [ ] 每个 node 有稳定 `node_id`。
- [ ] 每个 node 可回到 source range。

### M5.2 HTML/React shell

实现内容：

- 输出 `data-chemd-node-id`。
- 输出 `data-chemd-type`。
- 输出 `data-chemd-render-state`。
- heavy node 只输出 placeholder。

验收：

- [ ] reaction placeholder 不阻塞文档首屏。
- [ ] molecule/reaction hydration 失败有 fallback。
- [ ] source ref 不丢失。

### M5.3 Desktop/Web preview integration

实现内容：

- hydration registry。
- reaction/molecule/evidence component。
- cluster badge component。

验收：

- [ ] 预览中 reaction block 可展开。
- [ ] evidence 可回跳源码。
- [ ] cluster badge 可显示但不要求 map。

---

## M6：反应 cluster list/detail

目标：先让现有 graph index 产品化，不等待 TMAP/RXNFP。

### M6.1 Graph index UI adapter

实现内容：

- 读取 `ChemdTrainingGraphIndexV1`。
- 暴露 reaction clusters。
- 暴露 similarity edges。
- 保留 basis、score、warnings。

验收：

- [ ] cluster list 可显示 member count。
- [ ] cluster detail 可显示 shared features。
- [ ] similarity edge 可显示 basis。
- [ ] semantic-only warning 明确可见。

### M6.2 Reaction detail integration

实现内容：

- reaction block 显示 cluster badge。
- cluster detail 可跳回 reaction。
- similarity edge 可打开两端 reaction。

验收：

- [ ] reaction -> cluster -> reaction 往返可用。
- [ ] weak cluster 不被展示成 high-confidence chemical similarity。

---

## M7：Cluster map MVP

目标：地图进应用，TMAP 不进应用 runtime。

### M7.1 Layout artifact 合同

实现：

- `ChemdReactionClusterLayoutV1`
- layout nodes
- layout edges
- clusters
- warnings

验收：

- [ ] artifact 能表达 x/y、cluster、edge、basis、warnings。
- [ ] layout id 与 graph index id 分离。

### M7.2 Semantic edge layout spike

第一版可以不用 TMAP，先用 deterministic/simple layout 或测试 fixture。

目的：

- 先验证前端地图交互。
- 不被 Python/conda 依赖阻塞。

验收：

- [ ] Web/Desktop 能显示 1k reaction points fixture。
- [ ] 点选显示 reaction inspector。
- [ ] cluster filter 可用。

### M7.3 TMAP worker

新增独立 worker，不进入现有 `chem-service`：

```text
services/chem-cluster-service
```

实现内容：

- 读取 graph index / edge list。
- 调用 TMAP `LayoutFromEdgeList`。
- 输出 layout artifact。

验收：

- [ ] worker 可单独运行。
- [ ] 失败不影响 IDE authoring。
- [ ] TMAP 缺失时有清晰 SKIP/ERROR。

---

## M8：生产验证与发布门禁

目标：形成可重复证明的生产可用证据。

### M8.1 自动验证

必须跑：

```bash
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/language-service typecheck
pnpm --filter @chemd/desktop typecheck
pnpm --filter @chemd/desktop build
pnpm test
pnpm typecheck
```

Desktop 相关：

```bash
pnpm desktop:offline-core-smoke
pnpm desktop:offline-release-smoke
pnpm desktop:installer-offline-smoke
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml workspace
```

如果缺 PostgreSQL binaries 或外部 DB，必须标记：

```text
SKIP: environment-blocked, not product pass
```

### M8.2 手动 smoke

必须覆盖：

1. 干净启动 desktop IDE。
2. 打开 workspace。
3. 打开 `.chemd.md`。
4. snippets 插入 reaction。
5. current document reference completion。
6. cross-document reference completion。
7. diagnostics marker。
8. code action 应用 quick fix。
9. 保存。
10. 关闭重启。
11. 内容恢复。
12. preview 可渲染。
13. cluster list/detail 可打开。
14. 无 DB 时离线路径可用。

### M8.3 截图证据

UI 变更需要：

- Monaco completion popup。
- diagnostics marker + Problems panel。
- code action。
- hover/definition。
- semantic preview。
- cluster detail/map。

---

## 6. 任务拆分建议

### 子任务 A：language-service completion core

写范围：

- `packages/language-service/src/completion-*`
- `packages/language-service/tests/completion.test.ts`

不写：

- `apps/desktop`
- storage

### 子任务 B：Monaco provider integration

写范围：

- `apps/desktop/src/MonacoChemdEditor.tsx`
- `apps/desktop/src/monaco/*`

不写：

- compiler/parser

### 子任务 C：workspace symbol index

写范围：

- `packages/language-service/src/workspace-symbols.ts`
- desktop workspace ingest adapter

注意：

- 不在 completion provider 里扫描文件。

### 子任务 D：renderable node contract

写范围：

- `packages/core`
- `packages/renderer-json`
- `packages/renderer-html`

注意：

- 不改现有 preview 语义，先并行输出新 artifact。

### 子任务 E：cluster UI

写范围：

- graph index adapter
- cluster list/detail UI
- cluster badge

注意：

- 不等待 TMAP。

### 子任务 F：TMAP worker

写范围：

- `services/chem-cluster-service`
- layout artifact generator

注意：

- 独立环境，不能污染 `chem-service`。

---

## 7. 合并顺序

推荐顺序：

1. 合并 Monaco/editor baseline。
2. 合并 `@chemd/language-service` completion core。
3. 合并 Monaco providers。
4. 合并 workspace symbol index。
5. 合并 renderable node contract。
6. 合并 semantic preview hydration。
7. 合并 cluster list/detail。
8. 合并 cluster map fixture。
9. 合并 TMAP worker。

理由：

- IDE authoring 是生产入口，优先。
- renderable node 是预览和地图详情的基础。
- cluster list/detail 比地图更早提供业务价值。
- TMAP 是后端 layout 增强，不能阻塞产品主线。

---

## 8. 数据与存储策略

### 8.1 P0 内存优先

P0 中：

- completion 使用内存 compile output。
- workspace symbol index 使用内存 snapshot。
- cluster list 可以从 compile artifact 或 fixture 读取。

### 8.2 P1 持久化

P1 中：

- workspace symbol index 可进入 local store。
- Graph/RAG records 可进入 storage contract。
- cluster layout artifact 可落文件或 DB。

### 8.3 P2 同步

P2 中：

- shared schema 持久化。
- Graph/RAG/cluster layout 同步。
- 人工审查结果写回 training memory。

---

## 9. 风险矩阵

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| Monaco provider 重复注册 | completion 重复、性能下降 | 集中 provider registry，unmount dispose |
| Completion 字段与 parser 漂移 | IDE 提示非法字段 | 后续把 field registry 下沉到 parser/core |
| Quick fix patch 错位 | 用户内容被破坏 | `beforeHash` 校验，不匹配则拒绝 |
| Workspace index 扫描卡顿 | 输入延迟 | ingest 增量构建，provider 只读 snapshot |
| TMAP 安装失败 | 地图 layout 阻塞 | TMAP 独立 worker，缺失时 SKIP，不影响 IDE |
| Semantic cluster 误导 | 弱关联当强相似 | UI 必须展示 basis/confidence/warnings |
| Preview hydration 失败 | 文档不可读 | placeholder + fallback + retry |
| DB 不可用 | 生产证明不足 | 离线 PASS 与 DB SKIP 分开报告 |

---

## 10. 生产可用验收清单

### IDE

- [ ] Monaco 编辑器稳定加载。
- [ ] snippets 可用。
- [ ] field completion 可用。
- [ ] value completion 可用。
- [ ] current document reference completion 可用。
- [ ] cross-document reference completion 可用。
- [ ] diagnostics markers 可用。
- [ ] code actions 可用。
- [ ] hover 可用。
- [ ] go to definition 可用。
- [ ] 保存和重启恢复可用。

### Preview

- [ ] renderable node tree 可生成。
- [ ] molecule/reaction 节点可 lazy hydrate。
- [ ] evidence/source ref 可回跳。
- [ ] hydration error 有 fallback。

### Graph/Cluster

- [ ] graph index 可生成。
- [ ] cluster list/detail 可显示。
- [ ] similarity edge basis 可解释。
- [ ] weak/semantic-only warning 可见。
- [ ] cluster map 可显示 layout artifact。

### Runtime

- [ ] Offline core smoke 通过。
- [ ] build/typecheck/test 通过。
- [ ] installer artifact smoke 通过。
- [ ] clean install smoke 有证据。
- [ ] DB 不可用时明确 SKIP。

---

## 11. 完成定义

一个 milestone 只有满足以下条件才算完成：

1. 代码实现完成。
2. 单元测试覆盖核心逻辑。
3. 类型检查通过。
4. UI 变更有截图或手测记录。
5. 文档同步更新。
6. 已区分 product pass、environment skip、known limitation。
7. 没有把 mock/static/localhost 证据说成生产证明。

---

## 12. 下一步推荐

建议立即从 M1 开始：

```text
M1 language-service completion core
  -> M1 Monaco provider
  -> M2 reference + code actions
  -> M3 workspace symbol index
```

原因：

- Monaco 已经落地，补全是最短路径。
- 这些能力直接提升 Chemd 写作质量。
- 不依赖 TMAP、DB 或新渲染系统。
- 产出的 workspace symbol index 后续还能服务跨文档引用、hover、definition、Graph/RAG 和 cluster detail。

---

## 13. 分支状态记录

### 2026-05-13 desktop-ide-map-completion-ls

更新时间：2026-05-13

本分支只完成 M1.1 `@chemd/language-service` completion core：

- 新增 Monaco-neutral `getChemdCompletions(request)`。
- 覆盖 Chemd reaction/molecule snippets、Chemd block field suggestions、`kind:` enum value suggestions、`stage:` enum value suggestions。
- 不接入 `apps/desktop`，不实现 workspace symbol index 或 cross-document references。
- 验证命令：`pnpm --filter @chemd/language-service test`、`pnpm --filter @chemd/language-service typecheck`、`git diff --check`。

### 2026-05-13 desktop-ide-map-reaction-clusters

- 范围：完成 M6.1/M6.2 的纯数据 adapter 基础，不包含 UI、App.tsx、TMAP、embedding 或 layout。
- 产物：`buildReactionClusterViewModel()` 和 `findReactionClusterDetail()` 从 `ChemdTrainingGraphIndexV1` 输出 cluster list/detail、members、similarity edges、evidence summary、citation/source ids 与 warnings。
- 降级：无 cluster 时返回空 list/detail，并在 summary 标记 `empty_reason: "no_reaction_clusters"`；缺少 shared features 且没有 similarity edge 时追加 `cluster_evidence_not_available`。
- 验证：
  - `pnpm --filter @chemd/exporter-training test`：通过，8 files / 23 tests。
  - `pnpm --filter @chemd/exporter-training typecheck`：通过。
  - `git diff --check`：通过；仅输出计划文档和 `packages/exporter-training/src/index.ts` 的 LF/CRLF 工作区提示。

### 2026-05-13 workspace-index 子任务未合并

- 原 `desktop-ide-map-workspace-index` 子任务未进入主线。
- 原因：实现反复越过本轮边界，创建新的 `packages/workspace-index` package，而本轮要求只在
  `@chemd/language-service` 内沉淀纯 helper。
- 处理：停止该子代理，不合并该分支；下一轮重新切分为 language-service-only 工作包。

### 2026-05-13 desktop-ide-map-workspace-symbol-core

- 范围：完成 M3.1 的 `@chemd/language-service` workspace symbol index 纯 helper，不接入
  `apps/desktop`，不新增 workspace package，不修改 root 配置。
- 产物：`buildChemdWorkspaceSymbolIndex(entries)` 复用 `compileChemdForEditor()` 的
  diagnostics/outline/symbols 输出，生成 workspace documents、symbols、`symbolsByKind`、
  `symbolIdsByName` 与 diagnostics summary。
- 降级：单文档编译失败只记录 failed document 和 diagnostics，不写入该文档 symbols，也不阻断
  其他文档入索引。
- 验证：
  - `pnpm --filter @chemd/language-service test`：通过，3 files / 22 tests。
  - `pnpm --filter @chemd/language-service typecheck`：通过。
  - `git diff --check`：通过。
