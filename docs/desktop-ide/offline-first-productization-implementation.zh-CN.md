# Desktop IDE 离线优先完全产品化实施文档

状态：实施中，离线优先用户/支持指南已补齐
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

第二轮后剩余 P0/P1 缺口：

- Monaco 仍未替换 textarea；language-service core 已具备，但 UI 还不是生产 IDE
  编辑器体验。
- 安装包已生成，但尚未执行干净安装后的人工/自动 Offline Core smoke。
- workspace ingest 目前是本地队列契约，还未接入 UI 扫描、取消、重试与 outbox
  幂等同步执行。
- PostgreSQL 真实同步已用远端 PostgreSQL proof 跑通 shared schema persistence 与
  outbox reconnect sync；Tauri command runner 仍是本机环境 `SKIP`。

### 2026-05-13 第三轮执行记录：Monaco、ingest runner 与 installer artifact smoke

已合并范围：

- Monaco 编辑器：
  - `textarea` 已替换为 `@monaco-editor/react` + `monaco-editor`。
  - 新增 Chemd language id、基础 tokenization、浅色主题、Monaco worker 配置。
  - Monaco markers 由 `@chemd/language-service` 的 Monaco DTO 派生，不重新实现
    compiler。
  - `Ctrl/Cmd+S` 继续走现有 workspace save，Problems panel 与 preview 数据源保持不变。
- Workspace ingest runner：
  - 新增纯 TypeScript runner，通过依赖注入组合文件列表、读取和 compile。
  - 单文件失败不会中断整个 ingest；错误摘要继续脱敏和截断。
  - `.chemd.md` 生成 pending queue item，普通 `.md` 生成 skipped item，其他条目排除。
  - 相同文件内容保持 hash/idempotency key 稳定，内容变化生成新 revision/key。
- Installer artifact smoke：
  - `desktop:offline-release-smoke` 升级为 artifact preflight。
  - 新增 `desktop:installer-offline-smoke` 别名。
  - 自动检查 release exe、MSI、NSIS 非空产物与目标 release exe 路径锁状态。
  - 明确该脚本不安装应用，也不证明 clean-machine Offline Core。

已验证：

- `pnpm install --frozen-lockfile`：通过。
- `pnpm exec vitest run apps/desktop/src/desktop-workspace-ingest.test.ts apps/desktop/src/desktop-local-store.test.ts --config packages/compiler/vitest.config.ts --pool=threads`：
  通过 19 个测试。
- `pnpm run test:scripts`：通过 59 个脚本测试。
- `pnpm --filter @chemd/desktop typecheck`：通过。
- `pnpm --filter @chemd/desktop exec eslint src/App.tsx src/MonacoChemdEditor.tsx src/styles/panels.css src/desktop-workspace-ingest.ts src/desktop-workspace-ingest.test.ts`：
  通过；`panels.css` 仍有既有 ignore warning。
- `pnpm --filter @chemd/desktop build`：通过，生成 `editor.worker`；保留既有
  lucide `use client` warning，Monaco 引入后主 bundle 超过 500 kB。
- `pnpm desktop:offline-core-smoke`：通过，输出 Offline Core PASS。
- `pnpm desktop:offline-release-smoke`：通过 artifact preflight PASS。
- `pnpm desktop:installer-offline-smoke`：通过 artifact preflight PASS。
- `pnpm desktop:runtime-smoke`：通过 Offline Core 路径；database persistence 因本机
  缺少 PostgreSQL binaries 被明确标记为 `SKIP`。
- `cargo test --manifest-path apps\desktop\src-tauri\Cargo.toml workspace`：
  通过 8 个 workspace 测试。
- `pnpm typecheck`：通过 21 个 workspace。
- `pnpm test`：通过 Turbo tests、59 个脚本测试与 52 个 Python 测试。
- `pnpm --filter @chemd/desktop tauri:build`：通过，生成包含 Monaco 前端产物的 release
  exe、MSI 与 NSIS：
  - release exe：33,360,325 bytes
  - MSI：8,454,144 bytes
  - NSIS：5,748,832 bytes
- `git diff --check`：通过，仅有 CRLF 工作区提示。

当前剩余 P0/P1/P4 缺口：

- P0 离线基础编辑链路已具备 Monaco、保存冲突、snapshot/outbox 与 Offline Core smoke；
  仍缺真实桌面运行截图/手测证据。
- workspace ingest 已有纯 runner，但还未接入 UI 扫描、取消、重试与 outbox 幂等同步执行。
- installer artifact preflight 已通过，但 clean-machine 安装后启动、打开 workspace、
  编辑保存、关闭重启恢复仍未执行。
- PostgreSQL 真实同步仍需要外部 DB env 或 managed PostgreSQL binaries；无 DB 只证明
  Offline Core PASS，不证明 shared schema 持久化。

### 2026-05-13 第四轮进行中：bundle 拆分与远端 PostgreSQL proof

已完成：

- Monaco bundle split：
  - `apps/desktop/vite.config.ts` 已用 `manualChunks` 拆分 `monaco` 与
    `react-vendor`。
  - desktop build 主入口从约 3.2 MB 降到约 468 KB。
  - Monaco 仍作为独立大 chunk 触发 size warning；未通过提高阈值掩盖。
- 远端 PostgreSQL runtime smoke：
  - 使用外部 PostgreSQL 连接完成 `pnpm desktop:runtime-smoke`。
  - 输出已脱敏：`host=103.24.219.156, port=5632, database=postgres, user=postgres,
    password=[REDACTED]`。
  - shared schema persistence、runtime Graph/RAG verification、local outbox reconnect
    sync 均通过。
  - Tauri command smoke 仍因未配置 `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER` 被明确标记
    为 `SKIP`，不阻塞后续产品化推进。
