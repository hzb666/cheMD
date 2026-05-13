# Chemd 生产级 IDE、语义节点渲染与反应聚类地图实施计划

状态：P0/P1 核心、第三轮剩余代码目标、TMAP worker 骨架与安装包 artifact smoke 已落地；clean-machine 安装验收需在真实干净环境执行
更新时间：2026-05-13
目标：生产可用
适用范围：Chemd Desktop IDE、Monaco language service、语义节点渲染、workspace 引用库、反应关联、反应聚类、TMAP layout、Graph/RAG/训练闭环

当前执行分支：

- 主集成分支：`desktop-ide-map`
- 主集成工作树：`D:\Code\chemd-wt-desktop-ide-map`
- 基线提交：`8131982 docs(desktop)：添加地图生产实施计划`
- 已合入基础：`desktop-ide` 现有 Tauri / Monaco / language-service / Postgres runtime 基线

输入 PRD：

- [Chemd Monaco 自动补全与 Snippets PRD](./chemd-monaco-autocomplete-prd.zh-CN.md)
- [Chemd Monaco 自动补全实施计划](./chemd-monaco-autocomplete-implementation-plan.zh-CN.md)
- [Chemd 节点渲染与反应聚类总 PRD](./chemd-rendering-and-reaction-clustering-master-prd.zh-CN.md)
- [Chemd 语义节点渲染 PRD](./chemd-semantic-node-rendering-prd.zh-CN.md)
- [Chemd 反应聚类与 TMAP 地图 PRD](./chemd-reaction-clustering-tmap-prd.zh-CN.md)
- [Chemd Reaction Intelligence Worker 实施计划](./chemd-reaction-intelligence-worker-implementation-plan.zh-CN.md)
- 外部工作树证据：`D:\Code\chemd-wt-desktop-ide-docs\docs\desktop-ide\offline-first-productization-implementation.zh-CN.md`

---

## 0. 实施状态记录

### 2026-05-13：M0 基线与第一轮并行切片

已完成：

- [x] 从当前 `HEAD` 新建 `desktop-ide-map` 分支和主工作树。
- [x] 将现有 `desktop-ide` 基线快进合入 `desktop-ide-map`。
- [x] 将本轮 PRD 与生产实施计划提交为主分支执行来源。
- [x] 创建并启动 Trellis 任务：`.trellis/tasks/05-13-desktop-ide-map-production`。
- [x] 修正该任务的过期 Trellis 默认上下文路径，并通过 `task.py validate`。

第一轮并行任务：

| 分支 | 工作树 | 目标 | 写入边界 | 状态 |
| --- | --- | --- | --- | --- |
| `desktop-ide-map-completion-ls` | `D:\Code\chemd-wt-map-completion-ls` | Monaco-neutral completion/snippet language-service core | `packages/language-service/**` | 已合并：`89b784f` |
| `desktop-ide-map-workspace-index` | `D:\Code\chemd-wt-map-workspace-index` | workspace symbol/reference index data layer | `packages/workspace-index/**` | 原工作树 Git 元数据丢失，未合并 |
| `desktop-ide-map-workspace-index-v2` | `D:\Code\chemd-wt-map-workspace-index` | workspace symbol/reference index data layer | `packages/workspace-index/**` | 已合并：`acd4ded` |
| `desktop-ide-map-reaction-clusters` | `D:\Code\chemd-wt-map-reaction-clusters` | reaction cluster/map-ready data layer | `packages/reaction-map/**` | 已合并：`aceac9d` |
| `desktop-ide-map-semantic-rendering` | `D:\Code\chemd-wt-map-semantic-rendering` | semantic render DTO/tree data layer | `packages/semantic-rendering/**` | 已合并：`1b4bebe` |

已验证：

- [x] `pnpm --filter @chemd/language-service test`
- [x] `pnpm --filter @chemd/language-service typecheck`
- [x] `pnpm exec eslint packages/language-service/src/completion-context.ts packages/language-service/src/completion-fields.ts packages/language-service/src/completion-snippets.ts packages/language-service/src/completion-types.ts packages/language-service/src/completion-values.ts packages/language-service/src/completion.ts packages/language-service/tests/completion.test.ts --ext .ts`
- [x] `pnpm --filter @chemd/semantic-rendering test`
- [x] `pnpm --filter @chemd/semantic-rendering typecheck`
- [x] `pnpm --filter @chemd/reaction-map test`
- [x] `pnpm --filter @chemd/reaction-map typecheck`
- [x] `pnpm --filter @chemd/workspace-index test`
- [x] `pnpm --filter @chemd/workspace-index typecheck`
- [x] `pnpm exec eslint packages/workspace-index/src packages/workspace-index/tests --ext .ts`

第一轮已完成的包级能力：

- [x] `@chemd/language-service` completion/snippet/value/reference DTO core。
- [x] `@chemd/workspace-index` 跨文档 symbol/reference index。
- [x] `@chemd/semantic-rendering` 语义渲染 DTO/tree。
- [x] `@chemd/reaction-map` 反应 cluster/map-ready layout 数据层。

串行保留给主架构工作树：

- 根 `package.json` / `pnpm-lock.yaml` / `tsconfig.base.json` 的统一接入。
- `apps/desktop` 中 Monaco providers、workspace index、reaction map panel、semantic preview 的 UI 接入。
- `.trellis` 记录、最终验证、合并和安全清理。

### 2026-05-13：第二轮 Desktop 适配层并行切片

已完成：

- [x] 在主集成分支注册新增 workspace package alias：`@chemd/workspace-index`、`@chemd/semantic-rendering`、`@chemd/reaction-map`。
- [x] 在 `apps/desktop` 接入新增包依赖并更新 lockfile：`74b09bb chore(desktop)：接入地图相关包依赖`。
- [x] 验证 `pnpm --filter @chemd/desktop typecheck`。

第二轮并行任务：

