# Desktop IDE release Offline Core smoke

## 目标

release Offline Core smoke 用来证明安装产物在无 DB、无 managed PostgreSQL、
无 sidecar 的条件下仍能完成本地核心路径。当前阶段提供 installer artifact
preflight：检查 release exe、MSI、NSIS 产物是否存在且大小合理，并把
`tauri:build` 的本地阻塞分类清楚，避免把环境占用或产物缺失误记为产品失败或通过。

它仍不是 clean-machine installer smoke：不会安装应用，不会启动 GUI，也不会验证
安装后的 workspace 编辑、保存、重启恢复。

## Preflight 命令

```sh
pnpm desktop:offline-release-smoke
```

也可以使用同一个入口的显式别名：

```sh
pnpm desktop:installer-offline-smoke
```

该命令只做产物级前置诊断，不会启动 GUI，不会杀进程，也不会读取或打印 env、
database URL、API key 或其他 secrets。

检查项：

- `apps/desktop/package.json` 中存在 `build`、`typecheck`、`tauri:build`。
- `apps/desktop/dist/index.html` 已存在，说明 release build 的 frontend dist
  前置产物可用。
- Windows 上枚举 `chemd-desktop.exe` 进程，并只在
  `apps/desktop/src-tauri/target/release/chemd-desktop.exe` 路径完全匹配时判定
  release exe 锁阻塞。
- `apps/desktop/src-tauri/target/release/chemd-desktop.exe` 存在且大小 `> 0`。
- `apps/desktop/src-tauri/target/release/bundle/msi` 下至少有一个 `.msi`，且大小
  `> 0`。
- `apps/desktop/src-tauri/target/release/bundle/nsis` 下至少有一个 `.exe` installer，
  且大小 `> 0`。

## 分类语义

| 分类 | 含义 | CLI exit code | 下一步 |
| --- | --- | --- | --- |
| `PASS` | desktop scripts、dist、release exe 锁检查、release exe、MSI 与 NSIS 产物检查均满足。 | `0` | 记录 artifact preflight 通过，再执行人工或后续自动化 clean-machine installer smoke。 |
| `SKIP` | 缺少 dist、release exe、MSI/NSIS installer，或当前环境无法可靠检查进程占用。 | `0` | 先生成缺失产物，或在可检测进程的 Windows 环境重跑。 |
| `BLOCKED` | 目标 release exe 正被相同路径的进程占用、必要 desktop script 缺失，或已有产物大小为 `0`。 | `2` | 关闭输出中列出的 PID，修复空产物，或使用隔离 `CARGO_TARGET_DIR` 重试 build。 |

异常脚本错误返回 `1`，这表示 preflight 本身没有完成分类。

## `tauri:build` 锁阻塞

Windows release build 会尝试覆盖旧的
`apps/desktop/src-tauri/target/release/chemd-desktop.exe`。如果同一路径的
release exe 正在运行，Rust linker/build 清理阶段可能返回 `os error 5`。这应
记录为：

```text
BLOCKED installer Offline Core artifact preflight: release-exe-running
```

这不是 Offline Core 产品失败，也不是 release smoke 通过。正确处理方式是让用户
关闭该 PID，或者在明确接受更长 release 编译时间时使用隔离
`CARGO_TARGET_DIR`。

## Clean-machine installer smoke 缺口

artifact preflight `PASS` 后，release 验证仍需要继续：

1. 把 MSI/NSIS 安装到干净用户环境或隔离 VM。
2. 在安装后的 app 上执行 Offline Core smoke：启动、打开 workspace、编辑保存、
   关闭重启并恢复本地状态。
3. 输出中仍应区分 database persistence `SKIP` 与 Offline Core `PASS`；无 DB
   不是失败，PostgreSQL shared schema 持久化也不能被本地 outbox 结果替代。

当前脚本只证明安装包产物存在、非空、目标 release exe 未被同路径进程锁住；不能
替代真实安装后的 Offline Core smoke。