- Diagnostics bundle：
  - `c3f84fb feat(desktop)：合并诊断包脚本` 合并 `pnpm desktop:diagnostics-bundle`。
  - `04f8202 feat(desktop)：合并诊断包支持上下文` 扩充离线支持上下文。
  - 入口生成离线、脱敏 JSON；记录平台、Node、git commit、desktop package、
    产物摘要、桌面命令清单、runtime/release preflight 分类与选定 env 名称。
  - 支持上下文增加固定 support command 清单、offline smoke 目录摘要、preflight
    可读分类，以及 sidecar/log/sync/provider 未运行时的明确 `SKIP` 边界。
  - 采集过程不启动 GUI、不联网、不读取 `.env`，因此可在真实网络或运行期服务不可用
    时继续作为支持诊断入口。
  - 合并后将单文件脚本拆成 CLI、core、sanitizer 三个模块，避免新增大文件。
  - 主分支验证：diagnostics 定向测试 7/7、`pnpm run test:scripts` 66/66、
    scripts ESLint 通过、desktop typecheck 通过、`pnpm desktop:diagnostics-bundle`
    可生成 JSON。
- 用户/支持文档：
  - `8a3a99f docs(desktop)：合并离线优先用户指南` 合并
    `docs/desktop-ide/user-offline-first-guide.zh-CN.md`。
  - 文档覆盖首次离线启动、workspace、编辑/保存/编译/preview/diagnostics、本地
    snapshot/outbox、PostgreSQL/JDBC 配置、同步失败恢复、diagnostics bundle 与
    clean-machine smoke / `SKIP` 解释。
- Workspace ingest UI：
  - `feat(desktop)：合并 workspace ingest UI` 将 workspace ingest 扫描入口接入
    Local Store 面板。
  - UI 使用现有 workspace 文件列表、`read_workspace_file` 和 language-service compile
    生成内存 ingest queue，展示 total/pending/skipped/failed/retryable 摘要与失败项。
  - 主分支验证：workspace ingest/local-store Vitest 19/19、desktop typecheck、
    desktop build、`git diff --check` 通过。
  - Focused ESLint 仍有 `LocalStorePanel` 复杂度与函数长度两项错误；按用户要求暂不
    阻塞产品化主线，归入最终 M11 UI 组件化与复杂度治理。
- Workspace index 与 semantic preview UI：
  - Monaco editor 现在接收本地 workspace symbol index，用于跨文档 reference
    completion；无 index 或 index 异常时自动降级为 local completions。
  - `App.tsx` 在本地 workspace 打开后构建 Chemd 文档 symbol index，当前编辑文件使用
    内存 source，其他文件通过只读 `read_workspace_file` 读取。
  - 右侧 dock 新增 `Semantic Preview` 面板，消费 renderer-json/html 生成的语义预览
    DTO，并展示 preview 状态、编译时间与 workspace index 摘要。
  - 主分支验证：workspace-symbol/semantic-preview/Monaco completion 定向测试 11/11、
    desktop typecheck、desktop build、`pnpm test`、`pnpm typecheck` 和 `git diff --check`
    通过。
  - Focused ESLint 仍仅报 `LocalStorePanel` 既有复杂度/函数长度门禁；按当前策略记录到
    M11 组件化与复杂度治理，不阻塞功能主线。
- Graph/RAG 与 Agent 面板模型：
  - `feat(desktop)：合并反应聚类面板模型` 新增纯 TypeScript cluster panel DTO，
    为后续 Graph/RAG UI 接入提供稳定 list/detail、member count、shared features、
    similarity edge basis、semantic-only/weak warning 与 fallback 状态。
  - `feat(desktop)：合并 Agent timeline 面板模型` 新增 Agent timeline/audit DTO，
    输出 timeline rows、tool call rows、patch gate、citation safety 与 warning 摘要。
  - 两个切片都不启动网络、不访问数据库、不写 workspace 文件；只消费 compiler/exporter
    或 agent-tools 的现有 DTO。
  - 主分支验证：cluster/agent timeline 定向测试 9/9、desktop typecheck、focused
    ESLint、desktop build 和 `git diff --check` 通过。
- Release readiness：
  - `feat(desktop)：合并发布就绪聚合脚本` 新增 `pnpm desktop:release-readiness`。
  - 聚合 desktop runtime preconditions、offline release preflight 和 diagnostics
    bundle builder，输出 console/JSON 摘要。
  - clean-machine installer smoke 与真实网络检查固定记录为 `skip/not-run`，不伪装为
    通过。
  - 主分支验证：release-readiness 定向测试 6/6、`pnpm run test:scripts` 72/72、
    scripts ESLint、`pnpm desktop:release-readiness --json`、`git diff --check` 通过。
- Tauri diagnostics export：
  - `feat(desktop)：合并 Tauri 诊断包导出命令` 新增 `export_diagnostics_bundle`
    命令契约。
  - 命令写入离线、脱敏 JSON 到系统临时目录，返回输出路径与摘要；不启动 GUI 外部
    流程、不联网、不读取 `.env`、不要求 sidecar/PostgreSQL。
  - `fix(desktop)：同步诊断包命令清单` 将 `export_diagnostics_bundle` 同步进 Node
    diagnostics bundle command list。
  - 主分支验证：Rust diagnostics bundle 测试 3/3、desktop typecheck、contract/scripts
    ESLint、diagnostics bundle 测试 7/7、`pnpm desktop:diagnostics-bundle` 通过。
- Reaction intelligence artifact 本地消费：
  - `feat(desktop)：保存 reaction intelligence 本地 artifact` 新增独立 local-store
    artifact 文件与 Tauri 命令，不把 worker artifact 混入 runtime snapshot/outbox。
  - `feat(desktop)：合并 cluster computed evidence` 让 cluster detail/edge DTO 区分
    computed basis、semantic basis、provider ids 与 confidence；computed/hybrid edge 不再
    因 fallback warning 被误标为 semantic-only。
  - `feat(desktop)：合并 knowledge artifact 摘要` 让 knowledge map view model 可选消费
    reaction intelligence artifact，并在面板展示 artifact/job、provider PASS/SKIP/ERROR、
    computed edge count、basis、warnings 与 TMAP/fallback layout 来源。
  - 主分支验证：desktop local-store/cluster/knowledge-map 定向 Vitest 30/30、
    Rust local_store 12/12、desktop typecheck、focused ESLint、desktop build、
    `git diff --check` 通过；desktop build 仍只有既有 lucide `use client` 与 chunk size
    warning。
