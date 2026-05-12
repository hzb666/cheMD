# Desktop IDE 离线优先完全产品化实施文档

状态：实施计划
更新时间：2026-05-13
适用范围：`apps/desktop`、Tauri runtime、Monaco language service、local store、PostgreSQL/pgvector sync、Graph、RAG、Agent、`chem-service` sidecar、installer/release。

---

## 1. 产品化目标

Chemd Desktop IDE 的生产路径是 offline-first：本地文档优先，离线基本功能可用。

完全产品化不是“能启动一个桌面窗口”，而是满足以下条件：

1. 用户安装后不配置数据库、不联网，也能打开 workspace、编辑 `.chemd.md`、保存、编译、预览和查看 diagnostics。
2. 本地 `.chemd.md` 文件是 source of truth。PostgreSQL/pgvector 是派生知识库、同步层和团队共享层。
3. 本地 app data 只保存缓存、recent state、snapshot、outbox、索引和 UI 状态，不取代源文档。
4. PostgreSQL 不可用时，Graph/RAG/Agent 能力明确降级，但不阻断核心写作与实验记录。
5. 恢复 PostgreSQL 后，本地 outbox 可以安全、幂等地同步到 shared schema。
6. 桌面体验达到生产 IDE 水平：Monaco、diagnostics、preview、workspace、sidecar、日志、安装包、升级和诊断闭环完整。

一句话目标：

```text
Local documents first. Offline editing always works.
PostgreSQL enriches and synchronizes knowledge, but never gates basic authoring.
```

---

## 2. 产品模式

| 模式 | 触发条件 | 必须可用 | 明确降级 |
| --- | --- | --- | --- |
| Offline Core | 无网络、无 DB、无 sidecar | workspace、编辑、保存、compile、diagnostics、preview、本地 snapshot/outbox | PostgreSQL sync、pgvector RAG、团队 Graph、在线 Agent |
| Local Enhanced | 有 sidecar，无 DB | Offline Core、RDKit render、Ketcher 回写、OCR fallback | shared RAG、团队 memory、远端 sync |
| Connected Sync | 有外部 PostgreSQL 或 managed PostgreSQL | Offline Core、workspace ingest、outbox sync、Graph/RAG persistence、Agent audit | provider 不可用时降级对应能力 |
| Team Knowledge | 共享 PostgreSQL/pgvector 可用 | 跨文档 Graph、RAG search、Agent memory、审计记录 | 本地编辑仍不被远端状态阻塞 |

---

## 3. 架构原则

### 3.1 权威数据

- `.chemd.md` 是用户知识的权威来源。
- `compileChemd()` 是语义真相来源。
- 本地 snapshot/outbox 是派生结果和同步队列。
- PostgreSQL 是可重建的知识索引和审计库。

### 3.2 本地优先写入顺序

```text
User edit
  -> local document buffer
  -> save .chemd.md
  -> compileChemd()
  -> preview / diagnostics
  -> local snapshot + outbox
  -> optional PostgreSQL sync
```

PostgreSQL 写入失败不得回滚用户已保存的本地文档。

### 3.3 同步边界

- 同步 payload 必须由 compile result 派生。
- outbox entry 必须有 `idempotencyKey`、document hash、base revision、sync status 和错误摘要。
- 重试必须幂等；重复同步不能产生重复 graph、rag 或 agent records。
- 冲突处理以本地文件 hash 和 revision hash 为准，不用“最后写入 wins”静默覆盖。

---

## 4. 实施阶段

### M0：路线冻结与验收口径

目标：把生产定义从“DB-backed runtime proof”改为“offline-first production IDE”。

交付物：

- 本实施文档成为 Desktop IDE 产品化执行源。
- 更新 production gap review，把 P0 调整为离线核心能力。
- 明确 PostgreSQL 是 sync/enrichment，不是启动依赖。

验收：

- 文档中没有把外部 DB、managed DB 或 Agent 能力列为基础编辑 blocker。
- 每个后续 milestone 都有离线验收条件。

### M1：离线 workspace 与文件可靠性

目标：用户可以把 Desktop IDE 当作本地 Chemd 文档工作台使用。

交付物：

- workspace 打开、recent workspace、文件树、多标签、dirty state。
- 安全保存：临时文件写入、原子替换、失败回滚、保存错误提示。
- 文件监听：外部修改检测、冲突提示、reload/keep local 选择。
- 本地 settings：主题、recent state、panel layout，不保存敏感凭据。
- 离线启动 smoke：无 DB、无网络、无 sidecar 时 app 可启动并编辑保存。

验收：

- PostgreSQL env 全部缺失时，打开/保存 `.chemd.md` 不报错。
- 关闭再打开后，recent workspace 与最近文件恢复。
- 保存失败不会丢失 editor buffer。
- 外部文件变更不会被静默覆盖。

验证：

```sh
pnpm --filter @chemd/desktop typecheck
pnpm --filter @chemd/desktop exec eslint src/App.tsx src/desktop-*.ts
pnpm --filter @chemd/desktop build
```

### M2：Monaco Language Service