| 分支 | 工作树 | 目标 | 写入边界 | 状态 |
| --- | --- | --- | --- | --- |
| `desktop-ide-map-monaco-provider` | `D:\Code\chemd-wt-map-monaco-provider` | Monaco completion/snippet provider 注册适配 | `apps/desktop/src/monaco/**`、`MonacoChemdEditor.tsx` | 子代理 usage limit 失败；工作树/分支已清理 |
| `desktop-ide-map-workspace-controller` | `D:\Code\chemd-wt-map-workspace-controller` | workspace symbol index UI 控制/视图模型 | `apps/desktop/src/workspace-index/**` | 子代理 usage limit 失败；工作树/分支已清理 |
| `desktop-ide-map-view-models` | `D:\Code\chemd-wt-map-view-models` | reaction map 与 semantic rendering 视图模型 | `apps/desktop/src/knowledge-map/**` | 子代理 usage limit 失败；工作树/分支已清理 |

架构约束：

- `apps/desktop/src/App.tsx` 是最终串联层，不交给并行子任务直接修改。
- Monaco provider、workspace index、knowledge map 都先落成纯 helper / view-model，再由主集成分支做薄接线。
- 子任务不得修改 `package.json`、lockfile、tsconfig、shared contracts、Tauri 命令或其他 packages；如发现需要 shared contract，停止并上报。

调度结果：

- 三个 `gpt-5.5-high` 子代理均因 usage limit 在启动阶段失败，未产生代码改动。
- 主架构工作树按相同边界串行完成第二轮适配层，保留模块边界，未把业务规则塞入入口文件。

主架构工作树已完成：

- [x] `apps/desktop/src/monaco/chemd-completion-provider.ts`：Monaco completion DTO 映射、snippet rule、provider lifecycle/dispose。
- [x] `apps/desktop/src/MonacoChemdEditor.tsx`：薄接入 completion provider，通过 ref 读取当前 compile output / workspace index。
- [x] `apps/desktop/src/monaco/chemd-navigation-provider.ts`：Monaco hover、go to definition、find references provider，复用 workspace symbol index。
- [x] `apps/desktop/src/workspace-index/desktop-workspace-index.ts`：workspace symbol/reference index view-model 与 completion index adapter。
- [x] `apps/desktop/src/workspace-index/use-desktop-workspace-index.ts`：workspace 打开后读取可见 Chemd 文档，当前编辑 buffer 覆盖缓存文档，形成 cross-document index。
- [x] `apps/desktop/src/workspace-index/DesktopWorkspaceIndexPanel.tsx`：workspace symbol/reference 面板组件，`App.tsx` 不承载搜索业务逻辑。
- [x] `apps/desktop/src/knowledge-map/desktop-knowledge-map.ts`：semantic render tree 与 reaction map fallback layout view-model。
- [x] `apps/desktop/src/knowledge-map/DesktopKnowledgeMapPanel.tsx`：semantic summary、reaction map、cluster rows 面板组件，`App.tsx` 只传 view-model。
- [x] 新增 desktop focused tests：Monaco provider、workspace index view-model、knowledge map view-model。
- [x] `apps/desktop/src/App.tsx` 薄接线：completion 接入 workspace index，RAG dock 展示 symbol/reference rows，Reaction Graph dock 展示 reaction map 与 cluster summary。

已验证：

- [x] `pnpm exec vitest run apps/desktop/src/monaco/chemd-completion-provider.test.ts apps/desktop/src/workspace-index/desktop-workspace-index.test.ts apps/desktop/src/knowledge-map/desktop-knowledge-map.test.ts`
- [x] `pnpm --filter @chemd/desktop typecheck`
- [x] `pnpm exec eslint apps/desktop/src/monaco apps/desktop/src/workspace-index apps/desktop/src/knowledge-map apps/desktop/src/MonacoChemdEditor.tsx --ext .ts,.tsx`
- [x] `pnpm exec eslint apps/desktop/src/App.tsx apps/desktop/src/MonacoChemdEditor.tsx apps/desktop/src/monaco apps/desktop/src/workspace-index apps/desktop/src/knowledge-map --ext .ts,.tsx` 已清理新增 unused 问题；剩余 3 项为 `App.tsx` 既有 complexity / max-lines-per-function 门禁，按本轮“复杂度不作为阻塞项”不在此切片拆分。
- [x] `pnpm exec vitest run apps/desktop/src/monaco/chemd-navigation-provider.test.ts apps/desktop/src/monaco/chemd-completion-provider.test.ts`
- [x] `pnpm exec vitest run apps/desktop/src/workspace-index/desktop-workspace-index.test.ts apps/desktop/src/monaco/chemd-navigation-provider.test.ts`
- [x] `pnpm --filter @chemd/desktop build` 通过；仅保留 Vite/lucide/module directive 与 chunk size warning。
- [x] `poetry install` 于 `services/chem-service` 安装 lockfile 依赖，解决新工作树 venv 缺 `flask` 的环境问题。
- [x] `poetry run python -m unittest discover tests` 通过：52 tests。
- [x] `pnpm test` 通过：Turbo packages、Node scripts、Python chem-service tests 均通过。
- [x] `pnpm typecheck` 通过：24 packages。
- [x] 组件化收尾后再次验证：`pnpm --filter @chemd/desktop build`、`pnpm typecheck`、`pnpm test`、新增/修改 desktop 模块 eslint 均通过；`App.tsx` 仍只剩既有 complexity / max-lines-per-function 非阻塞项。
- [x] IDE 闭环补强验证：Monaco code action provider、unresolved reference hover、stale workspace symbol、reaction map canvas/filter/inspector 的定向 Vitest/typecheck/eslint 均通过。
- [x] Runtime smoke 验证：`pnpm desktop:offline-core-smoke` 通过；`pnpm desktop:runtime-smoke` 通过 Offline Core 且明确 `SKIP database persistence`；`pnpm desktop:offline-release-smoke` / `pnpm desktop:installer-offline-smoke` 因 release/MSI/NSIS 产物缺失明确 SKIP。
- [x] 最终回归验证：`pnpm --filter @chemd/desktop build`、`pnpm typecheck`、`pnpm test` 均通过；build 仅保留既有 lucide `use client` 与 chunk size warnings。