- Reaction intelligence artifact 读取与 basis filter：
  - `feat(desktop)：合并 edge basis filter` 在 knowledge map 中新增 edge basis options
    与筛选控件，basis filter 与 cluster filter 组合生效。
  - `feat(desktop)：合并本地 artifact controller` 让 Desktop App 从本地
    `list_local_reaction_intelligence_artifacts` 读取 artifact，并注入 knowledge map。
  - `fix(desktop)：限制 artifact 注入当前反应` 增加 reaction id overlap guard，避免最新
    artifact 跨文档污染当前图谱。
  - 主分支验证：desktop local-store/artifact-controller/knowledge-map 定向 Vitest 31/31、
    desktop typecheck、focused ESLint（不含 `App.tsx`）、desktop build、`git diff --check`
    通过；`App.tsx` 既有复杂度/函数长度 3 项继续记录到 M11。
- Reaction intelligence worker 本地运行入口：
  - `feat(desktop)：合并 reaction intelligence worker 命令` 新增
    `run_reaction_intelligence_worker` Tauri command，调用本地
    `services/chem-cluster-service` CLI；service/Python/模型缺失返回结构化
    `skipped`/`failed`，不阻塞离线编辑。
  - `feat(desktop)：合并 reaction intelligence 任务控制器` 新增纯 TS 状态机，
    覆盖 worker run、artifact save、latest artifact refresh 与错误路径。
  - 主线补充 `buildDesktopReactionIntelligenceJob`，仅在 reaction participant 具备真实
    SMILES/canonical SMILES 时构造 job；Local Store 面板新增 Run intelligence job
    入口并显示运行、跳过、失败、保存摘要与日志 tail。
  - 当前验证：job builder/controller Vitest 12/12、desktop typecheck、focused ESLint
    （新文件通过，`App.tsx` 复杂度/函数长度继续非阻塞）、`git diff --check` 通过；
    真实模型/网络/DB 未执行，按环境增强路径记录为 `SKIP`。
- Reaction intelligence 硬化：
  - `fix(desktop)：合并 reaction intelligence worker 超时` 为本地 worker command 增加
    bounded timeout，默认 120s，超时只终止自己启动的直接 child，并以结构化
    `reaction_intelligence_worker_timeout` 返回。
  - `fix(desktop)：合并知识图谱来源跳转` 将 knowledge map source-ref/evidence action
    接到 Monaco editor，当前文件内可 selection/reveal/focus；跨文件 source ref 当前阶段
    明确提示并 no-op。
  - 当前验证：Rust worker timeout tests 10/10、Monaco/source jump 与 knowledge-map
    Vitest 18/18、desktop typecheck 通过；`App.tsx` 复杂度/函数长度仍进入 M11。
- 本轮 P1/P2 纯逻辑闭环：
  - `feat(desktop)：合并 workspace ingest outbox 桥接` 新增
    `buildWorkspaceIngestOutboxInputs`，把带 `runtimePayload` 的 pending / retryable
    failed ingest item 幂等转换为 Local Store snapshot outbox input；skipped、synced、
    running、缺 payload、超过 retry 阈值的失败项都有结构化原因和脱敏摘要。
  - `feat(postgres)：合并 reaction artifact shared schema adapter` 新增
    `buildReactionIntelligenceRuntimeGraphRagInput`，把 reaction intelligence artifact
    similarity edge 映射为 shared schema runtime graph edge，保留 artifact/job/provider、
    basis、source hash、warnings 与 computed feature evidence。
  - 主控审查后追加 `fix(postgres)：对齐 reaction artifact 类型合同`，让 adapter 直接
    引用 `@chemd/reaction-map` 的 artifact 类型与 schema 常量，避免跨包合同漂移。
  - 当前验证：workspace ingest/local store Vitest 28/28、storage-postgres Vitest
    33/33、focused ESLint、`pnpm typecheck`、`pnpm test`、desktop build 与
    `git diff --check` 均通过；真实 DB 写入仍复用既有 runtime smoke，artifact
    command/UI 同步留到后续 M5/M6 集成。
- Workspace ingest runner 与诊断覆盖：
  - `feat(desktop)：合并 workspace ingest outbox runner` 新增
    `runWorkspaceIngestOutboxSave`，把 workspace ingest、outbox input 构造和注入式
    `saveSnapshot` 串成纯 TypeScript runner；eligible / retryable item 会写入本地
    snapshot outbox，单条保存失败会脱敏记录并继续处理后续 item。
  - `feat(desktop)：合并诊断包 provider 覆盖` 扩充 diagnostics bundle 的 reaction
    intelligence worker、local artifact、outbox sync command 覆盖，并记录 provider、
    model、artifact、sync 的静态 `PASS` / `SKIP` / `BLOCKED` 支持上下文。
  - 当前验证：workspace ingest runner/local store Vitest 33/33、diagnostics Node 测试
    8/8、Rust diagnostics tests 3/3、focused ESLint、`pnpm typecheck`、`pnpm test`、
    desktop build、完整 Tauri `cargo test` 均通过；desktop build 仍有既有 lucide
    `use client` 与 chunk size warning。真实 DB、provider、模型运行未执行，继续按
    环境增强路径记录为 `SKIP`。
- Workspace ingest UI/Tauri 保存接线：
  - `feat(desktop)：合并 workspace ingest 本地保存接线` 将 Local Store 面板的
    Scan/Ingest 从内存队列切换为 `runWorkspaceIngestOutboxSave`，每个可编译 workspace
    文档会复用 runtime payload builder 构造 Graph/RAG snapshot，并通过
    `save_local_runtime_snapshot` 写入本地 outbox。
  - UI 文案现在显示 scan count 与 runner save 摘要；完成后刷新 Local Store 状态，
    pending outbox count 可以反映 workspace ingest 产生的本地同步队列。
  - 当前验证：workspace ingest runner/local store Vitest 33/33、desktop typecheck、
    `pnpm typecheck`、`pnpm test`、desktop build 与 `git diff --check` 均通过；
    focused ESLint 仍仅报 `App.tsx` 既有复杂度/函数长度 4 项，继续按 M11 处理。
