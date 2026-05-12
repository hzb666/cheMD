# Desktop IDE release Offline Core smoke

## 目标

release Offline Core smoke 用来证明安装产物在无 DB、无 managed PostgreSQL、
无 sidecar 的条件下仍能完成本地核心路径。当前阶段先提供 preflight，把
`tauri:build` 的本地阻塞分类清楚，避免把环境占用误记为产品失败或通过。

## Preflight 命令

```sh
pnpm desktop:offline-release-smoke
```

该命令只做前置诊断，不会杀进程，也不会读取或打印 env、database URL、API key
或其他 secrets。

检查项：

- `apps/desktop/package.json` 中存在 `build`、`typecheck`、`tauri:build`。
- `apps/desktop/dist/index.html` 已存在，说明 release build 的 frontend dist
  前置产物可用。
- Windows 上枚举 `chemd-desktop.exe` 进程，并只在
  `apps/desktop/src-tauri/target/release/chemd-desktop.exe` 路径完全匹配时判定
  release exe 锁阻塞。

## 分类语义

| 分类 | 含义 | CLI exit code | 下一步 |
| --- | --- | --- | --- |
| `PASS` | desktop scripts、dist 和 release exe 锁检查均满足。 | `0` | 运行 `pnpm --filter @chemd/desktop tauri:build`，再执行安装包 Offline Core smoke。 |
| `SKIP` | 缺少 dist，或当前环境无法可靠检查进程占用。 | `0` | 先生成缺失产物，或在可检测进程的 Windows 环境重跑。 |
| `BLOCKED` | 目标 release exe 正被相同路径的进程占用，或必要 desktop script 缺失。 | `2` | 关闭输出中列出的 PID，或使用隔离 `CARGO_TARGET_DIR` 重试 build。 |

异常脚本错误返回 `1`，这表示 preflight 本身没有完成分类。

## `tauri:build` 锁阻塞

Windows release build 会尝试覆盖旧的
`apps/desktop/src-tauri/target/release/chemd-desktop.exe`。如果同一路径的
release exe 正在运行，Rust linker/build 清理阶段可能返回 `os error 5`。这应
记录为：

```text
BLOCKED release Offline Core smoke preflight: release-exe-running
```

这不是 Offline Core 产品失败，也不是 release smoke 通过。正确处理方式是让用户
关闭该 PID，或者在明确接受更长 release 编译时间时使用隔离
`CARGO_TARGET_DIR`。

## Release Offline Core smoke 下一步

preflight `PASS` 后，release 验证仍需要继续：

1. 运行 `pnpm --filter @chemd/desktop tauri:build` 生成 release exe、MSI/NSIS
   installer。
2. 在安装产物上执行 Offline Core smoke：启动、打开 workspace、编辑保存、
   关闭重启并恢复本地状态。
3. 输出中仍应区分 database persistence `SKIP` 与 Offline Core `PASS`；无 DB
   不是失败，PostgreSQL shared schema 持久化也不能被本地 outbox 结果替代。

