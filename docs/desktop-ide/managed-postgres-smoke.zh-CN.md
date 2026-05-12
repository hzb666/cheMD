# Desktop IDE managed PostgreSQL smoke

## 运行路径

`pnpm desktop:runtime-smoke` 优先使用外部 PostgreSQL：

- `CHEMD_POSTGRES_DATABASE_URL`
- `DATABASE_URL`

当这两个变量都不存在时，smoke 会尝试使用桌面 IDE 自带的
PostgreSQL binaries 启动本地托管实例，然后执行现有 PostgreSQL
smoke、共享 schema 初始化、runtime Graph/RAG/Agent 持久化与读回验证。

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
明确 `SKIP`。这是环境缺口，不代表 runtime persistence 通过；它只说明当前机器
既没有外部 PostgreSQL，也没有可启动的桌面内置 PostgreSQL。
