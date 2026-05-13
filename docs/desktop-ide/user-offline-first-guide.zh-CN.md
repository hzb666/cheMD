# Chemd Desktop IDE 离线优先用户与支持指南

更新时间：2026-05-13
适用对象：生产用户、现场支持人员、发布验收人员
适用范围：Chemd Desktop IDE、Offline Core、本地 snapshot/outbox、PostgreSQL 同步、diagnostics bundle

---

## 1. 先读结论

Chemd Desktop IDE 的基础工作流不依赖网络或 PostgreSQL。

生产用户应把本地 `.chemd.md` 文档作为权威来源。PostgreSQL 是同步层、知识索引层和团队共享层；它不可用时，编辑、保存、编译、预览和 diagnostics 仍应可用。

支持人员判断问题时先分层：

| 层级 | 成功代表 | 失败或 SKIP 代表 |
| --- | --- | --- |
| Offline Core | 本地 workspace、编辑、保存、compile、preview、diagnostics、snapshot/outbox 可用 | 这是 P0；失败需要优先处理 |
| Database persistence | Graph/RAG/Agent payload 已写入 shared PostgreSQL schema | `SKIP` 通常表示没有外部 DB、没有 managed PostgreSQL，或命令 runner 未配置 |
| Release artifact preflight | release exe、MSI、NSIS 产物存在且未被同路径进程锁住 | `SKIP` 是产物缺失或环境无法检测；`BLOCKED` 是产物为空或 exe 被占用 |
| Clean-machine smoke | 安装到干净环境后可启动、打开 workspace、编辑保存、重启恢复 | 当前仍需人工或后续自动化执行；artifact preflight 不能替代 |
| Diagnostics bundle | 可生成脱敏 JSON 支持包 | 它是分层诊断工具，不是产品通过证明 |

---

## 2. 首次离线启动

### 2.1 前置条件

用户至少需要：

- 已安装 Chemd Desktop IDE。
- 一个本地目录作为 workspace。
- 至少一个 `.chemd.md` 文件，或准备在 workspace 中新建该文件。

不需要：

- 外部 PostgreSQL。
- 网络连接。
- managed PostgreSQL binaries。
- `chem-service` sidecar。
- API key。

### 2.2 启动步骤

1. 断开网络，或保持无数据库配置状态。
2. 启动 Chemd Desktop IDE。
3. 打开本地 workspace。
4. 打开或新建 `.chemd.md` 文件。
5. 输入实验记录内容。
6. 保存文件。
7. 查看 compile、preview 和 Problems/diagnostics。
8. 保存本地 runtime snapshot，确认 pending sync 数量可见。

期望结果：

- 本地文件能保存到 workspace。
- compile diagnostics 能显示源码问题。
- preview 能基于当前 compile result 更新。
- PostgreSQL 状态可以显示未配置或不可用，但不能阻断基础编辑。
- 本地 outbox 可以显示 pending sync。

不应出现：

- 因缺少 `DATABASE_URL` 而无法启动。
- 因 PostgreSQL 不可用而无法保存 `.chemd.md`。
- 本地 outbox 被描述为 PostgreSQL 持久化成功。

---

## 3. 打开 workspace

### 3.1 选择目录

选择包含 Chemd 文档的普通本地目录。建议把 workspace 放在用户可写目录，避免系统目录、只读目录或需要管理员权限的路径。

支持人员排查 workspace 问题时记录：

- workspace 路径是否存在。
- 用户是否有读写权限。
- 目标文件是否是 `.chemd.md`。
- 文件是否被其他编辑器或同步工具占用。

不要把 workspace 放在 PostgreSQL 数据目录、安装目录或临时诊断包目录中。

### 3.2 打开文档

打开 `.chemd.md` 后，IDE 应读取文件内容、文件 hash 和修改时间。保存时会用这些信息检测外部修改。

如果文件被外部修改，IDE 应显示冲突决策：

- **Reload from disk**：丢弃当前 buffer，重新读取磁盘版本。
- **Keep local editing**：保留当前编辑内容，用户稍后再决定如何合并。

不得静默覆盖外部修改。

---

## 4. 编辑、保存、编译、预览与 diagnostics

### 4.1 编辑

使用 Monaco 编辑器编辑 `.chemd.md`。`Ctrl+S` 或 `Cmd+S` 走同一套 workspace 保存流程。

基础编辑路径只依赖本地文件和 compiler pipeline。它不需要数据库连接。

### 4.2 保存

保存成功代表 `.chemd.md` 已写回本地 workspace。保存会优先保护用户内容：

- 保存前检查 base hash。
- 检测外部修改时进入冲突处理。
- 写入过程使用本地文件可靠性策略，避免半写入覆盖。

保存失败时，用户应先保留 editor buffer，不要关闭应用。支持人员应收集 diagnostics bundle 和保存错误摘要。

### 4.3 编译

compile 使用 `compileChemd()` 作为语义来源。compile 成功后，IDE 可以生成 preview、diagnostics、Graph/RAG payload 和本地 snapshot。

compile failed 时：

