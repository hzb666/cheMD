# Chemd Desktop IDE 生产化计划

状态：架构计划草案
更新时间：2026-05-12
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
