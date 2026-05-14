# Desktop IDE release hardening strategy

适用范围：Windows 桌面端安装包、签名、升级、发布验证与支持诊断。

## 当前发布形态

- 构建入口：`pnpm --filter @chemd/desktop tauri:build`。
- 安装包目标：Tauri `bundle.targets = "all"`，当前 Windows 产物包含 release exe、
  MSI 与 NSIS setup。
- 资源策略：`resources/postgres` 随 installer 打包；完整 managed PostgreSQL 分发包
  必须先通过 `pnpm desktop:postgres:bundle -- --source <postgres-dist> --require-full`
  staging，并保留 manifest provenance。
- 发布前离线检查：`pnpm desktop:release-readiness -- --json` 聚合 runtime preflight、
  installer artifact preflight、diagnostics bundle 与 enhanced capability degradation。

## 签名策略

生产发布必须启用 Windows code signing。仓库不保存证书、私钥、PFX、Key Vault
凭据或时间戳服务凭据。

支持两条路径：

- CI 签名命令路径：在 `tauri.conf.json` 的 `bundle.windows.signCommand` 中调用企业
  签名工具，例如 Azure Trusted Signing、Key Vault + relic，或内部签名代理。
- 本机证书路径：在受控 Windows release runner 上使用证书 thumbprint、`sha256`
  digest 与 timestamp URL；证书仅存在于 runner 的安全证书存储中。

验收门禁：

- release exe、MSI、NSIS installer 都必须可被签名验证工具验证。
- 签名失败时不得发布未签名产物。
- diagnostics bundle 与 release-readiness 输出不得打印证书 thumbprint 之外的敏感
  凭据。

## Updater 策略

第一版生产路径默认不启用自动更新，避免在离线优先产品中引入不可控网络依赖。

启用自动更新前必须满足：

- 配置 Tauri updater plugin。
- `bundle.createUpdaterArtifacts = true`，Windows 产物生成 `.sig` 更新签名。
- `plugins.updater.pubkey` 写入公钥，私钥只存在于 release signing 环境。
- `plugins.updater.endpoints` 使用 HTTPS production endpoint，不使用本地或明文 HTTP。
- release metadata 服务支持目标平台、架构、当前版本与回滚策略。
- updater smoke 覆盖：旧版本安装 -> 发现更新 -> 下载 -> 校验签名 -> 安装 -> 启动 ->
  workspace/settings/local outbox 保留。

在自动更新上线前，升级方式为人工下载安装包覆盖安装。覆盖安装必须不删除：

- recent workspace。
- connection profile metadata 与系统 keyring 中的密码。
- local store snapshot/outbox。
- managed PostgreSQL data directory。

## Clean-machine smoke

clean-machine smoke 是真实发布验收，不由本地 release-readiness 伪装完成。

最小流程：

1. 在干净 Windows 用户环境或隔离 VM 安装 MSI 或 NSIS。
2. 断网，且不配置外部 DB、provider 或 sidecar。
3. 启动 Chemd Desktop IDE。
4. 打开或创建 workspace。
5. 编辑 Chemd 文档并保存。
6. compile/diagnostics/preview 可用。
7. 生成 local snapshot/outbox。
8. 关闭并重启，确认 workspace、buffer、local snapshot/outbox 可恢复。
9. 导出 diagnostics bundle，确认 secrets redacted，DB/provider/sidecar 按 `SKIP`
   分类。

该流程完成前，`release smoke 覆盖干净机器 Offline Core` 保持未完成。

## 发布前命令顺序

```sh
pnpm install --frozen-lockfile
pnpm --filter @chemd/desktop build
pnpm --filter @chemd/desktop tauri:build
pnpm desktop:offline-core-smoke
pnpm desktop:offline-release-smoke
pnpm desktop:diagnostics-bundle
pnpm desktop:release-readiness -- --json
```

如包含 managed PostgreSQL installer path，在 `tauri:build` 前追加：

```sh
pnpm desktop:postgres:bundle -- --source <postgres-dist> --require-full
```

## 发布判定

- 可以发布内部测试版：artifact preflight pass、diagnostics bundle pass、enhanced
  capability degradation pass，且签名策略已在 release runner 中配置。
- 可以发布生产版：内部测试版条件 + clean-machine Offline Core smoke pass + signed
  artifacts verified。
- 不可发布：签名失败、installer 产物为空、release exe 被同路径进程锁定、clean-machine
  smoke 失败、或 diagnostics bundle 泄露敏感信息。
