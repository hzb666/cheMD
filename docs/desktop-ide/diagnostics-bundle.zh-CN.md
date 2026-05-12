# Desktop IDE diagnostics bundle

`pnpm desktop:diagnostics-bundle` 生成一个离线、脱敏的 JSON 支持诊断包。
它用于支持人员判断问题层级，不等同于产品验收通过证明。

## 运行边界

该命令只做本地只读采样：

- 不启动 Desktop GUI。
- 不启动 sidecar、PostgreSQL、同步任务或 provider。
- 不打开网络连接。
- 不读取 `.env` 文件。
- 不输出完整 URL、token、password、API key 或任意 env 原值。
- 不读取任意日志目录或任意大文件。

缺少本地产物、未配置离线 smoke 目录、未运行真实服务时，诊断包应输出
`SKIP`。这代表环境或前置产物不足，不代表功能通过或失败。

## 输出内容

当前诊断包包含：

- platform、Node 版本与 git commit。
- desktop package、`dist/index.html`、release exe/MSI/NSIS 产物摘要。
- 已知 Desktop Tauri command 名称清单。
- runtime preflight 与 release preflight 的脱敏分类摘要。
- selected env name 信号；只记录是否配置，值统一脱敏。
- support context：
  - 可选离线 smoke 目录信号。
  - `runtime-snapshot.json` 与 `outbox.json` 的小文件摘要。
  - 支持人员可运行的相关命令清单。
  - sidecar、logs、sync、provider、Tauri command smoke 的未运行 `SKIP` 边界。

## 离线 smoke 目录摘要

如果设置了 `CHEMD_DESKTOP_OFFLINE_SMOKE_DIR`，命令会只读检查该目录。
它只尝试摘要固定文件：

- `runtime-snapshot.json`
- `outbox.json`

单文件超过 64 KiB 时不会读取内容，只输出 `SKIP file-too-large`。摘要只包含
条目数量、状态计数、metadata key 等结构信号，不输出 payload、local id、
idempotency key、URL 或凭据。

## 支持判断

常见分类含义：

- `ready`：对应本地前置检查满足。
- `skip`：未配置、缺少产物或该诊断命令按边界不运行真实服务。
- `blocked`：本地前置条件存在明确阻塞，例如必要脚本缺失或产物为空。
- `unknown`：状态值不在已知集合内，需要人工查看 detail。

支持人员可按顺序使用：

```sh
pnpm desktop:diagnostics-bundle
pnpm desktop:offline-core-smoke
pnpm desktop:runtime-smoke
pnpm desktop:offline-release-smoke
```

其中 diagnostics bundle 是最低成本入口；后续 smoke 命令才会根据自身边界执行
更重的本地验证。

## Tauri command 边界

桌面端同时暴露 `export_diagnostics_bundle` Tauri command，作为产品内支持闭环的
最小离线导出能力。该 command 与脚本版保持相同安全边界：只写入系统临时目录中的
脱敏 JSON，不启动 GUI 外部进程、不联网、不读取 `.env`，也不要求 sidecar 或
PostgreSQL 可用。sidecar、任意日志目录、数据库检查、provider 与 Tauri command
smoke 均在 bundle 内标记为 `SKIP`。