- RAG citation gate 基础：
  - `feat(desktop)：合并 RAG citation gate 结果` 在 workspace index view model 中
    增加 citation-backed RAG results 与 `ragGate` 状态；RAG 面板现在先展示带
    citation locator 的本地 RAG 行，再保留 symbols/references 搜索。
  - RAG result 只来自 `buildEditorGraphRagRecords` 产出的 citation candidates；
    缺少 `citationId`、`revisionId`、`chunkId` 或 source range 的候选不会进入结果。
  - 当前验证：workspace-index Vitest 7/7、focused ESLint、desktop typecheck、
    `pnpm typecheck`、`pnpm test`、desktop build 与 `git diff --check` 均通过；
    这仍是本地 citation gate 基础，不包含 embedding/provider/DB 查询。
- Postgres connection profile / secret storage 后端：
  - 新增 `list_postgres_profiles`、`save_postgres_profile`、
    `activate_postgres_profile`、`delete_postgres_profile` Tauri command 契约。
  - profile metadata 写入 app data 下的 `postgres-profiles/profiles.json`；password
    只写入系统 keyring，不写入普通 JSON 配置、diagnostics bundle 或日志。
  - runtime Postgres config 会优先读取 active profile 并生成
    `CHEMD_POSTGRES_DATABASE_URL` / timeout / pool env source；无 active profile 或
    secret 不可读时自然回落到 process env、repo env、managed PostgreSQL。
  - diagnostics bundle 的已知 command 清单同步加入 profile commands，仍只做离线
    脱敏支持包，不读取 password 或连接真实 DB。
  - 当前验证：Rust profile tests 5/5、Rust diagnostics tests 3/3、完整
    `cargo test` 65/65、`cargo check`、diagnostics Node tests 8/8、contract/scripts
    ESLint、desktop typecheck、`pnpm typecheck`、`pnpm test`、desktop build 与
    `git diff --check` 均通过；真实 DB/network/Tauri runner 未作为本轮门禁。
- Postgres connection profile UI 与 command smoke：
  - `feat(desktop)：合并 Postgres profile UI` 在 Postgres 面板新增 connection
    profiles 管理区，支持 list/save/activate/delete；表单默认远端连接参数但 password
    输入为空，保存后清空 password，只展示 `passwordSaved` / active 状态。
  - UI 将 profile command 错误转换为结构化 code/message/detail，并做密码与 Postgres
    URL 脱敏；command 失败不影响 Offline Core authoring。
  - `test(desktop)：合并 Postgres profile command smoke` 扩展 Tauri command smoke：
    使用唯一临时 profile id，覆盖 list/save/activate/delete 调用形状；delete 或
    activate 失败时尽力恢复原 active profile / 清理临时 profile，并保证错误输出不泄漏
    password。
  - 当前验证：profile UI Vitest 6/6、runtime/diagnostics script tests 38/38、
    `pnpm run test:scripts` 75/75、desktop typecheck、new-file/scripts focused ESLint、
    desktop build、`pnpm typecheck`、`pnpm test` 与 `git diff --check` 均通过；真实
    Tauri command runner 和真实 GUI 手测仍未执行。
- Postgres migration / pgvector / schema readiness visibility：
  - `feat(desktop)：合并 Postgres migration status` 扩展 Tauri Postgres status：
    返回 `migrationState`、`migrationReason` 与 `coreTablesFound`，并把 pgvector、
    core schema、migration state 拆成独立可见信号。
  - 外部 PostgreSQL 与 managed PostgreSQL 共用同一 readiness 展示模型；无配置、
    无 runner、无真实 DB 连接时保持 `unknown` / degraded 语义，不阻断 Offline Core。
  - Rust 侧仅做 read-only 探针与状态归一化，不新增 desktop-only schema 或 migration。
  - 当前验证：`cargo test postgres` 22/22、desktop status Vitest 4/4、desktop
    typecheck、status helper focused ESLint 与 desktop build 均通过；focused
    `App.tsx` ESLint 仍仅剩既有 complexity/max-lines 4 项，按 M11 处理。

当前暂缓债务：

- Workspace ingest UI 已合并，但 focused ESLint 复杂度门禁尚未清零：
  `LocalStorePanel` 超过 `max-lines-per-function` 与 complexity 限制。
- Postgres profile UI 合并后，focused `App.tsx` ESLint 仍仅剩既有复杂度/函数长度
  4 项：`PostgresProfileManagerSection`/`LocalStorePanel`/`DesktopWorkbench`/`App`
  所在区域行号随插入变化；Postgres readiness UI 合并后仍属同一类债务，继续进入
  M11 组件化与复杂度治理，不阻塞功能主线。
- 最终 M11 阶段需要拆出有职责的 `WorkspaceIngestPanel`/hook，不能只靠纯 props
  转发组件搬移复杂度。

### M4：本地 workspace ingest 与可恢复队列

目标：把单文档 authoring 扩展为本地 workspace 级知识准备。

交付物：

- workspace 批量扫描 `.chemd.md`。
- 对每个文档执行 compile，并生成本地 revision snapshot。
- 本地 ingest 队列记录 pending、running、synced、failed、skipped。
- 失败重试、取消、继续运行。
- 文档 hash、source range、compile result hash 和 outbox payload 一一对应。

状态：已补纯 TypeScript workspace ingest runner，并已在桌面 Local Store 面板接入
workspace 扫描和本地 outbox 保存入口；runner 现在会复用同一 document hash / revision 的 existing
pending、running、synced item，文件内容变化会生成新 revision，不覆盖旧 item；failed item
超过 retry 阈值后保持 failed，不会自动变回 pending。当前已补 ingest queue 到
Local Store snapshot outbox input 的纯函数桥接，并新增注入式
`runWorkspaceIngestOutboxSave` 保存 eligible / retryable outbox input；App 已通过
`save_local_runtime_snapshot` 接入本地 JSON outbox。取消/重试和大 workspace 后台调度
仍归后续集成。

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

状态：已在桌面 RAG 面板补 citation-backed 本地搜索基础，RAG result 必须带
`citationId`、`revisionId`、`chunkId` 与 source range；当前只消费本地 compiler /
language-service 生成的 citation candidates，尚未接入 embedding provider、pgvector
查询和跨 workspace 排名。2026-05-13 只读架构拆分结论：先串行落地 desktop RAG
command contract + Rust runtime query，再并行接 citation-gated UI、embedding
backfill task/status 与 runtime smoke extension；`desktop-contracts.ts`、shared
schema/migration 与 `App.tsx` 接入点不得多人并行写。

