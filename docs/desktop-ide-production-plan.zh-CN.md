# Chemd Desktop IDE 生产化计划

状态：架构计划，离线优先实施以 `docs/desktop-ide/offline-first-productization-implementation.zh-CN.md` 为当前执行源
更新时间：2026-05-13
适用范围：`apps/desktop`、桌面运行时、语言服务、Graph、RAG、Agent 编排、PostgreSQL 持久化、`chem-service` sidecar

---

## 1. 目标

Chemd Desktop IDE 是 Chemd 的生产级本地工作台。它不是 Web playground 的桌面包装，也不是通用 IDE，而是面向化学实验记录的专业 IDE。

目标能力：

1. 打开本地 Chemd workspace，并管理 `.chemd.md` 文档。
2. 提供 Monaco 级源码编辑、诊断、补全、hover、quick fix 和 outline。
3. 实时编译 Chemd source，并展示 HTML preview、JSON、LNF、RAG、training understanding 和 diagnostics。
4. 通过受控 sidecar 调用 RDKit、OCR provider 和 Ketcher 结构编辑能力。
5. 以 PostgreSQL/pgvector 存储 document revisions、reaction graph、RAG chunks、memory 和 agent run records。
6. 提供反应 Graph、RAG 检索和 Agent 编排，并保证所有结果可追溯到 source location。
7. 保持桌面 UI 与现有 Web Playground 视觉语言一致。

---

## 2. 非目标

本计划不包含：

- 将当前 `apps/web` 的 Next.js runtime 原样嵌入 Tauri。
- 使用 Rust 重写 `@chemd/compiler`、parser、resolver 或 exporter。
- 使用 Rust 重写 Python/RDKit/OCR provider。
- 在第一阶段实现通用 IDE、完整 Git 客户端或完整 ELN 项目管理系统。
- 让 Agent 静默修改文件或绕过 diagnostics gate。
- 用 SQLite 替代 PostgreSQL 作为知识主库。

---

## 3. 目标技术栈

| 层级 | 技术 | 责任 |
| --- | --- | --- |
| Desktop host | Tauri 2、Rust | 窗口、文件系统、权限、sidecar、菜单、发布 |
| Desktop UI | Vite、React 19、Tailwind CSS 4、Radix、lucide | IDE shell、panels、dialogs、theme |
| Editor | Monaco Editor | 编辑器、语言服务桥接、code actions |
| Language core | `@chemd/compiler` 与 `packages/*` | parse、resolve、typecheck、render、export |
| Background compile | Web Worker | 编译隔离、防抖、取消、缓存 |
| Chemistry runtime | `services/chem-service` | RDKit、OCR、render、structure cache |
| Durable storage | PostgreSQL、pgvector | revisions、graph、RAG、memory、agent audit |
| Optional local cache | SQLite 或 Tauri store | recent files、UI state、非权威缓存 |
| Agent orchestration | 受控 tool runner | compile、graph、rag、diff、repair、patch proposal |

---

## 4. 总体架构

```text
Chemd Desktop IDE
  -> React / Monaco UI
     -> Language Worker
        -> @chemd/compiler
     -> Tauri commands
        -> workspace filesystem
        -> sidecar process manager
        -> PostgreSQL runtime services
     -> chem-service sidecar
        -> RDKit / OCR / structure render
     -> Agent Orchestrator
        -> compile / graph / rag / repair / diff tools
     -> PostgreSQL / pgvector
        -> revisions / graph / rag / memory / audit
```

核心约束：

- `compileChemd()` 是语言真相来源。
- Graph、RAG、Agent 必须消费编译产物，不允许重新实现 Chemd parser。
- `@chemd/storage-postgres` 继续作为纯 contract package，不直接打开数据库连接。
- Tauri commands 负责本地能力，但不承接语言语义。
- `chem-service` 是受控 sidecar，不暴露为公共服务。

---

## 5. 阶段计划

### Phase 0：架构冻结

周期：1 周

