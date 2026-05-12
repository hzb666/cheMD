# Desktop IDE PostgreSQL runtime distribution

## 目标

Desktop IDE 的 PostgreSQL runtime 有三条生产相关路径。它们解决的问题不同，
不能互相替代。

## 外部 DB 在线路径

使用 `CHEMD_POSTGRES_DATABASE_URL` 或 `DATABASE_URL` 指向外部 PostgreSQL。
这是最轻的 installer 路径，因为安装包不需要携带 PostgreSQL binaries。

能力边界：

- 适合已有云数据库、内网数据库或开发者本机 PostgreSQL。
- `desktop:runtime-smoke` 可以验证 shared schema 初始化、Graph/RAG/Agent
  持久化与读回。
- 离线机器无法依赖该路径；无网络或无外部 DB 时应进入 managed 或 offline
  fallback。

## installer bundled managed 路径

构建前通过 `scripts/desktop-postgres-bundle.mjs` 把可信 PostgreSQL 分发包 staged
到 Tauri resource 目录。安装产物携带 `bin`、`share`、`lib` 等完整运行资源后，
Desktop IDE 可以在没有外部 DB env 的机器上启动本地托管 PostgreSQL。

生产构建要求：

- 使用 PostgreSQL 分发根目录，不使用 bin-only 目录。
- 运行 `pnpm desktop:postgres:bundle -- --source <postgres-dist> --require-full`。
- 运行 `pnpm desktop:postgres:verify -- --require-full`。
- 保留 staging manifest 作为当前构建工作区的 provenance，但不提交 binaries。

取舍：

- 安装包体积会明显增加，且每个平台都需要对应的 PostgreSQL 分发包。
- CI 需要管理可信 artifact/cache/install step。
- smoke 能证明当前平台 staged binary 可发现；真实 installer 还需要平台安装包
  层面的验收。

## 无 DB 离线路径

当外部 DB env 不存在，且 installer 也没有可启动的 managed PostgreSQL 时，
runtime 只能使用 offline local-store / outbox。

能力边界：

- local snapshot 与 outbox 是缓存/队列，用于保留待同步 payload。
- 它不是知识主库，不替代 shared PostgreSQL schema。
- `SKIP database persistence` 是环境缺口分类，不是数据库持久化通过。
- 恢复外部 DB 或 managed PostgreSQL 后，reconnect sync 才能把 pending outbox
  写入 shared PostgreSQL。

## bin-only 的定位

bin-only 来源仍允许用于本地开发，因为它能快速验证 `initdb`、`psql`、
`postgres` / `pg_ctl` 的发现逻辑。但它缺少 `share`、`lib` 等完整分发资源，
不能证明安装包在离线机器上可启动 managed PostgreSQL。

bin-only manifest 会写入 `binOnly: true`，`verificationSummary` 也会标明
`not a complete offline distribution proof`。生产构建必须使用 `--require-full`
拒绝该路径。