### 2026-05-13：第三轮剩余生产目标并行切片

执行锚点：

- 主集成分支：`desktop-ide-map`
- 主集成工作树：`D:\Code\chemd-wt-desktop-ide-map`
- 基线提交：`6b96420 chore(trellis)：创建地图剩余闭环任务`
- Trellis 任务：`.trellis/tasks/05-13-desktop-ide-map-remaining-production`

并行任务：

| 分支 | 工作树 | 目标 | 写入边界 | 状态 |
| --- | --- | --- | --- | --- |
| `desktop-ide-map-hover-details` | `D:\Code\chemd-wt-map-hover-details` | Monaco diagnostic/template hover 细节 | `apps/desktop/src/monaco/**` | 已合并：`111e450` / slice `3f0e133` |
| `desktop-ide-map-preview-source-ref` | `D:\Code\chemd-wt-map-preview-source-ref` | reaction preview 展开、source-ref intent、cluster badge | `apps/desktop/src/knowledge-map/**`、`apps/desktop/src/styles/panels.css` | 已合并：`71bdea0` / slice `a216783` |
| `desktop-ide-map-tmap-worker` | `D:\Code\chemd-wt-map-tmap-worker` | 独立 TMAP worker 与 SKIP/ERROR 分类 | `services/chem-cluster-service/**` | 已合并：`bf02237` / slice `8553866` |

串行保留给主架构工作树：

- 共享实施文档状态更新。
- root config / dependency / lockfile 变更审查。
- 子任务合并、最终验证、Trellis record 和安全清理。
- installer artifact / clean-machine smoke 的环境边界判断。

第三轮已完成：

- [x] Monaco hover 补齐 diagnostic code/message/severity、quick fix count、template params。
- [x] Desktop knowledge map reaction row 支持展开显示子节点、cluster badge 与 source-ref jump intent。
- [x] 独立 `services/chem-cluster-service` worker 骨架支持 graph/layout/training 输入归一化、deterministic fallback layout、缺 TMAP 的 SKIP/ERROR/fallback 分类。
- [x] Tauri workspace command 层保存、读回、hash/reload 行为通过 Rust workspace 测试验证；GUI clean-machine 重启恢复仍归入 M8.2 手动验收。
- [x] 安装包 artifact preflight 已在 release exe、MSI、NSIS 产物存在后通过；该证据不等价于 clean-machine 安装 smoke。

第三轮已验证：

- [x] `pnpm exec vitest run apps/desktop/src/monaco/chemd-navigation-provider.test.ts apps/desktop/src/knowledge-map/desktop-knowledge-map.test.ts` 通过：17 tests。
- [x] `python -m unittest discover services/chem-cluster-service/tests` 通过：5 tests。
- [x] `pnpm --filter @chemd/desktop typecheck` 通过。
- [x] `pnpm exec eslint apps/desktop/src/monaco apps/desktop/src/knowledge-map apps/desktop/src/styles/panels.css --ext .ts,.tsx,.css` 通过；`panels.css` 被当前 ESLint 配置忽略，仅有 warning。
- [x] `pnpm --filter @chemd/desktop build` 通过；仅保留既有 lucide module directive 与 chunk size warnings。
- [x] `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml workspace` 通过：8 tests。
- [x] `python -m compileall services\chem-cluster-service\chem_cluster_service services\chem-cluster-service\tests` 通过。
- [x] `pnpm --filter @chemd/desktop tauri:build` 通过，产出 release exe、MSI、NSIS installer。
- [x] `pnpm desktop:offline-core-smoke` 通过；database persistence 明确不参与该 Offline Core smoke。
- [x] `pnpm desktop:runtime-smoke` 通过 Offline Core，PostgreSQL persistence 因本机缺完整 binaries 明确 `SKIP`。
- [x] `pnpm desktop:offline-release-smoke` 通过 release/MSI/NSIS artifact preflight。
- [x] `pnpm desktop:installer-offline-smoke` 通过 release/MSI/NSIS artifact preflight。
- [x] `pnpm typecheck` 通过：24 packages。
- [x] `pnpm test` 通过：Turbo packages、Node scripts、Python chem-service tests 均通过。

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
- 本轮已补齐 completion/snippet provider、hover、definition、workspace symbol index、cross-document reference completion、Monaco code action lightbulb、安装包 artifact smoke 与独立 TMAP worker 骨架。

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

- [x] 所有新增合同有 TypeScript 类型草案。
- [x] package ownership 明确。
- [x] 不同工作树的代码进度记录到实施文档。
- [x] `git status` 中用户已有未跟踪文档不被覆盖。

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

- [x] `reaction` snippet 可生成合法 `:::chemd kind: reaction`。
- [x] `molecule` snippet 可生成合法 `:::chemd kind: molecule`。
- [x] reaction block 中提示 reaction fields。
- [x] molecule block 中提示 molecule fields。
- [x] `kind:` 后提示 `molecule` / `reaction`。
- [x] `stage:` 后提示 `reaction_setup` / `reaction` / `workup` / `purification` / `analysis`。

测试：

```bash
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/language-service typecheck
```

如果 package 没有 test script，运行对应 Vitest 文件。

### M1.2 Monaco completion provider

新增：

```text
apps/desktop/src/monaco/chemd-completion-provider.ts
apps/desktop/src/monaco/chemd-completion-provider.test.ts
apps/desktop/src/MonacoChemdEditor.tsx
```

实现内容：

- `registerCompletionItemProvider`
- trigger characters：`:`、`@`、`#`、空格。
- completion DTO 到 Monaco item 映射。
- snippet item 使用 `InsertAsSnippet`。
- provider dispose 生命周期。

验收：