产物：

- `docs/desktop-runtime-boundaries.zh-CN.md`
- `docs/desktop-language-service-contract.zh-CN.md`
- `docs/postgres-graph-rag-schema.zh-CN.md`
- `docs/agent-tool-contract.zh-CN.md`
- `docs/desktop-ui-style-guide.zh-CN.md`

验收：

- 所有运行时边界有明确 owner。
- Next API routes 的职责迁移方向明确。
- Graph/RAG/Agent 的输入统一到 `compileChemd()` 产物。
- PostgreSQL 与可选本地缓存边界明确。

### Phase 1：Desktop shell 与 workspace

周期：2 周

任务：

- 新建 `apps/desktop`。
- 接入 Tauri 2、Vite、React、Tailwind、Radix。
- 实现 workspace 打开、文件树、recent workspace、多标签、保存和 dirty state。
- 实现 Tauri sidecar process manager 的最小版本。
- 实现 app log、sidecar health 和基础 settings。

验收：

- 不依赖 Next server。
- 生产 build 可启动。
- 文件访问限定在用户选择的 workspace。
- Windows installer 可生成。

### Phase 2：Monaco 与 Chemd Language Service

周期：3 周

任务：

- 新增 `packages/language-service`。
- 封装 diagnostics、completion、hover、outline、source range mapping 和 quick fix proposal。
- 使用 Web Worker 执行 `compileChemd()`。
- 实现 Monaco diagnostics underline、problem panel、hover、completion 和 quick fix preview。

验收：

- Monaco diagnostics 与 compiler diagnostics 一致。
- 点击 diagnostics 能跳到源码位置。
- quick fix 默认只预览 patch。
- 连续输入不阻塞 UI。

### Phase 3：Preview、Ketcher 与 chem-service sidecar

周期：2 到 3 周

任务：

- 迁移 Web preview 风格与 preview hydration 逻辑。
- 接入 Ketcher molecule/reaction 编辑。
- 通过 Tauri 管理 `chem-service` 启停、日志和 health。
- 支持 RDKit molecule/reaction render、OCR 图片导入、OCR 粘贴和 fallback 状态。

验收：

- `chem-service` 由桌面应用启动和回收。
- sidecar 只接受 loopback/internal 调用。
- Ketcher 保存后回写 Chemd block，并自动重新编译。
- RDKit/OCR 不可用时 UI 明确降级。

### Phase 4：PostgreSQL 持久化与 workspace ingest

周期：2 周

任务：

- 实现 connection profile。
- 实现 workspace ingest。
- 写入 document revisions、compiled artifacts、RAG chunks、training understanding、semantic diffs。
- 建立 migration smoke 和连接健康检查。

验收：

- workspace 可批量 ingest。
- 每个 revision 可追溯到 source file、hash、document id 和 compile result。
- 数据库不可用时基础编辑仍可用，知识能力明确降级。

### Phase 5：Reaction Graph

周期：2 到 3 周

任务：

- 基于 `trainingUnderstanding` 和 graph index 构建 reaction graph。
- 支持 route、prev/next、family、condition signature、campaign trajectory、semantic similarity 和 evidence links。
- 实现 Graph panel、edge evidence panel、graph snapshot 和 graph diff。

验收：

- Graph 不重新解析 source。
- 每条 edge 都有来源字段和 evidence。
- node/edge 可跳转到源码位置。
- graph snapshot 可持久化到 PostgreSQL。

### Phase 6：RAG 搜索

周期：2 周

任务：

- 从 `ragExport` 和 `trainingUnderstanding` 派生 chunks。
- 写入 pgvector embedding。
- 支持 natural language search、reaction-aware filter、yield/condition/family/failure filters。
- 检索结果强制带 citation。

验收：

- 检索结果可跳转源码。
- 无 citation 的结果不得进入 Agent 上下文。
- embedding provider 失败时任务状态可追踪。

### Phase 7：Agent 编排

周期：3 周

任务：

