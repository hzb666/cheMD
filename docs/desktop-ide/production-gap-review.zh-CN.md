# Desktop IDE 生产缺口对齐清单

更新时间：2026-05-12

适用范围：`apps/desktop`、Tauri runtime、PostgreSQL/pgvector、Graph、RAG、Agent、Monaco language service、installer/release。

---

## 1. 当前结论

生产路径已经调整为 offline-first：本地 `.chemd.md` 文档是 source of truth，
离线基本功能必须可用，PostgreSQL/pgvector 是同步与知识增强层，不是启动依赖。

外部 PostgreSQL 路径已经完成 script-level runtime proof：真实远端 DB 可连，
shared schema 可初始化，Graph/RAG/Agent/Patch/outbox reconnect payload 可写入并读回。
这证明同步增强层可行，但它不等于生产 Desktop IDE 已完成。

当前距离生产可用的主要缺口在离线 workspace 可靠性、Monaco 语言服务、本地
snapshot/outbox 产品化、workspace ingest、产品化 Graph/RAG/Agent UI、数据库安全同步、
installer/release smoke 与支持诊断闭环。

---

## 2. 已验证或接近完成

| 状态 | 项目 | 说明 |
| --- | --- | --- |
| 已验证 | 外部 PostgreSQL 端口可达 | `103.24.219.156:5632` 网络连通。 |
| 已验证 | JDBC URL 归一化 | Rust/Tauri runtime 与 Node smoke 均接受 `jdbc:postgresql://...`。 |
| 已验证 | shared schema runtime smoke | 远端 DB 路径完成 migration、pgvector 检查、runtime payload 写入与读回。 |
| 已验证 | reconnect outbox script proof | local outbox entry 可同步到 shared schema，并从 `pending` 变为 `synced`。 |
| 已验证 | 脚本/Rust 回归测试 | JDBC 归一化与 runtime smoke 相关测试已覆盖。 |
| 接近完成 | runtime 边界文档 | runtime boundaries、PostgreSQL schema、offline local-store、distribution 文档已存在。 |
| 接近完成 | Tauri command surface | workspace、managed Postgres、local store、outbox sync、Graph/RAG persistence command 已接入。 |

---

## 3. 生产前必须补齐的门槛

### P0：离线核心必须先补

| 状态 | 缺口 | 为什么重要 | 建议下一步 |
| --- | --- | --- | --- |
| 未验证 | 无 DB/无网络/无 sidecar 的真实 app smoke | 生产路径要求离线基本功能可用，不能只证明 DB 路径。 | 用干净环境验证启动、打开 workspace、编辑、保存、compile、preview。 |
| 未完成 | workspace 文件可靠性 | 本地文档是 source of truth，保存和外部修改冲突不能丢数据。 | 补原子保存、dirty state、外部变更检测、reload/keep local 流程。 |
| 未实现 | Monaco editor | 生产 IDE 不能长期停留在 textarea。 | 先落 diagnostics/source range，再扩 completion/hover/quick fix。 |
| 未完成 | 本地 snapshot/outbox 产品化 | local store 不再只是测试兜底，而是正式离线同步队列。 | 补 UI 状态、失败重试、重启恢复、冲突显示。 |
| 未验证 | release installer Offline Core smoke | 需要证明安装产物在干净机器上离线可用。 | 构建安装包后跑启动、编辑保存、重启恢复、导出 diagnostics。 |

### P1：生产 IDE 核心体验