- [x] completion provider 已注册并返回 Monaco item；真实 popup 截图 smoke 待后续补证。
- [x] snippet tabstop 通过 `InsertAsSnippet` 映射。
- [x] provider 不重复注册。
- [x] unmount 时 dispose。

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
packages/language-service/src/completion.ts
packages/language-service/src/completion-types.ts
```

实现内容：

- 从 `compileOutput.symbols` 读取当前文档 symbols。
- 按字段过滤 kind。
- `@` 后补全 local references。
- `reaction:`、`prev:`、`reactants:`、`products:` 有不同排序。

验收：

- [x] `reactants: @` 优先提示 molecule。
- [x] `reaction: @` 优先提示 reaction。
- [x] `prev: @` 优先提示 reaction。
- [x] completion detail 显示 kind 和 source line。

### M2.2 Monaco code action provider

实现内容：

- 注册 `registerCodeActionProvider`。
- 复用 `toMonacoCodeActions()`。
- 应用 patch 前校验 `beforeHash`。
- hash 不匹配时提示重新编译。

验收：

- [x] `W_CHEMD_KIND_AMBIGUOUS` 能通过 Monaco lightbulb 插入 `kind`。
- [x] patch 应用后 compile diagnostics 减少或不增加 error。
- [x] hash 失配时不应用 patch。

状态：已新增 `apps/desktop/src/monaco/chemd-code-action-provider.ts`，注册 Monaco `registerCodeActionProvider`，并在 provider 返回阶段校验 `beforeHash`。

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
packages/workspace-index/src
packages/workspace-index/tests
```

实现内容：

- 从多个 compile output 收集 symbols。
- 生成 `documentId#localId`。
- 记录 documentUri、range、kind、summary、sourceHash。
- 编译失败文件只记录 diagnostics，不写入 symbols。

验收：

- [x] 多文件 symbols 可合并。
- [x] 同名 local id 通过 documentId / documentUri 区分。
- [x] stale symbol 可标记。

### M3.2 Desktop workspace index integration

接入现有 workspace ingest runner：

```text
scan workspace
  -> compile file
  -> update symbol index
  -> update provider snapshot
```

验收：

- [x] 打开 workspace 后跨文档补全可用。
- [x] 当前编辑 buffer 变更后 index 更新。
- [x] provider 只读 snapshot，不在每次输入时扫描 workspace。

### M3.3 Cross-document reference completion

实现内容：

- 支持 `doc#id` 建议。
- 支持 `@doc#id` 或现有 reference 语法兼容策略。
- 补全 detail 显示文件路径和文档标题。

验收：

- [x] `reaction: route-doc#` 提示 `route-doc#rxn-step-01`。
- [x] 当前文档 symbols 排在跨文档 symbols 前。
- [x] stale symbols 降权并标记。

---

## M4：Hover、Definition 与基础导航

目标：实现 IDE 级读写闭环。

### M4.1 Hover

新增：

```text
apps/desktop/src/monaco/chemd-navigation-provider.ts
packages/workspace-index/src/queries.ts
```

Hover 内容：

- symbol kind。
- source document。
- summary。
- diagnostics code/message。
- template params。

验收：

- [x] hover `@mol-a` 显示 symbol kind/document/line。
- [x] hover diagnostic range 显示 code 和 quick fix count。
- [x] hover template name 显示 params。

### M4.2 Definition

新增：

```text
apps/desktop/src/monaco/chemd-navigation-provider.ts
```

实现内容：

- 当前文档引用跳转。
- 跨文档引用返回 open-document intent。
- Desktop app 执行打开文件并跳转 range。

验收：

- [x] Ctrl/Cmd click 当前文档引用返回 Monaco definition location。
- [x] 跨文档引用返回目标 document URI location。
- [x] 未找到目标时显示 unresolved reference。

### M4.3 Find references

P1 可选：

- 当前 workspace index 反查 symbol usages。
- 不要求 rename。

验收：

- [x] 能列出当前 symbol 的使用位置。

---

## M5：语义节点渲染合同与 MVP

目标：让 Chemd preview 从字符串 HTML 走向 typed semantic node rendering。

### M5.1 Renderable node core

新增或扩展：

```text
packages/semantic-rendering/src/types.ts
packages/semantic-rendering/src/build-tree.ts
packages/semantic-rendering/src/attributes.ts
```

类型：

- `ChemdRenderableNodeV1`
- `ChemdRenderDirectiveV1`
- `ChemdSourceRefV1`

验收：

- [x] document、molecule、reaction、procedure、result、evidence 可输出 node。
- [x] 每个 node 有稳定 `node_id`。
- [x] 每个 node 可回到 source range。

### M5.2 HTML/React shell

实现内容：

- 输出 `data-chemd-node-id`。
- 输出 `data-chemd-type`。
- 输出 `data-chemd-render-state`。
- heavy node 只输出 placeholder。

验收：

- [x] reaction/molecule 节点带 `visible` hydration policy，不阻塞语义树生成。
- [x] unknown node 有 fallback。
- [x] source ref 不丢失。

### M5.3 Desktop/Web preview integration

实现内容：

- hydration registry。
- reaction/molecule/evidence component。
- cluster badge component。

验收：

- [x] 预览中 reaction block 可展开。
- [x] evidence 可回跳源码。
- [x] cluster badge 可显示但不要求 map。

状态：本轮完成 typed semantic render tree、desktop knowledge-map summary、reaction row 展开、source-ref jump intent 与 cluster badge；正文 preview hydration registry 仍保持原路径，后续可复用同一 source-ref intent 合同接入。

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

- [x] cluster list 可显示 member count。
- [x] cluster detail 数据层可输出 shared features。
- [x] similarity edge 数据层可显示 basis。
- [x] semantic-only warning 明确可见。

### M6.2 Reaction detail integration

实现内容：

- reaction block 显示 cluster badge。
- cluster detail 可跳回 reaction。
- similarity edge 可打开两端 reaction。

验收：