- 实现 Agent run model、tool contracts、timeline 和 audit records。
- 工具覆盖 compile、validate workspace、query RAG、inspect graph、semantic diff、propose repair、patch preview。
- 所有文件修改必须经过 patch proposal 和用户确认。

验收：

- Agent 每一步可审计。
- Agent 不能直接写文件。
- patch apply 后必须重新 compile。
- compile failed 时阻止持久化为 accepted revision。

### Phase 8：生产发布与质量门禁

周期：2 周

任务：

- installer、code signing、auto updater。
- crash log、diagnostics bundle、sidecar log viewer。
- no database、no RDKit、no network provider、large workspace 等降级测试。

验收：

- 桌面 app 可安装、启动、更新。
- sidecar 异常可恢复。
- 关键工作流有集成测试或 replay 测试。

---

## 6. 技能学习路线

| 优先级 | 技能 | 学习目标 | 验收产物 |
| --- | --- | --- | --- |
| 1 | Tauri 2 + Rust commands | 权限、commands、sidecar、bundler、updater | 最小 desktop app 可打开 workspace 并启动 sidecar |
| 2 | Monaco Language Service | diagnostics、completion、hover、code action、worker | Chemd diagnostics underline 和 quick fix preview |
| 3 | Web Worker 编译架构 | 防抖、取消、缓存、大文件降级 | 连续输入不卡 UI |
| 4 | PostgreSQL + pgvector | schema、migration、embedding search、citation | workspace ingest 后可做 citation search |
| 5 | Graph 可视化 | layout、cluster、edge evidence、large graph 性能 | reaction graph 可交互并跳源码 |
| 6 | Agent orchestration | tool contracts、patch proposal、approval gate、audit replay | Agent 可查 RAG/Graph 并提出 patch |
| 7 | Python sidecar packaging | RDKit 环境、Poetry、健康检查、日志、清理 | Tauri 启停 chem-service 并处理异常 |
| 8 | Desktop release security | signing、updater、secret storage、least privilege | 可安装、可更新、密钥不落普通配置 |

---

## 7. 关键风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 直接复用 Next API routes | 运行时复杂、打包不稳定 | 新建 `apps/desktop`，把 route 逻辑拆成 shared service 或 Tauri command |
| Graph/RAG/Agent 各自解析 source | 语义不一致 | 强制消费 `compileChemd()` 产物 |
| Agent 静默改文件 | 数据损坏、不可审计 | patch proposal + 用户确认 + compile gate |
| sidecar 打包复杂 | 安装和升级不稳定 | Phase 1 先验证 sidecar lifecycle |
| PostgreSQL 不可用 | 知识功能不可用 | 基础编辑离线可用，知识功能明确降级 |
| UI 与 Web 风格分裂 | 产品割裂 | 建立 `desktop-ui-style-guide` 并复用 Web tokens |

---

## 8. 第一批实施入口

推荐的第一批 PR：

1. 新建 `apps/desktop` skeleton，仅包含 shell、theme、layout 和 Tauri command smoke。
2. 新建 `packages/language-service`，先包装 compile diagnostics 与 source range。
3. 新建 PostgreSQL graph/RAG contract 草案，不立刻迁移现有 storage package。
4. 新建 Agent tool contract 类型草案，不接 LLM，不写文件。

第一批不要实现 Graph UI、RAG UI 或 Agent UI。先把运行时边界和语言服务骨架打稳。

---

## 9. 当前实施记录

### 2026-05-12 第十轮：local outbox 重连同步

目标：在离线本地优先能力之上，实现 local outbox 到共享
PostgreSQL Graph/RAG/Agent schema 的重连同步，不新增 desktop-only
PostgreSQL 表，并在 UI、契约、smoke 与文档中保持同步语义一致。

已合并范围：

- Rust/Tauri runtime：新增 `sync_local_outbox_to_postgres` command，
  读取 pending local outbox entry，复用既有
  `persist_runtime_graph_rag` 共享持久化路径，成功后标记 `synced`，
  失败后保留 payload、递增 failure count 并记录脱敏错误。