| 状态 | 缺口 | 为什么重要 | 建议下一步 |
| --- | --- | --- | --- |
| 未完成 | `packages/language-service` | Graph/RAG/Agent 与编辑器都需要统一 source range、diagnostics、quick fix contract。 | 按 `desktop-language-service-contract` 实现可独立测试的 service core。 |
| 未完成 | workspace batch ingest | 本地优先路径也需要批量 ingest workspace，DB sync 应排在本地 ingest 之后。 | 先生成本地 revisions/artifacts/outbox，再接 PostgreSQL sync。 |
| 未完成 | connection profile UI | 真实用户不能只靠 env var 配置 DB，但 DB 不应阻塞离线编辑。 | 做连接配置、健康检查、migration 状态、错误脱敏与保存策略。 |
| 未验证 | Tauri command-level sync proof | 当前通过的是 Node script proof，不能证明真实桌面 app command 调用链。 | 在 Offline Core 后配置 `CHEMD_DESKTOP_TAURI_COMMAND_RUNNER` 跑 DB sync smoke。 |
| 未完成 | 生产数据库安全 | 当前验证路径关闭 SSL，且使用开发验证账号，不满足生产安全边界。 | 建立专用 DB/user/schema 权限、凭据轮换、secret storage、网络隔离或 TLS/VPN。 |

### P2：产品深度与发布质量

| 状态 | 缺口 | 为什么重要 | 建议下一步 |
| --- | --- | --- | --- |
| 未完成 | Graph panel 与 evidence 交互 | 当前主要证明数据可写；还没有生产级图谱使用体验。 | 补 graph snapshot/diff、edge evidence、source jump。 |
| 未完成 | RAG embedding/search/backfill | 当前 smoke 证明 chunks/citations，不等于可用搜索。 | 定义 embedding provider、任务状态、失败重试与 citation gate。 |
| 未完成 | Agent tool orchestration | 当前可写 audit/patch proposal，不等于真实 agent 工作流。 | 先做 compile/query-rag/inspect-graph/propose-patch 最小闭环。 |
| 未完成 | Ketcher/RDKit/OCR 桌面端端到端 | 设计目标包含结构编辑、渲染与 OCR，但生产链路仍需验证。 | 补 sidecar lifecycle、Ketcher 回写、OCR fallback 与日志。 |
| 未完成 | crash log/diagnostics/updater/signing | 发布质量不只看功能，还要能诊断、升级和恢复。 | Phase 8 单独开 release hardening 清单。 |

---

## 4. 需要扩充或重新确认的设计点

1. 生产 MVP 边界：
   当前方向已调整为“离线基本功能可用，本地文档优先”。仍需确认首个生产版本
   是否必须包含 Monaco，还是 textarea 只允许作为内部 alpha。

2. 数据库部署模型：
   需要明确是单用户本地 DB、团队共享 DB、还是云托管 DB。不同模型会改变
   schema ownership、migration 权限、tenant 隔离、备份和审计设计。

3. 凭据与连接配置：
   需要设计 connection profile 存储位置、secret storage、日志脱敏、导入导出、
   凭据轮换和失败恢复。不能把生产凭据写入源码、文档或普通配置。

4. managed PostgreSQL 取舍：
   如果保留 bundled managed 路径，需要补完整分发包来源、manifest provenance、
   平台差异、升级策略和数据目录迁移策略。如果砍掉，需要把 offline local-store
   明确为缓存/队列，而不是知识主库。

5. Agent MVP 范围：
   需要确认第一版 Agent 是只读检索/解释，还是允许生成 patch proposal。若允许
   patch，必须保留用户确认、compile gate、audit replay 和 rollback 设计。

6. UI 验收方式：
   设计文档要求桌面 UI 与 Web Playground 视觉语言一致，但缺少可执行截图验收。
   建议补 desktop/web 对照截图、关键状态矩阵和 Playwright/Tauri screenshot smoke。

---

## 5. 建议讨论顺序

1. 先确认 Offline Core 的验收线：是否必须包含 Monaco、preview、diagnostics 与本地 outbox。
2. 再确定本地 store 介质：第一版 JSON，还是直接 SQLite/Tauri store。
3. 然后补 release installer Offline Core smoke，证明干净机器离线可用。
4. 随后做 PostgreSQL sync hardening：connection profile、secret storage、权限、TLS/网络策略。
5. 最后按 workspace ingest -> Graph/RAG -> Agent -> sidecar -> release hardening 排序推进。

完整实施路线见
[`offline-first-productization-implementation.zh-CN.md`](./offline-first-productization-implementation.zh-CN.md)。