2026-05-14 第一批 M6 接入完成：Desktop 已新增 `query_postgres_rag` Tauri
command contract 和 Rust runtime query，调用方显式传入 embedding / embedding model，
Rust 复用 active Postgres config，只读查询 `chemd_rag_chunk_embeddings`、chunks、
citations 与 revision source，不执行 migration，也不创建 desktop-only schema。结果必须
带 citation id 与可用 source range；缺 citation 的 pgvector row 计入
`blockedCount`，不进入 `results`。同时新增 connected RAG result gate 纯函数，支持
local + connected 结果去重和按 score / distance 排序；runtime smoke 增加可选
`query_postgres_rag` 阶段，无 DB、无 Tauri runner 或无 embedding vector 时明确
`SKIP`。当前仍未接入真实 embedding provider/backfill UI，也未把 connected query
接进桌面 RAG 面板。

2026-05-14 第二批 M6 接入完成：Desktop 新增
`backfill_postgres_rag_embeddings` Tauri command contract 和 Rust write path，调用方传入
已生成的 embedding vectors；Rust 只校验并 upsert shared schema 的
`chemd_embedding_models` 与 `chemd_rag_chunk_embeddings`，支持 `dryRun`、逐项
validation summary、维度一致性检查与 password 脱敏，不直接接远端 provider secret。
同时新增 `desktop-postgres-rag-query-view` adapter，把 `query_postgres_rag` result
转换为 connected RAG rows，并汇总 command/adapter blocked count，为后续 RAG panel
UI 接线准备。当前仍未把 embedding provider 配置、backfill UI、connected query button
接入 App/RAG panel。

2026-05-14 第三批 M6 接入完成：Desktop RAG 面板已接入 connected RAG controller
state，并支持展示 local/connected result source、score/distance、blocked summary 与
disabled/degraded 状态。当前 App 侧不会伪造 embedding vector，也不会在无 provider
时调用 `query_postgres_rag`；无 embedding provider 时 connected RAG 明确保持
disabled，本地 citation-backed RAG、symbols 与 references 搜索继续可用。后续仍需补
embedding provider 配置、query/backfill UI trigger 与真实 provider/runner proof。

2026-05-14 第四批 M6 接入完成：Desktop 新增只读
`read_embedding_provider_status` Tauri command，用于检查
`CHEMD_EMBEDDING_*` 运行时环境是否足够支撑 connected RAG；该 command 不联网、不访问
数据库、不返回 API key 或完整 URL，只返回 host、model、dim、distance metric、timeout
与脱敏 detail。RAG 面板新增 query 输入与 Run 入口，并读取 provider status 参与
readiness；由于当前仍没有“query text -> embedding vector”的桌面 provider command，
Run 在无 vector 时保持 disabled，不会伪造 embedding，也不会误报 pgvector 查询已成功。
backfill UI 暂缓到真实 provider vector 生成路径完成后再接入。

2026-05-13 第五批 M6 接入完成：Desktop 新增 `create_embedding_vector`
Tauri command，通过 `CHEMD_EMBEDDING_*` 调用 HTTP embedding gateway，发送
`{ input, model }`，支持 Chemd `{ embedding }` 与 OpenAI-style
`{ data: [{ embedding }] }` 响应，校验空 query、provider env、向量维度和 finite
number，并对 provider error、API key、完整 URL 做脱敏。RAG 面板 Run 已改为两阶段：
先为当前 query 生成真实 embedding vector，再用该 vector 调用 `query_postgres_rag`；
不会用 fake vector 绕过 pgvector readiness。无 provider、provider 失败或真实网络不可达时，
UI 保持 failure/degraded 信息，本地 citation-backed RAG、symbols 与 references 搜索继续可用。
backfill UI 仍暂缓到 chunk embedding 生成与任务状态路径完成后再接入。

2026-05-13 第六批 M6 接入完成：Desktop 新增 `create_embedding_vectors`
Tauri command foundation，为后续 RAG backfill UI 提供批量 query/chunk text -> embedding
vector 能力。该 command 逐项处理 `{ id, text }`，限制单批 100 项，空 id/text
只让对应 item 降级，其他有效 item 仍可继续生成 embedding；provider env 缺失或不可用时
整体返回 offline/degraded 且不泄露文本、API key、完整 URL 或 provider body。同时
workspace RAG result 现在保留完整 `text` 字段，`label` 仅用于截断展示，避免未来
backfill 使用 UI display label 生成向量。真实 provider 网络 proof 与 backfill UI 仍按
环境增强路径推进。

2026-05-13 第七批 M6 接入完成：Desktop RAG 面板新增 connected embedding
backfill 入口，App 现在按顺序执行 `create_embedding_vectors` 与
`backfill_postgres_rag_embeddings`：先用本地 citation-backed RAG chunk 的完整
`text` 批量生成 embedding，再把可用向量写回 shared pgvector schema。新增
`desktop-postgres-rag-backfill-controller` 纯 helper，覆盖 workspace/Postgres/
pgvector/schema/embedding provider readiness、chunk 去重、空文本跳过、batch
partial success 和完成消息汇总；provider 网络不可达或无真实 runner 时仍作为
failure/degraded 状态显示，不影响本地 RAG、symbols、references 搜索。真实 provider
网络 proof 仍按环境型验证单独补充。

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

2026-05-13 第一批 M7 接入完成：Agent patch apply 现在在修改 editor buffer
前先生成候选源码并运行 `compileChemdForEditor`；该验证会作为
`compile_current_file` tool call 写入 Agent audit timeline。若候选源码 compile failed，
Agent run 转为 `blocked`，记录 validation result 和 final summary，不修改 editor buffer；
compile 通过后才写入 `applied` decision 并更新 buffer。该步骤仍是本地同步验证，不依赖
网络、PostgreSQL 或真实外部 Agent provider。

