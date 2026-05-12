# Desktop IDE 离线优先完全产品化实施文档

状态：实施中，第二轮离线优先产品化已集成
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
pnpm desktop:offline-core-smoke
pnpm test:scripts
pnpm desktop:runtime-smoke
```

无 DB 环境下期望输出：

```text
SKIP database persistence: ...
Chemd desktop offline core smoke passed.
```

`desktop:offline-core-smoke` 是 M1/M3 的 P0 离线核心验收入口。它刻意禁用
外部 DB env 与 managed PostgreSQL env，只证明本地 snapshot/outbox 可以在无
DB、无 managed binaries、无 sidecar 的条件下写入并形成 pending outbox；它
不等同于 PostgreSQL shared schema 持久化通过。

### 2026-05-13 第一轮执行记录：P0/M1/M2/M3 基础闭环

已合并范围：

- Workspace 文件可靠性：
  - `read_workspace_file` / `write_workspace_file` 返回 `contentHash` 与
    `modifiedAtMs`。
  - `write_workspace_file` 支持可选 `baseHash`，保存前发现外部修改或删除时
    返回 `workspace_file_conflict`，不覆盖本地文件。
  - 写入改为同目录临时文件、flush、replace commit。
- Language Service core：
  - 新增 compile worker request/response contract。
  - 支持 stale compile response 与结构化 compile error response。
  - Monaco adapter 新增聚合 model，输出 markers、code actions、outline 与
    symbols。
- Local authoring status contract：
  - 新增 `deriveLocalAuthoringStatus`，将 saved、compiled、snapshot saved、
    pending sync、sync failed 派生为 UI 可消费状态。
  - outbox display summary 支持 pending、synced、failed、skipped 计数、重试
    eligibility 与脱敏错误摘要。
- Offline Core smoke：
  - 新增 `pnpm desktop:offline-core-smoke`，独立验证无 DB、无 managed
    binaries、无 sidecar 时的本地 snapshot/outbox P0 路径。
  - `desktop:runtime-smoke` 的无 DB 分支现在明确区分 database persistence
    `SKIP` 与 Offline Core PASS。

已验证：

- `pnpm --filter @chemd/language-service test`：通过 11 个测试。
- `pnpm exec vitest run apps/desktop/src/desktop-local-store.test.ts --config packages/compiler/vitest.config.ts --pool=threads`：
  通过 10 个测试。
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace`：
  通过 8 个 workspace 测试。
- `pnpm run test:scripts`：通过 52 个脚本测试。
- `pnpm --filter @chemd/desktop typecheck`：通过。
- `pnpm --filter @chemd/desktop exec eslint src/App.tsx src/desktop-contracts.ts src/desktop-local-store.ts src/desktop-local-store.test.ts`：
  通过。