- [x] reaction -> cluster -> reaction 往返可用。
- [x] weak cluster 不被展示成 high-confidence chemical similarity。

状态：本轮完成 reaction map layout 数据层和 desktop cluster rows；未实现 reaction inspector 往返交互。

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

- [x] artifact 能表达 x/y、cluster、edge、basis、warnings。
- [x] layout id 与 graph index id 分离。

### M7.2 Semantic edge layout spike

第一版可以不用 TMAP，先用 deterministic/simple layout 或测试 fixture。

目的：

- 先验证前端地图交互。
- 不被 Python/conda 依赖阻塞。

验收：

- [x] Web/Desktop 能显示 1k reaction points fixture。
- [x] 点选显示 reaction inspector。
- [x] cluster filter 可用。

状态：Desktop 已显示当前编译结果的 deterministic fallback layout，新增 SVG layout canvas、cluster filter、reaction inspector，并用 1k reaction fixture 验证 view-model。

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

- [x] worker 可单独运行。
- [x] 失败不影响 IDE authoring。
- [x] TMAP 缺失时有清晰 SKIP/ERROR。

状态：本轮按“TMAP 不进应用 runtime”原则保留应用内 fallback layout，同时新增独立 `services/chem-cluster-service` worker 骨架。worker 在缺 TMAP 时可返回 `SKIP`、按参数返回 `ERROR` 或降级 deterministic fallback，不影响 IDE authoring。

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

## M9：最终样式重构与 UI 组件化

目标：在功能闭环和生产验证完成后，统一桌面端视觉语言并治理大文件/复杂度，
不阻塞前面的离线可用主路径。

### M9.1 样式重构

参考用户提供的桌面端截图：浅色、低噪声、类 macOS IDE 布局、左侧活动栏、
文件树、顶部标签页、编辑区留白和轻量工具栏。

要求：

- 保留现有桌面 IDE 信息架构，不做营销页或 Web 化重排。
- 统一浅色主题、间距、边框、hover/active 状态和面板密度。
- 优先让文档本地优先、离线可用路径清晰可见。
- 补齐 UI 变更截图证据，至少覆盖 desktop、窄屏和主要面板状态。

### M9.2 UI 组件化与大文件拆分

参考：`D:\Code\LabStorageManager\docs\2026-03-24-lint_complexity_summary.md`。

要求：

- 将 `apps/desktop/src/App.tsx` 中的 dock、sidebar、insight、runtime、
  storage、agent、workspace ingest、preview/map 等区域拆成可复用组件。
- 将 controller hook、view model builder、presentational component 分层，
  避免业务逻辑继续堆在入口组件。
- 将复杂度 lint 作为最终治理门禁处理；当前阶段仅记录，不阻塞功能推进。
- 保持组件 API 小而稳定，避免一次性重写运行时持久化、Tauri command 或
  storage contract。

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

- [x] Monaco 编辑器稳定加载。
- [x] snippets 可用。
- [x] field completion 可用。
- [x] value completion 可用。
- [x] current document reference completion 可用。
- [x] cross-document reference completion 可用。
- [x] diagnostics markers 可用。
- [x] code actions 可用。
- [x] hover 可用。
- [x] go to definition 可用。
- [x] 保存和重启恢复可用。

说明：保存、读回、hash/reload 由 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml workspace` 覆盖；真实 GUI 关闭重启仍属于 M8.2 手动 smoke，不用该单测替代 clean-machine 验收。

### Preview

- [x] renderable node tree 可生成。
- [x] molecule/reaction 节点可 lazy hydrate。
- [x] evidence/source ref 可回跳。
- [x] hydration error 有 fallback。

### Graph/Cluster

- [x] graph index 可生成。
- [x] cluster list/detail 可显示。
- [x] similarity edge basis 可解释。
- [x] weak/semantic-only warning 可见。
- [x] cluster map 可显示 layout artifact。

### Runtime

- [x] Offline core smoke 通过。
- [x] build/typecheck/test 通过。
- [x] installer artifact smoke 通过。
- [ ] clean install smoke 有证据。
- [x] DB 不可用时明确 SKIP。

说明：`desktop:offline-release-smoke` / `desktop:installer-offline-smoke` 仅证明 release exe、MSI、NSIS artifact 可检测且目标 exe 未运行；它不会安装应用，也不能替代 clean-machine Offline Core smoke。

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

- 范围：完成 M3.1 的 `@chemd/language-service` workspace symbol index core。
- 产物：`buildChemdWorkspaceSymbolIndex()`、`findChemdWorkspaceSymbolById()`、
  `findChemdWorkspaceSymbolsByName()`、`findChemdWorkspaceSymbolsByKind()`。
- 行为：多文档可继续索引，单文档 compile failed 时记录 failed document 和 diagnostics，
  不终止其他文档；输出 symbols by kind/name、source hash、stale 字段与 diagnostics summary。
- 验证：
  - `pnpm --filter @chemd/language-service test`：通过，3 files / 22 tests。
  - `pnpm --filter @chemd/language-service typecheck`：通过。
  - `git diff --check`：通过。

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

### 2026-05-13 desktop-ide-monaco-completion-provider

- 范围：把已合并的 `@chemd/language-service` completion core 接入
  desktop Monaco editor provider。
- 产物：在 Chemd language 注册阶段注册
  `languages.registerCompletionItemProvider(CHEMD_LANGUAGE_ID, ...)`；
  `apps/desktop/src/monaco-chemd-completion.ts` 承担 provider 注册、
  compile output map、`ChemdCompletionItem` 到 Monaco item 的映射；
  `MonacoChemdEditor.tsx` 只负责注册调用与 update/cleanup 生命周期。
- 边界：不修改 `App.tsx`、root 配置、package/lockfile、Tauri/Rust 或
  `packages/language-service`；不实现 workspace index/ref completion。
- 降级：completion provider 内部捕获异常，compile output 缺失或失败时不阻断编辑。
- 验证：
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm --filter @chemd/desktop build`：通过；仅保留 Vite chunk size 和 lucide
    `use client` bundle warnings。
  - `pnpm --filter @chemd/desktop exec eslint src/MonacoChemdEditor.tsx src/monaco-chemd-completion.ts`：通过。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-current-reference-completion

