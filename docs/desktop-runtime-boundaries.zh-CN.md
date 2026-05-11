# Chemd Desktop 运行时边界

状态：架构契约草案
更新时间：2026-05-12
适用范围：Tauri host、React desktop UI、language worker、PostgreSQL runtime、`chem-service` sidecar

---

## 1. 边界原则

Chemd Desktop 采用多运行时架构。每个运行时只拥有自己的职责，不跨层持有不该知道的细节。

核心原则：

1. React UI 负责呈现和交互，不直接访问文件系统、数据库或 sidecar secret。
2. Web Worker 负责语言编译和轻量派生，不管理进程、不访问数据库。
3. Rust/Tauri 负责本地能力、权限、文件系统、sidecar 生命周期和安全边界。
4. PostgreSQL runtime service 负责数据库连接、事务、migration、ingest 和 query。
5. `chem-service` 负责 RDKit、OCR provider、render 和 structure draft，不负责 Chemd 语义。
6. `@chemd/compiler` 仍是 Chemd semantic truth source。

---

## 2. 运行时分层

```text
React UI
  -> Language Worker
     -> @chemd/compiler
  -> Tauri command bridge
     -> Rust host
        -> filesystem
        -> sidecar process
        -> PostgreSQL runtime
  -> HTTP loopback
     -> chem-service sidecar
```

---

## 3. React UI

职责：

- Monaco editor、panels、dialogs、top bar、activity rail。
- Preview、Diagnostics、Graph、RAG、Agent timeline 的展示。
- 用户意图收集，例如打开文件、保存、运行 ingest、接受 patch。
- 调用 Tauri command 或 language worker。

禁止：

- 直接读取任意本地路径。
- 直接读取 PostgreSQL secret。
- 直接向 `chem-service` 发送带 secret 的请求。
- 自行解析 Chemd source 并生成 Graph/RAG 语义。

---

## 4. Language Worker

职责：

- 调用 `compileChemd(source, options)`。
- 派生 Monaco diagnostics、outline、hover data、completion candidates。
- 派生 preview HTML、JSON、LNF、RAG export、training understanding。
- 支持 compile debounce、取消和缓存。

禁止：

- 访问文件系统。
- 打开数据库连接。
- 启动子进程。
- 调用 OCR/RDKit provider。
- 对 source 执行不可见写入。

输入：

```ts
interface CompileRequest {
  requestId: string;
  source: string;
  options: {
    strictChemdKind?: boolean;
    procedureMode?: "auto" | "explicit" | "lowered";
  };
}
```

输出：

```ts
interface CompileResponse {
  requestId: string;
  status: "ok" | "failed";
  result?: CompileResult;
  diagnostics: Diagnostic[];
  error?: {
    code: string;
    message: string;
  };
}
```

---

## 5. Rust/Tauri host

职责：

- workspace 选择、路径授权和文件读写。
- 文件监听、recent workspace、settings、app logs。
- sidecar 启停、health check、stdout/stderr capture。
- 安全地管理 provider/database secret。
- 执行本地发布相关能力，例如 updater、crash log、diagnostics bundle。
- 暴露最小 Tauri command surface。

禁止：

- 重写 Chemd parser/compiler。
- 直接修改 Chemd source 中的语义结构。
- 在未经用户确认时应用 Agent patch。

建议 commands：

```text
open_workspace
list_workspace_files
read_workspace_file
write_workspace_file
watch_workspace
get_recent_workspaces
start_chem_service
stop_chem_service
read_sidecar_logs
check_sidecar_health
get_database_profiles
test_database_profile
run_workspace_ingest
apply_approved_patch
export_diagnostics_bundle
```

---

## 6. PostgreSQL runtime

职责：

- 打开数据库连接。
- 执行 migration。
- 执行 workspace ingest。
- 写入 document revisions、compiled artifacts、RAG chunks、Graph snapshots、Agent audit records。
- 执行 pgvector search 和 Graph query。

边界：

- `@chemd/storage-postgres` 只提供 schema、record types 和 mapping helpers。
- 连接池、事务、upsert 顺序和 runtime config 必须在 desktop runtime service 中实现。
- 数据库不可用时，基础编辑和本地编译仍应可用。

---

## 7. `chem-service` sidecar

职责：

- RDKit molecule normalize/render。
- RDKit reaction render。
- OCR provider adapter。
- Structure draft storage。
- Provider readiness。

运行约束：

- 由 Tauri host 启动和停止。
- 默认只监听 loopback。
- 如果启用 access key，key 只由 Rust host 注入。
- UI 不直接持有 access key。
- sidecar 崩溃时 Rust host 应标记 degraded mode。

---

## 8. Next.js route 迁移规则

Desktop 不复用 Next API routes。迁移规则：

| 当前 Next route 职责 | Desktop 目标位置 |
| --- | --- |
| 纯 compiler/export | Language Worker 或 shared TS service |
| 文件读写 | Tauri command |
| `chem-service` 代理 | Rust sidecar client 或 desktop service layer |
| PostgreSQL ingest/search | Desktop PostgreSQL runtime service |
| session guard | Tauri workspace/session model |
| DOCX/Pandoc export | Tauri command + shared export service |

保留原则：

- 能抽成纯 TypeScript service 的逻辑优先抽出。
- 与 Next request/response 强耦合的代码不进入 desktop 核心。
- 桌面运行时不依赖 `next/server`。

---

## 9. 降级模式

| 失败项 | 可用能力 | 降级提示 |
| --- | --- | --- |
| PostgreSQL 不可用 | 编辑、编译、预览、本地导出 | Graph/RAG/Agent memory disabled |
| `chem-service` 不可用 | 编辑、编译、fallback preview | RDKit/OCR unavailable |
| OCR provider 不可用 | 手写结构、Ketcher 编辑 | OCR provider unavailable |
| embedding provider 不可用 | Graph、非向量检索 | RAG embedding disabled |
| Agent provider 不可用 | 手动 compile/repair/export | Agent disabled |

---

## 10. 验收清单

- [ ] Desktop app 不启动 Next server。
- [ ] UI 无数据库 secret。
- [ ] UI 无 sidecar access key。
- [ ] Language Worker 无文件系统和数据库访问。
- [ ] Graph/RAG/Agent 只消费 compiler/exporter 产物。
- [ ] sidecar 崩溃后 app 可继续编辑。
- [ ] PostgreSQL 不可用时基础编辑可继续。
- [ ] 所有跨层 payload 有 TypeScript 类型或文档契约。
