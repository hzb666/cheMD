# Desktop IDE offline local store

## 目标

Offline local store 是桌面 IDE 的本地优先兜底层。外部 PostgreSQL 不可用、
且没有可启动的 managed PostgreSQL binaries 时，桌面运行时仍应把当前
Graph/RAG/Agent 快照写入本地 JSON 文件，形成待同步 outbox。

这个路径不代表数据库持久化成功。它只证明 runtime snapshot 已按
`save_local_runtime_snapshot` 的输入 contract 生成，并能落到本地
`runtime-snapshot.json` 与 `outbox.json`。

## 分层关系

桌面 IDE 持久化分三层：

1. 外部 PostgreSQL：设置 `CHEMD_POSTGRES_DATABASE_URL` 或 `DATABASE_URL`
   时优先使用，写入共享 Graph/RAG/Agent schema。
2. Managed PostgreSQL：没有外部 DB 时，尝试使用 bundled/staged
   PostgreSQL binaries 启动本地托管实例，仍写入共享 schema。
3. Offline local store：外部 DB 与 managed binaries 都不可用时，写入本地
   JSON snapshot/outbox，等待后续同步。

Offline local store 不创建 desktop-only PostgreSQL 表，也不定义新的数据库
schema。在线或 managed DB 可用后，同步目标仍是共享的 Graph/RAG schema，
包括 experiment、revision、RAG chunk、Graph snapshot、agent run、tool
call 与 patch proposal 相关表。

## 本地文件

Tauri runtime 的 local store 根目录来自 app data 目录下的 `local-store`。
script smoke 为了可重复验证，会写入临时目录，或使用显式目录：

```sh
CHEMD_DESKTOP_OFFLINE_SMOKE_DIR=.tmp/desktop-offline-smoke pnpm desktop:offline-core-smoke
CHEMD_DESKTOP_OFFLINE_SMOKE_DIR=.tmp/desktop-offline-smoke pnpm desktop:runtime-smoke
```

offline smoke 写入两个 JSON 文件：

- `runtime-snapshot.json`：最近一次 runtime snapshot。
- `outbox.json`：待同步队列，entry 的 `syncStatus` 为 `pending`。

outbox entry 使用 `idempotencyKey` 去重；相同 snapshot 再次保存会更新已有
pending entry，而不是伪造新的数据库记录。

## Offline Core smoke

`pnpm desktop:offline-core-smoke` 是 M1/M3 的 P0 离线验收入口。它会显式移除
外部 PostgreSQL env 与 managed PostgreSQL env，只验证无 DB、无 managed
binaries、无 sidecar 前提下的本地 runtime snapshot/outbox 写入。

通过时输出：

```text
SKIP database persistence: Offline Core smoke runs with database and managed PostgreSQL env disabled.
Chemd desktop offline core smoke passed.
```

这不是 PostgreSQL 持久化通过。`SKIP database persistence` 只说明本次验收刻意
不使用数据库；`offline core smoke passed` 只证明本地 JSON snapshot/outbox
存在、pending outbox 数量大于 0，且输出不包含 database URL、password、API
key 或完整 env。

## 重连同步语义

当外部 PostgreSQL 或 managed PostgreSQL 可用后，待同步 outbox entry 的
目标仍是共享 PostgreSQL schema。脚本级 smoke 会先写入本地 pending
snapshot/outbox，再用同一 payload 执行 shared Graph/RAG/Agent 持久化：

- 同步成功：entry 的 `syncStatus` 变为 `synced`，`syncedAt` 写入成功时间，
  `failureCount` 归零，`lastError` 清空。
- 同步失败：entry 保留原始 `payload`，`syncStatus` 变为 `failed`，
  `failureCount` 递增，`lastError` 记录有界错误信息，`syncedAt` 保持为空。

这个重连同步不创建 desktop-only PostgreSQL 表；它复用现有 shared schema：
experiment、revision、RAG chunk、Graph snapshot、agent run、tool call 与
patch proposal 相关表。

## 验证命令

脚本单测：

```sh
pnpm test:scripts
```

Offline Core smoke：

```sh
pnpm desktop:offline-core-smoke
```

完整 runtime smoke：

```sh
pnpm desktop:runtime-smoke
```

当外部 DB 存在时，smoke 应输出 PostgreSQL target，并执行数据库写入与读回。
同时会输出 `reconnect outbox sync`，表示脚本级 local outbox payload 已同步到
shared PostgreSQL schema。

当没有外部 DB，但 managed PostgreSQL binaries 可用时，smoke 应输出
managed PostgreSQL target，并执行同一套数据库写入与读回。

当外部 DB 和 managed binaries 都不可用时，smoke 应输出：

- `SKIP database persistence: ...`
- `Chemd desktop offline core smoke passed.`
- offline core store、snapshot 与 outbox 路径
- pending outbox 数量与 graph snapshot id

这里的 `SKIP database persistence` 是环境分类，表示当前机器没有可用
PostgreSQL runtime；后续 local offline 结果只覆盖 JSON outbox contract。

## 已知限制

- Node smoke 无法直接调用 Tauri Rust command；当前验证使用
  `apps/desktop/src/desktop-local-store.ts` 的 TS builder 生成
  `LocalRuntimeSnapshotInput`，再按 Rust local store 文件 contract 写入 JSON。
- Node reconnect smoke 使用同一 payload builder 与 `@chemd/storage-postgres`
  持久化路径模拟 shared schema sync contract；它是 script-level reconnect
  sync smoke，不等同于 `sync_local_outbox_to_postgres` Tauri command runtime
  proof。
- offline smoke 不执行数据库 migration，不验证 pgvector，也不读写共享
  PostgreSQL 表。
- local outbox 只是待同步队列；真正同步到共享 Graph/RAG schema 仍需要在线
  PostgreSQL runtime。
- smoke 输出会展示本地文件路径，但不会打印 database URL、password、API key
  或完整环境变量。