- TypeScript contract：补齐 `LocalOutboxSyncResult`、
  `LocalOutboxSyncEntryResult`、同步目标类型与
  `localStoreCommandNames.syncOutbox`。
- Desktop UI：Offline Local Store 面板新增 `Sync Pending` 入口，
  仅在 Postgres 已配置、状态 ready、pgvector 与 schema 就绪且存在
  pending outbox 时可执行，并展示 synced、failed、skipped 与目标摘要。
- Runtime smoke：`desktop:runtime-smoke` 增加脚本级
  local outbox -> shared PostgreSQL 同步 smoke；无外部 DB 且缺 managed
  PostgreSQL binaries 时仍显式 `SKIP database persistence`，随后验证本地
  JSON snapshot/outbox contract。
- 文档：更新 `docs/desktop-ide/offline-local-store.zh-CN.md` 与
  `docs/desktop-ide/managed-postgres-smoke.zh-CN.md`，明确脚本级 smoke
  与 Tauri command 真实 runtime proof 的边界。

合并提交：

- `1e2327a`：规划第十轮 outbox 重连同步。
- `9bdddf7`：合入本地 outbox 重连同步运行时。
- `6c9d684`：合入本地 outbox 同步契约。
- `66a918e`：记录第十轮底层同步合并。
- `3812138`：合入 outbox 重连同步 smoke。
- `3059a57`：合入本地 outbox 同步入口。

验证结果：

- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`：通过
  43 个 Rust 测试。
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`：通过。
- `pnpm --filter @chemd/desktop typecheck`：通过。
- `pnpm exec vitest run apps/desktop/src/desktop-local-store.test.ts --config packages/compiler/vitest.config.ts --pool=threads`：
  通过 7 个测试。
- `pnpm --filter @chemd/desktop exec eslint src/App.tsx src/desktop-contracts.ts src/desktop-local-store.ts src/desktop-local-store.test.ts src/styles/base.css src/styles/panels.css`：
  通过；仅保留既有 CSS ignore warning。
- `pnpm --filter @chemd/desktop build`：通过；仅保留既有
  lucide `use client` 与 chunk size warning。
- `pnpm test:scripts`：通过 39 个脚本测试。
- `pnpm desktop:runtime-smoke`：通过离线本地 snapshot/outbox 验证；
  数据库持久化因本机缺少 `initdb`、`psql`、`postgres` 或 `pg_ctl`
  被显式标记为 `SKIP database persistence`。
- `pnpm typecheck`：通过 21 个 workspace。
- `pnpm test`：通过 Turbo 测试、39 个脚本测试与 52 个 Python 测试。
- `pnpm --filter @chemd/desktop tauri:build`：通过，产出 release exe、
  MSI 与 NSIS installer。
- `git diff --check`：通过。

剩余生产验证缺口：

- 本机当前没有外部 PostgreSQL 配置，也没有可用 managed PostgreSQL
  二进制，因此尚未在真实桌面 runtime 中证明
  `sync_local_outbox_to_postgres` 能把 pending outbox 同步到真实数据库。
  这属于环境阻塞，不是代码测试失败。
- 下一轮应补齐可分发/可下载的 PostgreSQL runtime 来源，或提供受控外部
  PostgreSQL 验证环境，再执行 Tauri command 级端到端同步 proof。

### 2026-05-12 第十一轮：runtime proof 与分发证明

目标：把第十轮剩余的“真实 runtime proof”缺口拆成两个可执行面：
PostgreSQL 分发/staging provenance，以及 Tauri command-level smoke harness。
这一轮仍不提交 PostgreSQL 二进制，也不新增 desktop-only 数据库表。

已合并范围：

- PostgreSQL staging：`desktop:postgres:bundle` 成功后写入
  `chemd-postgres-bundle-manifest.json`，记录 source、target、platform、
  required binaries、bin-only/full distribution 模式与 verification summary。