目标：把 textarea 替换为生产 IDE 编辑体验。

交付物：

- `packages/language-service` core，不依赖 React、FS、DB 或 sidecar。
- Monaco adapter：diagnostics underline、Problems panel、hover、outline、completion。
- compile worker：debounce、stale response discard、错误隔离。
- quick fix proposal：只生成 patch preview，用户确认后应用。
- source range 统一给 diagnostics、preview、Graph/RAG/Agent 使用。

验收：

- 所有 diagnostics 来自 compiler pipeline。
- 连续输入不会阻塞 UI。
- 点击 diagnostic 可跳转源码。
- completion 不伪造实验事实。
- quick fix 不静默改文件。

验证：

```sh
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/desktop typecheck
pnpm --filter @chemd/desktop build
```

### M3：离线编译、预览与本地运行时状态

目标：离线状态下也能形成完整的 authoring loop。

交付物：

- compile -> diagnostics -> preview 的本地闭环。
- 本地 `runtime-snapshot.json` 保存最近 compile 派生状态。
- 本地 `outbox.json` 保存待同步 Graph/RAG/Agent payload。
- UI 显示 local status：saved、compiled、snapshot saved、pending sync。
- 失败状态可见：compile failed、snapshot failed、sync pending、sync failed。

验收：

- 无 DB 时不显示“生产能力失败”，只显示知识同步降级。
- compile failed 时不生成 accepted revision。
- 本地 snapshot/outbox 不包含数据库密码、API key 或完整 env。
- 重新启动后能看到 pending outbox 状态。

验证：

```sh
pnpm test:scripts
pnpm desktop:runtime-smoke
```

无 DB 环境下期望输出：

```text
SKIP database persistence: ...
Chemd desktop local offline smoke passed.
```

### M4：本地 workspace ingest 与可恢复队列

目标：把单文档 authoring 扩展为本地 workspace 级知识准备。

交付物：

- workspace 批量扫描 `.chemd.md`。
- 对每个文档执行 compile，并生成本地 revision snapshot。
- 本地 ingest 队列记录 pending、running、synced、failed、skipped。
- 失败重试、取消、继续运行。
- 文档 hash、source range、compile result hash 和 outbox payload 一一对应。

验收：

- 大 workspace ingest 不阻塞编辑。
- 单个文件失败不终止整个 workspace ingest。
- outbox 可重复运行且幂等。
- 本地文档变更后，旧 pending payload 不会覆盖新 revision。

建议实现边界：

- 第一版可以继续使用 JSON local store。
- 当队列、索引和查询复杂度上升时，再升级为 SQLite 或 Tauri store。
- 无论实现介质如何，本地 store 都不是 source of truth。

### M5：PostgreSQL 同步与知识库增强

目标：在不破坏离线核心能力的前提下接入外部或 managed PostgreSQL。

交付物：

- connection profile UI：新增、测试、编辑、删除、选择 active profile。
- secret storage：凭据进系统安全存储，不写入普通配置或日志。
- migration status：schema ready、pgvector ready、version mismatch。
- outbox sync：幂等写入 shared schema，成功后标记 synced。
- sync conflict UI：base revision 不匹配时要求用户确认或重新生成 payload。
- 外部 DB 与 managed DB 都走同一 shared schema contract。

验收：

- DB 不可用时，基础编辑、编译和预览不受影响。
- DB 可用时，pending outbox 能同步到 shared schema。
- 日志只显示脱敏 host、port、database、user。
- SSL/TLS、VPN 或内网隔离策略在生产环境中明确。

验证：

```sh
pnpm test:scripts
pnpm desktop:runtime-smoke
```

外部 DB 环境下期望输出：

```text
Chemd desktop runtime smoke passed.
reconnect outbox sync: synced=1, pending=0, failed=0
```

### M6：Graph/RAG 产品化

目标：把“数据可写入”升级为“用户可用的知识能力”。

交付物：

- Graph panel：reaction node、edge、family、condition、evidence。
- Graph diff：当前 revision 与历史 snapshot 对比。
- Source jump：node、edge、citation 都能跳回源码。
- RAG search：自然语言查询、reaction-aware filter、citation gate。
- embedding pipeline：provider 配置、backfill、失败重试、任务状态。
- 无 citation 的 RAG 结果不得进入 Agent context。

验收：

- Graph/RAG 只消费 compiler/exporter output，不重新解析 source。
- 每条 edge 有 evidence。
- 每条 search result 有 citation。
- embedding provider 失败时 UI 显示任务状态，不影响编辑。

### M7：Agent 编排产品化

目标：Agent 成为受控工作流，不成为隐式写文件的风险源。

交付物：

- Agent timeline：每一步 tool call、input 摘要、output 摘要、耗时、错误。
- Tool contracts：compile、query RAG、inspect graph、semantic diff、propose repair。
- Patch proposal：diff preview、用户确认、`beforeHash` 校验、apply 后重新 compile。
- Audit persistence：离线先写本地 outbox，在线同步到 PostgreSQL。
- Safety gate：compile failed 时阻止 accepted revision。

验收：