- `cargo check --manifest-path apps\desktop\src-tauri\Cargo.toml`：通过。
- `pnpm desktop:offline-core-smoke`：通过，输出 Offline Core PASS。
- `pnpm --filter @chemd/desktop build`：通过；保留既有 lucide `use client` 与
  chunk size warning。
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml`：通过 47 个
  Rust 测试。
- `pnpm desktop:runtime-smoke`：通过 Offline Core 路径；database persistence
  因本机缺少 PostgreSQL binaries 被明确标记为 `SKIP`。
- `pnpm typecheck`：通过 21 个 workspace。
- `pnpm test`：通过 Turbo tests、52 个脚本测试与 52 个 Python 测试。
- `git diff --check`：通过。

未通过/阻塞：

- `pnpm --filter @chemd/desktop tauri:build`：
  - 第一次失败于 Windows 文件锁：旧
    `apps/desktop/src-tauri/target/release/chemd-desktop.exe` 正在运行，
    Rust release build 无法删除旧 exe，返回 `os error 5`。
  - 第二次使用隔离 `CARGO_TARGET_DIR=.tmp/tauri-build-target` 绕开旧 exe，
    但 release 编译超过 5 分钟超时；已终止本次启动的 cargo/rustc 进程。
  - 该项归类为本地环境/进程占用阻塞，不记录为通过。

剩余 P0 缺口：

- UI 尚未把 workspace conflict 以专门的 reload/keep local 决策面板呈现；当前
  只能通过通用错误消息展示 `workspace_file_conflict`。
- 尚未完成真实 installer Offline Core smoke，因为 Tauri build 被本地 release
  exe 锁与隔离 release 编译超时阻塞。
- Monaco 仍未替换 textarea；本轮只完成 language-service core 与 adapter DTO。

### 2026-05-13 第二轮执行记录：冲突 UI、ingest 队列与 release smoke

已合并范围：

- Workspace conflict UI：
  - `workspace_file_conflict` 现在进入专门的冲突决策面板。
  - 用户可以选择 reload from disk 或 keep local editing；不会静默覆盖外部变更。
  - reload 后会刷新 `source`、`savedSource` 与 `savedContentHash`。
- Workspace ingest 队列契约：
  - 新增本地 ingest entry、queue、summary 与 retry eligibility。
  - 支持 `pending`、`running`、`synced`、`failed`、`skipped` 状态。
  - 队列 payload 由 document metadata、compile result 与 runtime payload 派生。
- Release Offline Core smoke preflight：
  - 新增 `pnpm desktop:offline-release-smoke`。
  - 检查 desktop scripts、`dist/index.html` 与 release exe 文件锁。
  - 输出 `PASS`、`SKIP`、`BLOCKED`；不杀进程、不打印 env/secrets。

已验证：

- `pnpm exec vitest run apps/desktop/src/desktop-local-store.test.ts apps/desktop/src/desktop-workspace-ingest.test.ts --config packages/compiler/vitest.config.ts --pool=threads`：
  通过 15 个测试。
- `pnpm run test:scripts`：通过 57 个脚本测试。
- `pnpm --filter @chemd/desktop typecheck`：通过。
- `pnpm --filter @chemd/desktop exec eslint src/App.tsx src/styles/panels.css src/desktop-contracts.ts src/desktop-workspace-ingest.ts src/desktop-workspace-ingest.test.ts`：
  通过；`panels.css` 仍有既有 ignore warning。
- `pnpm desktop:offline-core-smoke`：通过，输出 Offline Core PASS。
- `pnpm desktop:offline-release-smoke`：通过，输出 release preflight PASS。
- `pnpm --filter @chemd/desktop build`：通过；保留既有 lucide `use client` 与
  chunk size warning。
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace`：
  通过 8 个 workspace 测试。
- `git diff --check`：通过。
- `pnpm typecheck`：通过 21 个 workspace。
- `pnpm test`：通过 Turbo tests、57 个脚本测试与 52 个 Python 测试。
- `pnpm --filter @chemd/desktop tauri:build`：通过，生成 release exe、MSI 与 NSIS：
  - `apps/desktop/src-tauri/target/release/chemd-desktop.exe`
  - `apps/desktop/src-tauri/target/release/bundle/msi/Chemd Desktop IDE_0.1.0_x64_en-US.msi`
  - `apps/desktop/src-tauri/target/release/bundle/nsis/Chemd Desktop IDE_0.1.0_x64-setup.exe`
- `pnpm desktop:runtime-smoke`：通过 Offline Core 路径；database persistence 因本机
  缺少 PostgreSQL binaries 被明确标记为 `SKIP`。

当前剩余 P0/P1 缺口：

- Monaco 仍未替换 textarea；language-service core 已具备，但 UI 还不是生产 IDE
  编辑器体验。
- 安装包已生成，但尚未执行干净安装后的人工/自动 Offline Core smoke。
- workspace ingest 目前是本地队列契约，还未接入 UI 扫描、取消、重试与 outbox
  幂等同步执行。
- PostgreSQL 真实同步仍需要外部 DB env 或 managed PostgreSQL binaries；无 DB 只证明
  Offline Core PASS，不证明 shared schema 持久化。

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

- [x] 无 DB、无网络、无 sidecar 时，桌面 app 的 Offline Core smoke 可通过。
- [x] 可打开 workspace、编辑 `.chemd.md`、保存，且保存冲突有 reload/keep local
  决策面板。
- [ ] Monaco diagnostics、preview 与 Problems panel 可离线使用。
- [x] 本地 snapshot/outbox 可生成，pending sync 状态可见。
- [x] PostgreSQL 不可用只降级知识同步，不阻塞编辑。

当前验证入口：

- `pnpm desktop:offline-core-smoke`：P0 Offline Core smoke，验证本地
  snapshot/outbox 与 pending count，不接入 PostgreSQL。
- `pnpm desktop:runtime-smoke`：综合 runtime smoke；无 DB/无 managed
  binaries 时应先输出 database persistence `SKIP`，再输出 Offline Core PASS。
