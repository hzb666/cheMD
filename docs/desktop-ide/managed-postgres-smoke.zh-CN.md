# Desktop IDE managed PostgreSQL smoke

## 运行路径

`pnpm desktop:runtime-smoke` 优先使用外部 PostgreSQL：

- `CHEMD_POSTGRES_DATABASE_URL`
- `DATABASE_URL`

当这两个变量都不存在时，smoke 会尝试使用桌面 IDE 自带的
PostgreSQL binaries 启动本地托管实例，然后执行现有 PostgreSQL
smoke、共享 schema 初始化、runtime Graph/RAG/Agent 持久化与读回验证。
数据库可用路径还会执行 script-level reconnect sync smoke：先生成本地
pending outbox snapshot，再将同一 payload 写入 shared PostgreSQL schema，
最后把本地 entry 标记为已同步。

如果外部 DB 与 managed PostgreSQL binaries 都不可用，smoke 不会把数据库
路径伪装成成功；它会保留 `SKIP database persistence` 分类，并继续执行
offline local-store contract smoke，验证本地 snapshot/outbox JSON 可生成。
详细说明见 [`offline-local-store.zh-CN.md`](./offline-local-store.zh-CN.md)。

## 开发配置

开发机可通过 `CHEMD_MANAGED_POSTGRES_BIN_DIR` 指向 PostgreSQL 的 `bin`
目录。该目录至少需要包含：

- `initdb`
- `psql`
- `postgres`

smoke 会创建本地托管数据目录、生成临时连接配置、启动自己拥有的
PostgreSQL 进程，并在结束或失败时关闭该进程。日志只输出 host、port、
database、user 和脱敏后的 password，不输出完整 database URL、password、
API key 或完整 env 对象。

## 打包资源目录

桌面打包时预期资源目录提供以下任一布局：

- `<resource_dir>/postgres/bin`
- `<resource_dir>/postgres`

其中 `postgres/bin` 布局与常见 PostgreSQL 分发包一致。smoke 脚本在无外部
DB 时会查找对应的打包资源候选路径；Tauri runtime 侧也按 `resource_dir` 下
的 `postgres/bin` 与 `postgres` 查找。

生产构建前使用 `pnpm desktop:postgres:bundle -- --source <postgres-dist>` 或
`CHEMD_POSTGRES_DIST_DIR=<postgres-dist> pnpm desktop:postgres:bundle` 将本机
或 CI 提供的 PostgreSQL 分发包 staged 到
`apps/desktop/src-tauri/resources/postgres/bin`，再运行
`pnpm desktop:postgres:verify`。详细流程见
[`postgres-bundle-resources.zh-CN.md`](./postgres-bundle-resources.zh-CN.md)。

## SKIP 条件

如果没有外部 DB env，也没有可用的 managed PostgreSQL binaries，smoke 会输出
明确 `SKIP database persistence`。这是数据库环境缺口，不代表 shared schema
runtime persistence 通过；它只说明当前机器既没有外部 PostgreSQL，也没有可启动
的桌面内置 PostgreSQL。随后输出的 local offline smoke 只证明本地 JSON
snapshot/outbox contract 可执行，不能替代数据库持久化验收。

## Reconnect sync 输出

DB 可用时，`pnpm desktop:runtime-smoke` 的关键输出包括：

- `runtime graph: ...`
- `runtime verification: ...`
- `reconnect outbox sync: synced=1, pending=0, failed=0`
- `reconnect proof: script-level local outbox -> shared PostgreSQL smoke; Tauri command runtime proof is not covered.`

这里的 reconnect proof 只覆盖脚本级 contract：local offline snapshot/outbox
payload 能写入 shared PostgreSQL schema，并能把本地 entry 标为 `synced`。
它不等同于 Tauri `sync_local_outbox_to_postgres` command 在真实桌面 runtime
中的端到端证明。