- 生产校验：新增 `--require-full`，用于拒绝 bin-only 开发来源或缺失完整
  distribution manifest 的 staged 结果。
- Runtime 文档：新增 `postgres-runtime-distribution.zh-CN.md`，明确外部
  PostgreSQL、installer bundled managed PostgreSQL、无 DB offline outbox 三类
  runtime 路径及其取舍。
- Command-level smoke：`desktop:runtime-smoke` 现在区分 script-level
  reconnect proof、Tauri command smoke、offline local-only smoke。没有
  `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER` 时明确 SKIP，不把 command proof
  伪装成通过。
- Tauri command runner：支持通过 runner 依次调用
  `initialize_managed_postgres`、`start_managed_postgres`、
  `migrate_managed_postgres`、`read_postgres_status`、
  `save_local_runtime_snapshot`、`list_local_outbox`、
  `sync_local_outbox_to_postgres`，并验证 outbox 从 `pending` 变为 `synced`。
  runner 子进程会继承 smoke env，避免 managed PostgreSQL 临时连接信息丢失。

合并提交：

- `79ee4b0`：规划第十一轮 runtime proof。
- `0a21ce6`：合入 PostgreSQL 分发证明。
- `74edabf`：合入 Tauri command smoke。
- `cf1ff3a`：降低 runtime smoke 复杂度并清除脚本 lint 阻塞。

已运行验证：

- `node --test scripts/desktop-runtime-smoke.test.mjs scripts/desktop-postgres-bundle.test.mjs`：
  通过 31 个测试。
- `pnpm exec eslint scripts/desktop-runtime-smoke.mjs scripts/desktop-runtime-smoke.test.mjs scripts/desktop-postgres-bundle.mjs scripts/desktop-postgres-bundle.test.mjs`：
  通过。
- `pnpm test:scripts`：通过 47 个脚本测试。
- `pnpm desktop:runtime-smoke`：通过离线本地 snapshot/outbox 验证；
  数据库持久化仍因本机缺少 PostgreSQL runtime 被显式 SKIP。
- `pnpm typecheck`：通过 21 个 workspace。
- `pnpm test`：通过 Turbo 测试、47 个脚本测试与 52 个 Python 测试。
- `pnpm --filter @chemd/desktop tauri:build`：通过，产出 release exe、
  MSI 与 NSIS installer。
- `git diff --check`：通过。

仍需真实环境证明：

- 当前机器没有外部 `CHEMD_POSTGRES_DATABASE_URL` / `DATABASE_URL`，也没有
  staged/managed PostgreSQL binaries，因此还不能在本机证明 shared schema
  数据库写入。
- 当前没有配置真实 `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER`，所以
  command-level smoke harness 已有可注入测试与 SKIP 分类，但尚未完成真实
  app/driver proof。

### 2026-05-12 第十二轮：外部 PostgreSQL JDBC runtime proof 与缺口对齐

目标：用真实远端 PostgreSQL/pgvector 环境补齐第十一轮的 script-level
shared schema 写入证明，并把距离生产 Desktop IDE 的剩余缺口按优先级重新
对齐。该轮仍不提交数据库凭据，也不把开发验证账号视为生产配置。

已完成/已验证：

- Tauri/Rust runtime 与 Node smoke 脚本均支持 JDBC 风格 PostgreSQL URL，
  并在连接前归一化为标准 PostgreSQL URL。
- 远端 PostgreSQL 目标 `103.24.219.156:5632/postgres` 网络端口可达，
  `desktop:runtime-smoke` 在外部 DB 路径完成 shared schema 初始化、pgvector
  检查、runtime Graph/RAG/Agent/Patch 持久化与读回验证。
- script-level reconnect sync 已证明 local outbox payload 可以写入 shared
  PostgreSQL schema，并把本地 outbox entry 从 `pending` 标记为 `synced`。