- preview 可以显示失败状态或保留最近可用状态。
- diagnostics 应指出源码问题。
- 不应把失败 revision 标记为 accepted revision。
- 不应把失败结果伪装成可同步知识记录。

### 4.4 Preview

Preview 是当前编译结果的派生视图。它不是源文档。用户修改内容后，应以保存后的 `.chemd.md` 文件为准。

### 4.5 Diagnostics

Problems/diagnostics 直接来自 compiler/language-service。支持人员应记录：

- diagnostic severity。
- diagnostic code。
- source range。
- 是否有 quick fix proposal。

不要手动推断另一个诊断来源，也不要把 Agent 建议当成 compiler diagnostic。

---

## 5. 本地 snapshot 与 outbox

### 5.1 它们是什么

Offline local store 保存两类派生文件：

- `runtime-snapshot.json`：最近一次本地 runtime snapshot。
- `outbox.json`：待同步队列，通常包含 `pending` entry。

它们是缓存和同步队列，不是知识主库。

### 5.2 状态含义

| 状态 | 用户含义 | 支持判断 |
| --- | --- | --- |
| `pending` | 已在本地保存，等待 PostgreSQL 可用后同步 | 离线可接受，不代表 DB 成功 |
| `synced` | 已同步到 shared PostgreSQL schema | 需要 DB 可用路径证明 |
| `failed` | 同步尝试失败，payload 保留 | 可重试，需看脱敏错误摘要 |
| `skipped` | 当前条目不需要或不能同步 | 不是失败，需看原因 |

### 5.3 重要边界

- 本地 outbox 不应保存数据库密码、API key、token 或完整 env。
- `idempotencyKey` 用于避免重复同步生成重复知识记录。
- 相同 snapshot 重复保存应更新同一 pending entry，而不是制造重复成功。
- PostgreSQL 不可用时，UI 应显示 local/offline 状态和 pending sync count。

---

## 6. 连接 PostgreSQL

### 6.1 支持的连接来源

Desktop runtime 和 smoke 优先使用：

```text
CHEMD_POSTGRES_DATABASE_URL
DATABASE_URL
```

标准 URL 示例：

```text
CHEMD_POSTGRES_DATABASE_URL=postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>?sslmode=require
```

JDBC 风格 URL 示例：

```text
CHEMD_POSTGRES_DATABASE_URL=jdbc:postgresql://<HOST>:<PORT>/<DATABASE>?user=<USER>&password=<PASSWORD>&sslmode=require
```

文档、截图、日志和工单中不得写真实密码。需要展示时使用：

```text
postgresql://<USER>:[REDACTED]@<HOST>:<PORT>/<DATABASE>
```

### 6.2 配置原则

生产配置应遵守：

- 凭据由系统安全存储、环境注入或受控部署系统提供。
- 不把密码写进源码、文档、截图、工单正文或普通配置文件。
- 日志只显示 host、port、database、user 和 `[REDACTED]` password。
- 外部 DB 与 managed DB 都写入 shared Chemd PostgreSQL schema。
- 不创建 `desktop_*` 或 `chemd_desktop_*` 私有表来绕过共享 schema。

### 6.3 验证连接

有 PostgreSQL 运行时时，支持人员可运行：

```sh
pnpm desktop:runtime-smoke
```

期望看到：

```text
runtime graph: ...
runtime verification: ...
reconnect outbox sync: synced=1, pending=0, failed=0
```

如果看到：

```text
SKIP database persistence: ...
Chemd desktop offline core smoke passed.
```

说明当前机器没有可用 PostgreSQL runtime，或者缺少必要 runner。它不是数据库持久化通过，但 Offline Core 仍可能通过。

---

## 7. 同步失败恢复

### 7.1 用户操作

当 UI 显示 pending 或 failed sync：

1. 先确认本地 `.chemd.md` 已保存。
2. 不要删除 workspace 文件。
3. 检查 PostgreSQL profile 或环境变量是否恢复。
4. 确认网络、VPN、数据库账号和 pgvector/schema 状态。
5. 重新触发 sync pending/outbox。
6. 同步成功后确认 pending count 下降，失败 count 清零或减少。

### 7.2 支持排查顺序

按以下顺序判断：

1. Offline Core 是否可用。
2. 本地 `outbox.json` 是否存在 pending 或 failed entry。
3. PostgreSQL URL 是否已配置，且日志已脱敏。
4. 数据库是否可达。
5. pgvector 是否可用。
6. shared schema migration 是否 ready。
7. `sync_local_outbox_to_postgres` 或 runtime smoke 是否有 command-level proof。

如果失败发生在 DB 不可达、runner 未配置或 binaries 缺失，记录为环境 `SKIP` 或环境阻塞。不要把它写成 Offline Core 产品失败。

### 7.3 重试与冲突

同步重试必须幂等。支持人员处理失败 entry 时：

- 保留原始 pending/failed payload。
- 记录 `failureCount` 和脱敏 `lastError`。
- 不手工编辑 outbox 内的 runtime payload。
- 不删除本地 `.chemd.md`。
- 如果本地文档已变化，重新 compile 并生成新的 revision payload。