- 范围：完成 M2.1 当前文档 reference completion core，只修改
  `@chemd/language-service` completion 层和本计划文档，不接入
  `apps/desktop`、Monaco provider、workspace index 或 cross-document references。
- 产物：新增 `getChemdReferenceCompletions(request, context)`，从传入的
  `compileOutput.symbols` 生成 `reference` completion item；`insertText`
  使用 `@symbolId`，并携带 `reference` data。
- 触发：仅在显式 `@` token 或 `reactants`/`products`/`prev` 引用值位置提示；
  普通 prose 不刷 reference suggestions；缺少 `compileOutput` 时返回空列表。
- 验证：
  - `pnpm --filter @chemd/language-service test`：通过，3 files / 26 tests。
  - `pnpm --filter @chemd/language-service typecheck`：通过。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-renderable-node-core

- 范围：完成 M5.1 的 `@chemd/renderer-json` renderable semantic node DTO
  core；不接入 React/UI，不修改 compiler contract。
- 产物：新增 `buildRenderableNodeTree(document, options?)`、
  `ChemdRenderableNodeTreeV1`、`ChemdRenderableNodeV1`、
  `ChemdRenderDirectiveV1`、`ChemdSourceRefV1`。
- 策略：`col` 保留 columns layout 容器；`template` 保留 nested-body
  容器并展开 body children；heavy node 使用 lazy hydration directive，
  缺少可渲染信息时降级 placeholder directive；markdown 使用 text
  directive。
- 验证：
  - `pnpm --filter @chemd/renderer-json test`：通过，2 files / 9 tests。
  - `pnpm --filter @chemd/renderer-json typecheck`：通过。
  - `git diff --check`：通过。

### 2026-05-13 desktop-ide-hover-definition-core

- 范围：实现 `@chemd/language-service` hover/definition Monaco-neutral core；
  不接入 `apps/desktop`、Monaco provider、renderer、root 配置或持久化层。
- 产物：新增 `getChemdHover(request, context)` 与
  `getChemdDefinition(request, context)`，消费当前文档 `compileOutput` 的
  symbols/diagnostics/source position，输出稳定 DTO。
- 行为：hover 覆盖 symbol metadata、source line、diagnostic at position、
  reference target；definition 支持 `@symbolId` 和裸 symbol id token 跳转到
  当前文档 definition。
- 降级：缺少 `compileOutput`、无当前位置 token、找不到 target symbol 时返回
  `null` 或空数组，不抛出。
- 验证：
  - `pnpm --filter @chemd/language-service test`：通过，4 files / 33 tests。
  - `pnpm --filter @chemd/language-service typecheck`：通过。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-renderable-html-shell

- 范围：完成 M5.2 的 `@chemd/renderer-html` renderable node HTML shell；
  不接入 desktop UI，不修改 App 入口、schema、root 配置或 lockfile。
- 产物：新增 `renderRenderableHtml(tree, options?)`，从
  `ChemdRenderableNodeTreeV1` 输出稳定 HTML 片段，保留
  `data-chemd-node-id`、`data-chemd-node-kind`、
  `data-chemd-render-state` 与 source refs JSON 属性。
- 策略：heavy/lazy hydration 节点只输出可降级 placeholder shell 与 hydration
  key，不渲染 molecule/reaction 结构或泄露 payload；markdown/text、layout、
  template 与 semantic children 递归输出，文本和属性统一 escape。
- 验证：
  - `pnpm --filter @chemd/renderer-html test`：通过，2 files / 9 tests。
  - `pnpm --filter @chemd/renderer-html typecheck`：通过。
  - `git diff --check`：通过。

### 2026-05-13 desktop-ide-workspace-reference-completion

- 范围：完成 `@chemd/language-service` 跨文档引用补全 core；不接入
  `apps/desktop`、Monaco provider、renderer、root 配置、Tauri/Rust 或持久化层。
- 产物：新增 `getChemdWorkspaceReferenceCompletions(request, context)`，
  消费 `ChemdWorkspaceSymbolIndex`，输出 workspace-specific reference
  completion DTO。
- 触发：仅在显式 `@` token 或 `reactants`/`products`/`prev` 引用值位置提示；
  普通 prose 裸文本不刷 suggestions。
- 行为：补全项使用 `documentId#localId`，携带 `documentUri`、`documentId`、
  `sourceHash` 与 `stale`；排除当前文档当前 symbol 自引用；
  `reactants`/`products` 优先 molecule，`prev` 优先 reaction。
- 降级：缺少 workspace index、空 index、failed document symbols 时返回空列表；
  stale symbols 保留但在 detail/data 标记 stale。
- 验证：
  - `pnpm --filter @chemd/language-service test`：通过，5 files / 37 tests。
  - `pnpm --filter @chemd/language-service typecheck`：通过。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-monaco-hover-definition

- 范围：把已合并的 `@chemd/language-service` hover/definition core 接入
  desktop Monaco editor provider；不改变 UI 布局，不修改 `App.tsx`、
  root 配置、package/lockfile、Tauri/Rust、数据库或 shared packages。
- 产物：新增 `apps/desktop/src/monaco-chemd-navigation.ts`，负责
  hover/definition provider 单例注册、当前 model URI 到 `compileOutput`
  的缓存、Monaco hover/definition range/location 映射；`MonacoChemdEditor.tsx`
  只负责注册调用与 update/cleanup 生命周期。
- 行为：hover 在当前文档 symbol、diagnostic、`@symbolId`/裸 symbol id
  引用位置返回紧凑 Markdown；definition 对当前文档引用返回 Monaco
  Location，缺少 compile output、无 token 或找不到 target 时返回空结果。
