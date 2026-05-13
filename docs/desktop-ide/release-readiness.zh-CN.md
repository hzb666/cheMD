# Desktop IDE release readiness

`pnpm desktop:release-readiness` 聚合桌面端发布前可离线验证的检查项，输出
console 摘要或 JSON。它用于发布前状态汇总，不等同于真实安装机验收通过证明。

## 运行边界

该命令只聚合本地离线信号：

- 不启动 Desktop GUI。
- 不启动 sidecar、PostgreSQL、同步任务或 provider。
- 不打开网络连接。
- 不读取 `.env` 文件。
- 不运行 runtime smoke 的真实数据库路径。
- 不输出完整 URL、token、password、API key 或 env 原值。

clean-machine installer smoke 与真实网络验证固定输出 `skip/not-run`。这表示验证尚未
执行，不能被解释为通过。

## 命令

```sh
pnpm desktop:release-readiness
pnpm desktop:release-readiness -- --json
pnpm desktop:release-readiness -- --output .tmp/desktop-release-readiness.json
```

默认输出可读 console 摘要。`--json` 输出完整 JSON 到 stdout，`--output <path>`
写入 JSON 文件。

## JSON 契约

顶层字段：

- `schemaVersion`：当前为 `1`。
- `generatedAt`：生成时间。
- `overallStatus` / `overall.status`：`pass`、`blocked` 或 `skip`。
- `checks`：离线检查项列表。
- `cleanMachineInstallerSmoke`：固定 `status=skip`、`result=not-run`。
- `realNetwork`：固定 `status=skip`、`result=not-run`。
- `boundaries`：声明该命令不会启动 GUI、联网、读取 `.env` 或运行 DB smoke。

聚合规则：

| 状态 | 含义 |
| --- | --- |
| `pass` | 所有聚合检查均通过。实际发布仍需额外 clean-machine smoke。 |
| `blocked` | 至少一个离线检查发现明确阻塞，例如必要脚本缺失或空产物。 |
| `skip` | 离线检查完成，但存在未运行的生产验证或缺少本地产物。 |

由于 clean-machine installer smoke 与真实网络验证固定为 `skip/not-run`，日常发布
readiness 在真实安装机验证完成前通常应保持 `overallStatus=skip`。

## 聚合来源

当前聚合以下纯本地入口：

- Desktop runtime preconditions：复用 `desktop-runtime-smoke` 的前置检查，只判断
  package scripts、Tauri config 与 dist 产物状态。
- Offline release preflight：复用 `desktop-offline-release-smoke` 的 artifact
  preflight，检查 release exe、MSI、NSIS 产物与 Windows release exe 锁。
- Diagnostics bundle builder：构建脱敏 diagnostics bundle 摘要，验证支持上下文可
  离线生成。
- Production smoke placeholders：显式记录 clean-machine installer smoke 与真实网络
  smoke 尚未运行。

## 与其他命令的关系

建议发布前顺序：

```sh
pnpm desktop:offline-core-smoke
pnpm desktop:offline-release-smoke
pnpm desktop:diagnostics-bundle
pnpm desktop:release-readiness -- --json
```

`desktop:release-readiness` 是汇总层，不替代各专项 smoke。若输出 `blocked`，先按
对应 check 的 `reason` 修复；若输出 `skip`，继续补缺失产物或执行真实安装机 smoke。