---

## 8. 导出 diagnostics bundle

### 8.1 命令

```sh
pnpm desktop:diagnostics-bundle
```

可指定输出路径：

```sh
pnpm desktop:diagnostics-bundle -- --output <OUTPUT_PATH>
```

### 8.2 包含内容

diagnostics bundle 是脱敏 JSON。它记录：

- 平台和 Node 版本。
- 当前 git commit。
- desktop package 信息。
- frontend dist 和 release artifacts 摘要。
- 已知 desktop command 名称。
- runtime/release preflight 分类摘要。
- 选定 env 信号名及脱敏状态。

### 8.3 不包含内容

diagnostics bundle 不会：

- 启动 GUI。
- 打开网络连接。
- 读取 `.env` 文件。
- 执行重型 database smoke。
- 输出完整 database URL。
- 输出 password、API key、token 或原始 secret。

### 8.4 支持使用方式

支持人员收到 bundle 后先看分类：

- `PASS`：该检查项在当前前提下通过。
- `SKIP`：前置环境或产物不足，不能证明失败或成功。
- `BLOCKED`：有明确阻塞，例如 release exe 被占用或产物为空。
- `not-run-by-diagnostics-bundle`：bundle 只记录分类，不运行对应重型检查。

---

## 9. Clean-machine smoke 与 SKIP 解释

### 9.1 Artifact preflight 不是 clean-machine smoke

以下命令只检查产物和本机前置状态：

```sh
pnpm desktop:offline-release-smoke
pnpm desktop:installer-offline-smoke
```

它们不会安装应用，不会启动 GUI，也不会验证用户环境下的 workspace 编辑保存。

### 9.2 真正的 clean-machine Offline Core smoke

发布前应在干净用户环境或隔离 VM 中执行：

1. 安装 MSI 或 NSIS installer。
2. 启动 Chemd Desktop IDE。
3. 不配置 PostgreSQL。
4. 打开本地 workspace。
5. 新建或打开 `.chemd.md`。
6. 编辑并保存。
7. 查看 diagnostics 和 preview。
8. 生成本地 snapshot/outbox。
9. 关闭应用并重新启动。
10. 确认 recent workspace、文件内容和 pending sync 状态恢复。

验收记录必须明确：

- Offline Core 是否通过。
- Database persistence 是否 `PASS`、`SKIP` 或 `BLOCKED`。
- 是否生成 diagnostics bundle。
- 是否存在 release exe 锁、权限问题或安装器问题。

### 9.3 常见 SKIP 文案

| 输出 | 含义 | 下一步 |
| --- | --- | --- |
| `SKIP database persistence` | 没有可用外部 DB、managed binaries 或 DB proof 前置 | 配置 DB 或 staged managed PostgreSQL 后重跑 |
| `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER` 未配置 | 没有真实 Tauri command-level proof runner | 配置 runner 后验证 command path |
| installer artifact `SKIP` | dist、release exe、MSI/NSIS 缺失，或环境无法检测 | 先运行 build 或换可检测环境 |
| diagnostics `not-run-by-diagnostics-bundle` | bundle 只采集分类，不执行该 heavy check | 另行运行对应 smoke |

`SKIP` 不是通过，也不一定是失败。它表示当前环境不能证明该层能力。

---

## 10. 支持工单最小信息

支持人员创建工单时至少收集：

- Desktop IDE 版本或 git commit。
- 操作系统和安装方式。
- 是否离线。
- workspace 路径类型，不要上传敏感路径截图。
- 受影响的 `.chemd.md` 文件名。
- 操作步骤：启动、打开、编辑、保存、compile、preview、sync。
- diagnostics bundle。
- smoke 命令和原始分类输出。
- PostgreSQL target 摘要：host、port、database、user，password 必须写 `[REDACTED]`。
- 是否运行过 clean-machine smoke。

不要收集：

- 明文数据库密码。
- 完整 connection URL。
- API key、token。
- 未脱敏 `.env` 文件。
- 包含未授权实验数据的完整 workspace。

---

## 11. 参考命令

```sh
pnpm desktop:offline-core-smoke
pnpm desktop:runtime-smoke
pnpm desktop:offline-release-smoke
pnpm desktop:installer-offline-smoke
pnpm desktop:diagnostics-bundle
git diff --check
```

命令结果报告时使用以下格式：

```text
Command: <COMMAND>
Result: PASS | SKIP | BLOCKED | FAIL
Evidence: <关键输出，不包含 secret>
Scope: Offline Core | Database persistence | Release artifact | Clean-machine | Diagnostics
```

---

## 12. 相关文档

- [Offline local store](./offline-local-store.zh-CN.md)
- [Managed PostgreSQL smoke](./managed-postgres-smoke.zh-CN.md)
- [PostgreSQL runtime distribution](./postgres-runtime-distribution.zh-CN.md)
- [Release Offline Core smoke](./release-offline-smoke.zh-CN.md)
- [Offline-first productization implementation](./offline-first-productization-implementation.zh-CN.md)