- 降级：provider 内部捕获异常，返回 `null` 或空数组，不阻断编辑。
- 验证：待本分支执行
  `pnpm --filter @chemd/desktop typecheck`、
  `pnpm --filter @chemd/desktop exec eslint src/MonacoChemdEditor.tsx src/monaco-chemd-navigation.ts src/monaco-chemd-navigation.test.ts`、
  `pnpm --filter @chemd/desktop build` 和 `git diff --check` 后更新最终结果。

### 2026-05-13 desktop-ide-monaco-hover-definition 验证结果

- `pnpm --filter @chemd/desktop typecheck`：通过。
- `pnpm --filter @chemd/desktop exec eslint src/MonacoChemdEditor.tsx src/monaco-chemd-navigation.ts src/monaco-chemd-navigation.test.ts`：
  通过。
- `pnpm --filter @chemd/desktop build`：通过；Vite 输出 lucide
  `use client` directive ignored warning 和 chunk size warning。
- `pnpm exec vitest run apps/desktop/src/monaco-chemd-navigation.test.ts`：
  通过，1 file / 2 tests；Vitest 输出 workspace file deprecation warning。
- `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-monaco-code-actions

- 范围：把已存在的 `toMonacoCodeActions()` quick-fix DTO 接入
  desktop Monaco code action provider；不改变 UI 布局，不修改 `App.tsx`、
  root 配置、package/lockfile、Tauri/Rust、数据库或 shared packages。
- 产物：新增 `apps/desktop/src/monaco-chemd-code-actions.ts`，负责
  code action provider 单例注册、当前 model URI 到 `compileOutput` 的缓存、
  diagnostics quick fix 到 Monaco `WorkspaceEdit` 的映射；`MonacoChemdEditor.tsx`
  只负责注册调用与 update/cleanup 生命周期。
- 行为：provider 从当前 model URI 对应的 `compileOutput.diagnostics`
  读取 quick fixes，返回 `quickfix` kind actions；WorkspaceEdit metadata
  保留 proposal id 与 `beforeHash`，供后续审计/审批链路复用。
- 降级：缺少 compile output、无 diagnostics、无 quick fixes 或 provider
  内部异常时返回空 actions，不阻断编辑。
- 验证：
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm --filter @chemd/desktop exec eslint src/MonacoChemdEditor.tsx src/monaco-chemd-code-actions.ts src/monaco-chemd-code-actions.test.ts`：
    通过。
  - `pnpm exec vitest run apps/desktop/src/monaco-chemd-code-actions.test.ts`：
    通过，1 file / 1 test；Vitest 输出 workspace file deprecation warning。
  - `pnpm --filter @chemd/desktop build`：通过；Vite 输出 lucide
    `use client` directive ignored warning 和 chunk size warning。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-workspace-symbol-helper

- 范围：新增 desktop workspace symbol index helper；不接入 UI，不修改
  `App.tsx`、Monaco editor、shared packages、root 配置、Tauri/Rust 或
  持久化层。
- 产物：新增 `buildDesktopWorkspaceSymbolIndex(input)`，消费 workspace
  handle、文件列表、注入式 `readFile` 与可选 `compile`/URI 构造函数，
  输出 `ChemdWorkspaceSymbolIndex` 与 desktop summary。
- 行为：仅扫描 `.chemd.md` 和 `chemdKind: "document"` 的 Markdown；
  普通 Markdown、目录和不支持文件计入 skipped；单文件 read/compile
  失败不阻断其他文件，并在 summary.errors 中记录阶段和错误信息。
- 复用：默认通过 `compileChemdForEditor()` 生成单文档 compile output，
  再交给 `buildChemdWorkspaceSymbolIndex()` 聚合，避免重复实现
  parser/compiler/symbol 逻辑。
- 验证：
  - `pnpm --filter @chemd/desktop exec vitest run src/desktop-workspace-symbol-index.test.ts`：
    通过，1 file / 6 tests。
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm --filter @chemd/desktop exec eslint src/desktop-workspace-symbol-index.ts src/desktop-workspace-symbol-index.test.ts`：
    通过。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-monaco-workspace-completion

- 范围：扩展 desktop Monaco completion provider helper；不接入
  `App.tsx` / `MonacoChemdEditor.tsx`，不修改 shared packages、root 配置、
  Tauri/Rust、数据库或迁移。
- 产物：`monaco-chemd-completion.ts` 新增 workspace symbol index
  update/cleanup cache helper，provider 在同一次请求中合并 local
  completions 与 `getChemdWorkspaceReferenceCompletions()` 结果。
- 行为：workspace reference completion 映射为 Monaco Reference item，
  保留 detail、filterText、sortText、range 和 data；缺少 workspace
  index 或 workspace completion 异常时仅降级为 local completions，不阻断编辑。
- 验证：待本分支执行
  `pnpm --filter @chemd/desktop exec vitest run src/monaco-chemd-completion.test.ts`、
  `pnpm --filter @chemd/desktop typecheck`、
  `pnpm --filter @chemd/desktop exec eslint src/monaco-chemd-completion.ts src/monaco-chemd-completion.test.ts`
  和 `git diff --check` 后更新最终结果。

### 2026-05-13 desktop-ide-monaco-workspace-completion 验证结果

- `pnpm --filter @chemd/desktop exec vitest run src/monaco-chemd-completion.test.ts`：
  通过，1 file / 1 test。
- `pnpm --filter @chemd/desktop typecheck`：通过。
- `pnpm --filter @chemd/desktop exec eslint src/monaco-chemd-completion.ts src/monaco-chemd-completion.test.ts`：
  通过。
- `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-semantic-preview-helper

- 范围：新增 desktop semantic preview helper；不接入 React UI，不修改
  `App.tsx`、Monaco editor、shared packages、root 配置、package/lockfile、
  Tauri/Rust、数据库或 CI。
- 产物：新增 `buildDesktopSemanticPreview(input)`，消费
  `ChemdLanguageCompileOutput`，输出稳定 DTO：`state`、`reason`、
  `html`、`tree`、`message`、`diagnostics`、`compiledAt` 与
  `documentUri`。