- `pnpm desktop:offline-release-smoke`：release Offline Core smoke preflight，
  检查 desktop scripts、frontend dist 与 release exe 文件锁；输出
  `PASS` / `SKIP` / `BLOCKED`，但不杀进程、不打印 env/secrets。

### P1：本地知识队列生产可用

- [ ] workspace ingest 可本地运行并生成 outbox。
- [x] outbox/ingest 契约支持 pending、synced、failed、skipped 与 retry eligibility。
- [ ] 本地队列幂等，不重复生成知识记录。
- [x] 文件变更和 base revision 冲突有显式处理。

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

当前 release 构建状态：

- `pnpm --filter @chemd/desktop tauri:build` 已在 `desktop-ide` 工作树通过。
- 已生成 Windows MSI 与 NSIS 安装包。
- `pnpm desktop:offline-release-smoke` 已在产物生成后通过 preflight。
- 还缺少“安装到干净用户环境后启动、打开 workspace、编辑保存、关闭重启恢复”的
  installer Offline Core smoke。

当前 release smoke 前置分类：

- `PASS`：`apps/desktop` scripts、`dist/index.html` 与 release exe 锁检查均满足，
  可以继续运行 `pnpm --filter @chemd/desktop tauri:build`。
- `SKIP`：缺少 dist 或无法可靠检查进程占用；这是环境/前置产物不足，不代表产品
  失败或通过。
- `BLOCKED`：目标
  `apps/desktop/src-tauri/target/release/chemd-desktop.exe` 正由同路径进程运行，
  或必要 desktop script 缺失；用户需关闭输出中的 PID，或改用隔离
  `CARGO_TARGET_DIR` 重试。

详细说明见 `docs/desktop-ide/release-offline-smoke.zh-CN.md`。

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

---

## 8. 最终产品化收尾项

以下两项放在所有核心功能、验证、发布路径完成之后执行，不改变前文 M0-M9 和当前
离线优先实施顺序。

### M10：桌面端视觉样式重构

目标：在功能生产可用后，统一重构 Desktop IDE 的视觉样式，使其更接近成熟桌面
IDE/文档工作台，而不是 demo 面板集合。

参考方向：

- 参考用户提供截图：左侧轻量活动栏与文件树、淡色半透明侧栏、大面积无干扰编辑
  画布、顶部紧凑 tab/title 区、低噪声图标工具栏。
- 保持 Chemd 专业化学实验记录属性，但视觉上收敛为安静、轻量、可长时间工作的
  桌面端文档 IDE。
- 减少装饰性卡片、厚重边框和高对比容器；优先使用分栏、状态栏、工具栏、面板
  dock 和可扫描列表。

验收：

- 不改变核心功能与数据流。
- 主要编辑路径在浅色主题下具备足够留白、层级和可读性。
- 文件树、编辑器、Problems、Preview、Graph/RAG/Agent 面板视觉语言一致。
- UI 文案不解释功能本身，控件通过图标、状态和 tooltip 表达用途。

### M11：UI 组件化与大文件拆分

目标：在视觉收尾后，对 Desktop IDE UI 做结构性组件化，拆分 `App.tsx` 等大文件，
沉淀可复用组件、hook 和纯逻辑，降低长期维护复杂度。

参考基线：

- 借鉴 `D:\Code\LabStorageManager\docs\2026-03-24-lint_complexity_summary.md`
  的复杂度治理原则。
- 优先抽离纯函数、业务判断、数据映射、副作用流程和已重复出现的局部 hook。
- 谨慎抽离只负责转发 props 的中转壳组件；不要把复杂度从函数体搬到超大 props
  interface。
- 组件拆分必须以职责边界、复用证据或可测试性为依据，而不是单纯追求文件变短。

验收：

- `App.tsx` 不再承载全部 IDE shell、runtime panels、agent panels、workspace
  controller 和 editor 逻辑。
- props drilling 明显减少，跨组件状态按 workspace、editor、runtime、storage、
  agent 等职责收口。
- 样式 className、布局语义和业务行为保持不变。
- 每批拆分前明确“不改哪些业务逻辑、不改哪些视觉表现、删除哪些中转层、沉淀哪些
  可复用逻辑”。
- 组件化完成后通过 desktop typecheck、focused eslint、desktop build 和相关
  smoke/test。