2026-05-13 第二批 M7 接入完成：合并子代理 `desktop-agent-panel-ui` 与
`desktop-agent-tool-contracts`。Desktop 新增可复用 `DesktopAgentPanel`，消费
`buildDesktopAgentTimelinePanel` 输出，集中展示 summary、tool calls、patch gate、
warnings、timeline rows 和 approve/apply/reject 入口；旧 App 内联 Agent 面板已替换。
同时新增 desktop agent tool contract helper，锁定 `compile_current_file`、`query_rag`、
`inspect_reaction_graph`、`semantic_diff`、`propose_repair`、`apply_approved_patch`
的展示文案、输入/输出摘要、workspace/current file/explicit approval requirement 与
offline/connected availability；timeline tool row 现在优先使用该 contract 摘要策略。

验收：

- Agent 不能直接写 workspace 文件。
- 用户确认前不会应用 patch。
- patch apply 前必须对候选源码重新 compile；失败时不得修改 editor buffer。
- 每个 Agent run 可审计、可重放关键上下文；tool row 使用稳定 contract 摘要，避免
  泄露完整 source 或大 payload。

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
pnpm desktop:diagnostics-bundle
pnpm desktop:release-readiness --json
```

`desktop:diagnostics-bundle` 是支持闭环的离线诊断入口：它生成脱敏 JSON
诊断包，记录平台、Node 版本、git commit、desktop package version、frontend
dist、release exe/MSI/NSIS 产物摘要、已知 Tauri command 名称、runtime
smoke/preflight 的分类摘要，以及固定范围的 support context。它不会启动 GUI、
不会联网、不会读取 `.env` 文件、不会运行重型 runtime smoke，也不会输出完整
env、database URL、API key、token 或 password。诊断包说明见
`docs/desktop-ide/diagnostics-bundle.zh-CN.md`。

---

## 5. 产品化完成定义

### P0：离线基本功能生产可用

- [x] 无 DB、无网络、无 sidecar 时，桌面 app 的 Offline Core smoke 可通过。
- [x] 可打开 workspace、编辑 `.chemd.md`、保存，且保存冲突有 reload/keep local
  决策面板。
- [x] Monaco diagnostics、preview 与 Problems panel 可离线使用。
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

- [x] workspace ingest 可本地运行并通过 App UI/Tauri 调用链保存 outbox-ready
  snapshot input。
- [x] outbox/ingest 契约支持 pending、synced、failed、skipped 与 retry eligibility。
- [x] workspace ingest runner 可通过依赖注入本地运行并生成可恢复队列。
- [x] 本地队列幂等基础：同一 document hash / revision 复用 existing queue item，
  文件变化生成新 revision，失败超过阈值后不自动重试；实际知识记录幂等写入仍归 P2/M5。
- [x] 文件变更和 base revision 冲突有显式处理。
- [x] Reaction intelligence artifact 可离线写入本地 local store，并可被知识图谱/cluster
  inspector 消费；DB sync 仍归 P2 shared schema 阶段。
- [x] App 可从本地 local store 读取最新 reaction intelligence artifact，并带 reaction id
  overlap guard 后注入当前 knowledge map。
- [x] Desktop 可从本地编译语义生成合法 reaction intelligence job，并通过本地 worker
  入口运行；缺少结构数据或模型依赖时可显式降级/跳过。

### P2：PostgreSQL 同步生产可用

- [x] connection profile UI 可用；真实 Tauri runner/GUI 手测待补。
- [x] 凭据后端使用系统 secret storage；profile UI 不展示或保存明文密码。
- [x] migration、pgvector、schema readiness 状态可见；schema version mismatch
  检测仍待 shared migration contract 明确后补。
- [x] 外部 DB 与 managed DB 使用同一 shared schema。
- [x] sync 成功、失败、冲突都有 UI 和日志。
- [x] Reaction intelligence artifact 可映射为 shared schema runtime graph edge
  input；实际 artifact sync command/UI 仍待接入。

当前验证状态：

- 外部 PostgreSQL script-level runtime smoke 已通过，包含 shared schema 写入与本地
  outbox reconnect sync。
- Desktop profile command 后端已可保存/激活/删除 connection profile，并通过 OS
  keyring 保存 password；桌面 UI 已接入 list/save/activate/delete 表单与状态展示。
- Tauri command smoke 已用 fake runner 覆盖 profile command 调用、临时 profile 清理、
  原 active profile 恢复和 password 脱敏；真实 runner 仍按环境型 `SKIP`。
- Desktop Postgres status 已拆分展示 pgvector installed、core schema ready 与
  migration state；外部 DB 与 managed DB 面板共用 readiness item 模型。
- Desktop RAG query command 已可复用 active Postgres config 查询 shared pgvector
  rows，并强制 citation-backed results；真实 runner/真实 embedding 仍按环境型
  `SKIP`。
- Desktop RAG embedding backfill command 已可写入 shared pgvector schema；RAG 面板
  已接入 UI 触发，按 `create_embedding_vectors` -> `backfill_postgres_rag_embeddings`
  两阶段执行。真实 provider 网络 proof 仍待环境可用后补。
- Desktop local sync 结果视图已展示 synced、failed、retryable/skipped 与 conflict
  分类，保留 sanitized message、local id、graph snapshot id 与 idempotency key，便于
  用户判断成功、失败、冲突与可重试状态；真实 runner/真实 DB proof 仍按环境型
  `SKIP`。
- Tauri command-level proof 尚未配置 runner，当前按环境型 `SKIP` 处理，不阻塞离线
  优先主线。

P2 local sync result UI 阶段性完成记录（2026-05-14）：

- 代码提交：`3273a0e feat(desktop)：补充本地同步结果视图模型`、
  `6392aea feat(desktop)：接入本地同步结果列表`。
- Local sync summary 保留完整 entries，同时兼容既有 failedEntries；新增
  `buildLocalSyncResultRows`，将 synced、failed、pending/skipped 与 conflict
  message 归一为 UI 可消费行。
- Local Store 面板从“只显示失败”升级为完整同步结果列表，显示 status/conflict、
  local item、message、graph snapshot id 与 idempotency key；错误文案会截断并
  脱敏，避免将 password/token/secret 泄露到 UI。
- 本阶段不依赖真实网络或真实 DB，只验证离线 view-model、React 接线和构建路径；
  实际 sync command 的真实运行 proof 仍按环境条件后补。
- 验证：local sync view Vitest 5/5、desktop typecheck、desktop build、root
  `pnpm typecheck` 24/24 tasks、root `pnpm test` 23 turbo test tasks + 78 script tests
  + 86 Python tests 均通过；focused ESLint 仅剩 `LocalStorePanel.tsx`
  complexity/max-lines，按用户指示留到最终复杂度治理，不阻塞当前功能主线。

P2 shared schema parity 阶段性完成记录（2026-05-14）：

- 代码提交：`84e94d3 test(desktop)：校验 managed shared schema parity`。
- `scripts/desktop-postgres-bundle.test.mjs` 新增 managed/external shared schema
  signature 测试，静态读取 `packages/storage-postgres/src/graph-rag-schema.ts` 与
  `apps/desktop/src-tauri/src/managed_postgres_migrations.rs`。
- 覆盖 shared Graph/RAG/Agent 表：`chemd_reaction_graph_snapshots`、
  `chemd_reaction_graph_nodes`、`chemd_reaction_graph_edges`、
  `chemd_rag_chunk_citations`、`chemd_agent_runs`、`chemd_agent_tool_calls`、
  `chemd_patch_proposals` 的关键列；同时断言 managed schema 不引入 desktop-only 表。
- 该测试是本地静态 parity 门禁，不连接真实 DB；真实外部 PostgreSQL/managed
  runtime 仍由 runtime smoke 或环境验收补充。
- 验证：`node --test scripts/desktop-postgres-bundle.test.mjs` 12/12 通过；
  `pnpm run test:scripts` 79/79 通过；`git diff --check` 通过。

### P3：Graph/RAG/Agent 产品化

- [x] Graph panel 可解释 edge evidence 并跳源码。
- [x] Graph panel 可从 source-ref/evidence action 跳到当前 Monaco editor range；跨文件
  source ref 明确 no-op，不误开文件。
- [x] Reaction intelligence artifact 的 computed/semantic basis、provider 状态与 layout
  来源可在 knowledge map/cluster inspector 中解释。
- [x] Knowledge map 支持 edge basis filter，并可与 cluster filter 组合过滤节点。
- [x] Reaction intelligence job builder 不伪造 RXN SMILES，只消费真实结构字段；失败或
  缺依赖时保留本地日志 tail 和可显示状态。
- [x] RAG search 有 citation gate 基础：本地结果必须带 citation locator；connected
  pgvector query command、embedding write command、result gate、query view adapter
  与 RAG panel disabled/degraded 展示已具备；embedding provider status、query 输入
  与 Run 入口已接入；query text 可通过 `create_embedding_vector` 生成真实 vector 后
  调用 `query_postgres_rag`；批量 `create_embedding_vectors` 与完整 chunk text 字段
  已接入 backfill UI，可把本地 chunk embedding 写回 shared pgvector schema。真实
  provider 网络 proof 仍待补。
- [x] Agent run 可审计，patch 需用户确认。
- [x] 所有增强能力离线/失败时可降级。


P3 Graph edge evidence 阶段性完成记录（2026-05-14）：

- 代码提交：`3816374 feat(desktop)：增加 Knowledge Map edge evidence view-model`、
  `e99c92b feat(desktop)：补充图谱边证据面板草案`、
  `9a060aa feat(desktop)：接入图谱边证据面板`。
- Knowledge Map view-model 新增 `edgeEvidenceRows`，每条 reaction map edge 都可展示
  from/to reaction、basis、score、warnings 与 evidence source，并为 from/to 两端提供
  sourceRef/jump intent；缺少 source span 时安全显示 pending，不伪造来源。
- Graph 面板新增 Edge Evidence 区域，按 edge basis filter 联动过滤，展示 evidence id、
  source、warnings，并复用现有 SourceRefAction 跳转当前 Monaco source。
- 本阶段不依赖真实网络、真实 PostgreSQL 或 sidecar；只推进离线可验证的 Graph
  解释性与源码追溯能力。
- 验证：Knowledge Map Vitest 17/17、desktop typecheck、focused ESLint、desktop build、
  root `pnpm typecheck` 24/24 tasks、root `pnpm test` 23 turbo test tasks + 78 script tests
  + 86 Python tests 均通过。desktop build 仍有已知 Vite `use client` 与 chunk-size
  warning，不影响本阶段功能验证。

P3 Agent audit replay 阶段性完成记录（2026-05-14）：

- 代码提交：`5affb52 feat(storage-postgres)：持久化 Agent audit timeline`、
  `9696778 feat(desktop)：持久化 Agent audit timeline`。
- shared schema 的 `chemd_agent_runs` 新增 `audit_timeline jsonb NOT NULL DEFAULT '[]'::jsonb`，
  并通过 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 兼容已安装 schema；外部 DB 与
  managed Postgres migration 保持同一列契约。
- Desktop runtime persistence payload 现在把 `AgentRun.auditTimeline` 作为 JSON-safe
  `auditTimeline` 写入 agentRuns；Rust Tauri runtime 通过 serde 接收并 upsert 到
  `chemd_agent_runs.audit_timeline`。
- 现有 Agent patch gate 保留：patch proposal 必须先 approve，apply 时校验
  `beforeHash`/approval id，apply 前运行 compile gate；失败时记录 blocked audit event，
  不修改 editor buffer。
- 本阶段补齐数据库 replay 的关键缺口：run/tool/patch 之外，状态转移、evidence
  attach、patch approve/apply/reject/blocked 等 audit event 可以随 Agent run 入库。
- 验证：`@chemd/storage-postgres` Vitest 8 files / 33 tests、desktop runtime
  persistence Vitest 5/5、Rust audit timeline 2 tests、managed migration 1 test、
  storage/desktop typecheck、focused ESLint、desktop build、root `pnpm typecheck`
  24/24 tasks、root `pnpm test` 23 turbo test tasks + 78 script tests + 86 Python
  tests 均通过。desktop build 仍有既有 Vite `use client` 与 chunk-size warnings。

P3 enhanced capability degradation 阶段性完成记录（2026-05-14）：

- 代码提交：`64fd58c feat(desktop)：聚合增强能力降级门禁`。
- `pnpm desktop:release-readiness` 新增 `enhancedCapabilityDegradation` 聚合检查，
  将 PostgreSQL sync、connected RAG、embedding provider、sidecar、Agent patch 五类
  增强能力的 offline/degraded/fallback 边界作为 release readiness JSON 的显式
  `pass` 证据。
- 该检查只做静态产品门禁汇总，不启动 GUI、不联网、不启动 sidecar、不运行真实 DB
  smoke；真实网络和 clean-machine installer smoke 仍保持 `skip/not-run`，不被误报为
  通过。
- 聚合证据来自现有离线可验证能力：local snapshot/outbox、runtime smoke SKIP 分类、
  connected RAG disabled/degraded controller、embedding provider offline/degraded
  result、diagnostics bundle support context、Agent approval/hash/compile gate 与
  audit timeline persistence。
- 验证：`node --test scripts/desktop-release-readiness.test.mjs` 6/6 通过；
  `pnpm desktop:release-readiness -- --json` 输出 `enhancedCapabilityDegradation:
  pass` 且整体仍为 `skip`；`pnpm run test:scripts` 78/78 通过；`git diff --check`
  通过。

### P4：发布质量生产可用

- [ ] installer、签名、升级策略明确。
- [ ] release smoke 覆盖干净机器 Offline Core。
- [x] diagnostics bundle 覆盖 app、sidecar、sync、provider 的静态命令面与支持上下文；
  完整运行期日志包仍归 release hardening。
- [x] 用户文档覆盖离线工作、连接 DB、同步失败恢复。

当前 release 构建状态：

- `pnpm --filter @chemd/desktop tauri:build` 已在 `desktop-ide` 工作树通过。
- 已生成 Windows MSI 与 NSIS 安装包。
- `pnpm desktop:offline-release-smoke` 已在产物生成后通过 artifact preflight。
- 第三轮补充 installer artifact preflight，自动检查 release exe、MSI、NSIS 非空产物与目标 exe 路径锁状态，但仍不等同于 clean-machine 安装后 smoke。
- 第四轮追加 `pnpm desktop:diagnostics-bundle`，生成离线、脱敏 JSON
  diagnostics bundle；当前只覆盖静态产物、命令清单与 preflight 分类，不替代
  app/sidecar/sync/provider 的完整运行期日志包。
- 第五轮扩充 diagnostics bundle provider 覆盖，加入 reaction intelligence worker、
  local artifact、outbox sync command 清单，以及 provider/model/artifact/sync 的
  支持上下文分类；真实 provider/model/DB 未运行时仍按 `SKIP` 记录。
- 还缺少“安装到干净用户环境后启动、打开 workspace、编辑保存、关闭重启恢复”的
  installer Offline Core smoke。

当前 release smoke 前置分类：

- `PASS`：`apps/desktop` scripts、`dist/index.html`、release exe 锁检查、release
  exe、MSI 与 NSIS 产物检查均满足；这只代表 artifact preflight 通过。
- `SKIP`：缺少 dist、release exe、MSI/NSIS installer，或无法可靠检查进程占用；
  这是环境/前置产物不足，不代表产品失败或通过。
- `BLOCKED`：目标
  `apps/desktop/src-tauri/target/release/chemd-desktop.exe` 正由同路径进程运行，
  必要 desktop script 缺失，或产物大小为 `0`；用户需关闭输出中的 PID、修复空产物，
  或改用隔离 `CARGO_TARGET_DIR` 重试。

该脚本仍不等同于 clean-machine installer smoke；真实发布验收还需要在干净用户
环境或隔离 VM 中安装后验证启动、打开 workspace、编辑保存、关闭重启恢复。

diagnostics bundle 同样是支持分层判断工具，不是产品通过证明；若 dist、installer
产物或环境探测缺失，应在 JSON 中标记 `SKIP` / `BLOCKED` 并继续生成诊断包。

用户与支持人员操作说明见
`docs/desktop-ide/user-offline-first-guide.zh-CN.md`；release artifact preflight
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
参考：D:\download\case4_zh.webp

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

---

### M10/M11 阶段性合并记录（2026-05-14）

`desktop-ui` 分支的桌面 UI 重构已作为阶段性成果合入 `desktop-ide`：

- 代码提交：`d49e63c refactor(desktop)：合并桌面 UI 组件化`。
- 合入内容：`App.tsx` 收敛为控制器装配入口，新增 `DesktopShell`、`TopBar`、
  `EditorPane`、`LocalStorePanel`、`PostgresPanel`、`SidecarPanel`、基础 UI
  primitives 与桌面 layout/hooks。
- 集成处理：保留并重新接线 connected RAG query/backfill、embedding provider
  状态、Agent timeline contract panel、quick-fix patch gate、workspace index 与
  knowledge map 跳转，不回退 M6/M7 已完成能力。
- 依赖与样式：补入 desktop shadcn/base-ui 依赖、`components.json`、desktop
  radius token，并保持当前 light desktop workbench 风格基线。
- 验证：`pnpm --filter @chemd/desktop typecheck` 通过；focused RAG/Agent
  Vitest 5 files / 36 tests 通过；`pnpm --filter @chemd/desktop build` 通过；
  `git diff --check` 通过。
- 非阻塞债务：focused ESLint 仅剩 `App.tsx`、`DesktopShell.tsx`、
  `LocalStorePanel.tsx`、`TopBar.tsx`、`use-connected-rag-controller.ts` 的
  complexity/max-lines 6 项，按用户指示继续留到最终 M11 复杂度治理，不阻塞
  当前功能产品化主线。

该合并是 M10/M11 的提前基础设施落地，不代表最终视觉验收与复杂度门禁完成；最终
仍需补截图/真实 GUI 手测、UI 组件 API 收敛、props drilling 治理和复杂度清零。

## 9. Release readiness 聚合状态

2026-05-13 追加发布前聚合入口：`pnpm desktop:release-readiness`。该命令只汇总
Desktop runtime preconditions、offline release preflight 与 diagnostics bundle
builder 的离线可验证项，并将 clean-machine installer smoke 与真实网络验证明确标记
为 `skip/not-run`。

说明见 `docs/desktop-ide/release-readiness.zh-CN.md`。