- Agent 不能直接写 workspace 文件。
- 用户确认前不会应用 patch。
- patch apply 后必须重新 compile。
- 每个 Agent run 可审计、可重放关键上下文。

### M8：`chem-service` 与结构工作流

目标：把 RDKit、Ketcher、OCR 从 demo 能力补成可靠桌面能力。

交付物：

- Tauri sidecar lifecycle：启动、停止、重启、health、日志。
- Ketcher 编辑 molecule/reaction 后回写 Chemd block。
- RDKit render fallback：sidecar 不可用时展示明确降级。
- OCR import：文件选择、粘贴、provider 状态、失败恢复。
- diagnostics bundle 包含 sidecar log 摘要。

验收：

- sidecar 崩溃后 app 可继续编辑。
- UI 不持有 sidecar access key。
- OCR provider 不可用时不阻塞手写结构。
- Ketcher 回写后触发重新 compile。

### M9：安装包、升级与支持闭环

目标：达到真实用户可安装、可升级、可诊断的发布质量。

交付物：

- Windows installer smoke：安装、启动、打开 workspace、编辑保存、重启恢复。
- code signing 与 auto updater 策略。
- crash log、app log、sidecar log、diagnostics bundle。
- 大 workspace、无 DB、无 sidecar、DB 断线、provider 失败的降级测试。
- 用户文档：首次启动、离线工作、连接 PostgreSQL、同步失败处理。

验收：

- release build 不依赖 Next server。
- 安装产物可在干净机器上完成 Offline Core。
- 升级不丢失 recent workspace、settings、local outbox。
- 支持人员可以通过 diagnostics bundle 判断问题层级。

验证：

```sh
pnpm typecheck
pnpm test
pnpm --filter @chemd/desktop tauri:build
```

---

## 5. 产品化完成定义

### P0：离线基本功能生产可用

- [ ] 无 DB、无网络、无 sidecar 时，桌面 app 可启动。
- [ ] 可打开 workspace、编辑 `.chemd.md`、保存、关闭、重启并恢复。
- [ ] Monaco diagnostics、preview 与 Problems panel 可离线使用。
- [ ] 本地 snapshot/outbox 可生成，pending sync 状态可见。
- [ ] PostgreSQL 不可用只降级知识同步，不阻塞编辑。

### P1：本地知识队列生产可用

- [ ] workspace ingest 可本地运行并生成 outbox。
- [ ] outbox 支持 pending、synced、failed、retry。
- [ ] 本地队列幂等，不重复生成知识记录。
- [ ] 文件变更和 base revision 冲突有显式处理。

### P2：PostgreSQL 同步生产可用

- [ ] connection profile UI 可用。
- [ ] 凭据使用系统 secret storage。
- [ ] migration、pgvector、schema version 状态可见。
- [ ] 外部 DB 与 managed DB 使用同一 shared schema。
- [ ] sync 成功、失败、冲突都有 UI 和日志。

### P3：Graph/RAG/Agent 产品化

- [ ] Graph panel 可解释 edge evidence 并跳源码。
- [ ] RAG search 有 citation gate。
- [ ] Agent run 可审计，patch 需用户确认。
- [ ] 所有增强能力离线/失败时可降级。

### P4：发布质量生产可用

- [ ] installer、签名、升级策略明确。
- [ ] release smoke 覆盖干净机器 Offline Core。
- [ ] diagnostics bundle 覆盖 app、sidecar、sync、provider。
- [ ] 用户文档覆盖离线工作、连接 DB、同步失败恢复。

---

## 6. 建议执行顺序

| 顺序 | 工作包 | 原因 |
| --- | --- | --- |
| 1 | M1 离线 workspace 与文件可靠性 | 这是本地优先的地基。 |
| 2 | M2 Monaco Language Service | 生产 IDE 体验不能停留在 textarea。 |
| 3 | M3 离线编译、预览与本地状态 | 形成离线 authoring loop。 |
| 4 | M4 本地 workspace ingest | 让知识派生先在本地可靠运行。 |
| 5 | M5 PostgreSQL 同步 | 在本地可靠基础上补同步，而不是反过来。 |
| 6 | M6 Graph/RAG 产品化 | 先有可靠数据，再做知识体验。 |
| 7 | M7 Agent 编排 | Agent 必须建立在 Graph/RAG 与 patch gate 上。 |
| 8 | M8 sidecar 结构工作流 | 补齐化学结构能力。 |
| 9 | M9 发布与支持 | 最后封装为可交付产品。 |

---

## 7. 需要继续讨论的决策

1. Offline Core 的首个生产版本是否必须包含 Monaco，还是允许 textarea 只作为内部 alpha？
2. 本地 store 第一版继续使用 JSON，还是直接升级 SQLite/Tauri store？
3. bundled managed PostgreSQL 是否进入正式产品，还是只支持外部 DB sync？
4. Graph/RAG 在完全离线时是否需要本地向量索引，还是第一版仅在 PostgreSQL 可用时启用？
5. Agent 第一版是否只读，还是允许 patch proposal？
6. release MVP 是否先只支持 Windows，还是同步规划 macOS/Linux？
