# Desktop IDE PostgreSQL bundle resources

## 目标

Tauri bundle 会把 `apps/desktop/src-tauri/resources/postgres` 带入安装产物。
桌面 runtime 已按以下路径查找托管 PostgreSQL binaries：

- `<resource_dir>/postgres/bin`
- `<resource_dir>/postgres`

本仓库只提交 staging 目录和说明文件，不提交实际 PostgreSQL 二进制。

## 本地 staging

准备一个本机 PostgreSQL 分发目录。生产构建应优先传入分发根目录，这样脚本会把
`bin`、`share`、`lib` 等同级资源一起 staged 到 `resources/postgres`。本地开发
也可以直接传入 `bin` 目录；这种方式只保证命令发现，不保证完整生产运行时资源。

`bin` 目录至少需要包含：

- `initdb`
- `psql`
- `postgres` 或 `pg_ctl`

Windows 分发包可使用 `.exe` 后缀。

```sh
pnpm desktop:postgres:bundle -- --source /path/to/postgresql-dist
pnpm desktop:postgres:verify
pnpm --filter @chemd/desktop tauri:build
```

也可以通过环境变量提供来源：

```sh
CHEMD_POSTGRES_DIST_DIR=/path/to/postgresql-dist pnpm desktop:postgres:bundle
pnpm desktop:postgres:verify
```

脚本只做本地文件复制与校验，不下载网络资源，不读取或打印数据库 URL、
password、API key 或完整环境变量。

## CI staging

生产 CI 应在 Tauri build 前完成三步：

1. 从 CI 自身的可信 artifact/cache/install step 准备 PostgreSQL 分发目录。
2. 设置 `CHEMD_POSTGRES_DIST_DIR` 或传入 `--source` 后运行
   `pnpm desktop:postgres:bundle`。
3. 运行 `pnpm desktop:postgres:verify`，通过后再执行
   `pnpm --filter @chemd/desktop tauri:build`。

CI 不应把 staged binaries 提交回仓库。它们只属于当前构建工作区。

## 无 staged binaries 的行为

没有 staged binaries 时，`tauri build` 仍可完成资源目录打包，但安装产物不会携带
可启动的 managed PostgreSQL。此时 `pnpm desktop:runtime-smoke` 在没有外部
`CHEMD_POSTGRES_DATABASE_URL` / `DATABASE_URL` 的机器上应报告明确
`SKIP database persistence`，并继续执行 offline local-store smoke，验证本地
`runtime-snapshot.json` 与 `outbox.json` 可生成。这个结果只覆盖本地 JSON
outbox contract；shared Graph/RAG schema 的数据库写入仍需要外部或 managed
PostgreSQL runtime。