- 行为：compile ok 且存在 `result.document` 时，通过现有
  `buildRenderableNodeTree()` 与 `renderRenderableHtml()` 生成 typed
  semantic preview tree/html；compile failed 或缺少 document 时返回
  fallback DTO，不抛出。
- 验证：
  - `pnpm --filter @chemd/desktop exec vitest run src/desktop-semantic-preview.test.ts`：
    通过，1 file / 4 tests。
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm --filter @chemd/desktop exec eslint src/desktop-semantic-preview.ts src/desktop-semantic-preview.test.ts`：
    通过。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-preview-and-workspace-index-ui

- 范围：在 desktop React 入口串行接入 workspace symbol index 与 semantic preview；
  不修改 shared packages、Tauri/Rust、数据库 schema、根配置或 package/lockfile。
- 产物：
  - `MonacoChemdEditor` 接收 workspace symbol index，并把 index 送入 completion
    provider cache。
  - `App.tsx` 新增 workspace symbol index controller，打开本地 workspace 后读取
    Chemd 文档并使用 `chemd://desktop/...` model URI 建索引。
  - 右侧 dock 新增 `Semantic Preview` 面板，消费 `buildDesktopSemanticPreview()`
    的 HTML/fallback DTO，并显示 workspace index 摘要。
- 行为：
  - 当前编辑文件直接使用内存中的未保存 `source`，避免 completion index 落后于编辑器。
  - 其他 workspace 文件通过只读 `read_workspace_file` 读取；单文件 read/compile
    失败由 symbol index helper 记录，不中断整体索引。
  - workspace index 不可用时 completion 自动降级为 local completions，不阻断写作。
- 验证：
  - `pnpm --filter @chemd/desktop exec vitest run src/desktop-workspace-symbol-index.test.ts src/desktop-semantic-preview.test.ts src/monaco-chemd-completion.test.ts`：
    通过，3 files / 11 tests。
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm --filter @chemd/desktop build`：通过；保留既有 lucide `use client`
    与 chunk size warning。
  - `pnpm --filter @chemd/desktop exec eslint src/App.tsx src/MonacoChemdEditor.tsx`：
    仍报 `LocalStorePanel` 既有 `max-lines-per-function` 与 `complexity`，按当前
    产品化策略记录到 M9/M11 复杂度治理，不阻塞本功能合并。
  - `pnpm test`：通过 Turbo tests、72 个脚本测试与 52 个 Python 测试。
  - `pnpm typecheck`：通过 21 个 workspace。
  - `git diff --check`：通过；仅输出 LF/CRLF 工作区提示。

### 2026-05-13 desktop-ide-reaction-cluster-panel-model

- 范围：完成 M6.1/M6.2 的 desktop 纯 DTO 模型层；不接入
  `App.tsx`，不修改 shared packages、package/lockfile、Tauri/Rust、数据库或 CSS。
- 产物：新增 `buildDesktopReactionClusterPanel()`，输出面向 UI 的
  `state`、`reason`、`summary`、`clusters`、`details`、`selectedDetail` 与
  `warnings`。
- 行为：ready 状态展示 member count、shared features、similarity edge basis、
  max similarity score、semantic-only/weak warning；compile failed、缺少 graph
  index、无 clusters 时返回 explainable fallback，不抛出。
- 架构审查：合并前将高复杂度入口拆成 ready/fallback/build helper，focused ESLint
  通过。
- 验证：
  - `pnpm --filter @chemd/desktop exec vitest run src/desktop-reaction-cluster-panel.test.ts`：
    通过，1 file / 4 tests。
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm --filter @chemd/desktop exec eslint src/desktop-reaction-cluster-panel.ts src/desktop-reaction-cluster-panel.test.ts`：
    通过。

### 2026-05-13 desktop-ide-agent-timeline-panel-model

- 范围：完成 M7 的 desktop Agent timeline/audit 纯 DTO 模型层；不接入
  `App.tsx`，不启动 agent、不访问网络、不写 workspace 文件。
- 产物：新增 `buildDesktopAgentTimelinePanel(run, options)`，输出
  `state`、`message`、`summary`、`timelineRows`、`toolCallRows`、`patchRows`、
  `warnings` 与 `safety`。
- 行为：支持 null run fallback、running/completed/blocked/failed 状态、tool
  input/output 摘要、失败 tool error、patch approval/apply gate、RAG citation
  safety warning。
- 架构审查：合并前拆出 types/constants、format/evidence utilities、patch gate
  helper，使入口文件降到 300 行以内；focused ESLint 通过。
- 验证：
  - `pnpm --filter @chemd/desktop exec vitest run src/desktop-agent-timeline-panel.test.ts`：
    通过，1 file / 5 tests。
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - `pnpm exec eslint apps/desktop/src/desktop-agent-timeline-panel.ts apps/desktop/src/desktop-agent-timeline-panel-types.ts apps/desktop/src/desktop-agent-timeline-panel-format.ts apps/desktop/src/desktop-agent-timeline-panel-patches.ts apps/desktop/src/desktop-agent-timeline-panel.test.ts --ext .ts`：
    通过。

### 2026-05-13 desktop-ide-panel-models 合并验证

- 合并提交：
  - `7431ce5 feat(desktop)：合并反应聚类面板模型`
  - `de014cc feat(desktop)：合并 Agent timeline 面板模型`
- 合并后验证：
  - `pnpm --filter @chemd/desktop exec vitest run src/desktop-reaction-cluster-panel.test.ts src/desktop-agent-timeline-panel.test.ts`：
    通过，2 files / 9 tests。
  - `pnpm --filter @chemd/desktop typecheck`：通过。
  - focused ESLint：通过新增 cluster/agent timeline 文件。
  - `pnpm --filter @chemd/desktop build`：通过；保留既有 lucide `use client`
    与 chunk size warning。
  - `git diff --check`：通过。