- 相关 JDBC URL 归一化、脚本 smoke 与 reconnect sync 测试已补齐。

验证结果：

- `Test-NetConnection 103.24.219.156 -Port 5632`：`TcpTestSucceeded: True`。
- `node scripts\desktop-runtime-smoke.mjs`，环境变量使用
  `CHEMD_POSTGRES_DATABASE_URL=jdbc:postgresql://103.24.219.156:5632/postgres?user=<redacted>&password=<redacted>`、
  `CHEMD_POSTGRES_SSL=false`、`CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS=10000`：
  通过。输出包含 `Chemd desktop runtime smoke passed.`、
  `rag chunks: 3`、`runtime graph: rev-desktop-reconnect-runtime-smoke::graph`、
  `reconnect outbox sync: synced=1, pending=0, failed=0`。
- runtime verification 读回计数均为 1：
  `experiments`、`revisions`、`ragChunks`、`graphSnapshots`、`graphNodes`、
  `graphEdges`、`citations`、`agentRuns`、`agentToolCalls`、
  `patchProposals`。
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml postgres_tests::jdbc_postgres_urls_are_normalized_before_runtime_use`：
  通过。
- `pnpm run test:scripts`：通过。

仍未完成/未验证：

- Tauri command-level proof 仍缺少真实 `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER`，
  因此本轮通过的是脚本级 runtime proof，不是完整桌面 app command proof。
- 当前远端 DB 不支持 SSL；本轮以 `CHEMD_POSTGRES_SSL=false` 完成验证。这可
  作为开发/内网验证路径，但生产需要 TLS、VPN/内网隔离或等价安全边界。
- 当前验证账号属于开发验证配置，不满足 least privilege、凭据轮换、桌面
  secret storage 与审计要求。
- installer bundled managed PostgreSQL 仍未 staged 完整分发包，也未完成
  release installer 层面的离线 managed DB proof。
- Desktop UI 仍使用 textarea editor；Monaco、真实 language-service adapter、
  hover/completion/quick fix preview 尚未落地。
- workspace 批量 ingest、connection profile UI、Graph/RAG/Agent 产品面板、
  Ketcher/RDKit/OCR 端到端桌面工作流仍未达到生产 IDE 验收。

阶段完成度快照：

| 阶段 | 当前判断 | 主要依据 |
| --- | --- | --- |
| Phase 0 架构冻结 | 接近完成 | 关键边界文档已存在，但 production MVP cut line 仍需决策 |
| Phase 1 Desktop shell/workspace | 部分完成 | Tauri shell、workspace、installer 基础存在，release smoke 仍不足 |
| Phase 2 Monaco/Language Service | 未完成 | 设计文档已定义，当前实现仍是 textarea |
| Phase 3 Preview/Ketcher/sidecar | 部分完成 | sidecar/preview 有基础，Ketcher/RDKit/OCR 生产链路仍待验证 |
| Phase 4 PostgreSQL 持久化 | 部分完成且外部 DB 已脚本验证 | shared schema/runtime smoke 通过，Tauri command 与安全未完成 |
| Phase 5 Reaction Graph | 原型/持久化层部分完成 | graph records 可写入，产品面板与 evidence 交互未完成 |
| Phase 6 RAG 搜索 | 原型/持久化层部分完成 | chunks/citations 可写入，embedding/search/backfill 未完成 |
| Phase 7 Agent 编排 | 原型/审计层部分完成 | agent records/patch proposal 可写入，真实 tool orchestration 未完成 |
| Phase 8 发布质量 | 未完成 | installer 可构建的历史证明存在，但 signing/updater/release smoke 未完成 |

讨论入口：

- 详细缺口清单见
  [`desktop-ide/production-gap-review.zh-CN.md`](./desktop-ide/production-gap-review.zh-CN.md)。
- 完全产品化实施路线见
  [`desktop-ide/offline-first-productization-implementation.zh-CN.md`](./desktop-ide/offline-first-productization-implementation.zh-CN.md)。
