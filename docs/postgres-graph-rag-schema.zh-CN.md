# PostgreSQL Graph 与 RAG Schema 计划

状态：架构契约草案
更新时间：2026-05-12
适用范围：`@chemd/storage-postgres`、desktop ingest、reaction graph、RAG、training memory、Agent audit

---

## 1. 目标

PostgreSQL 是 Chemd Desktop 的知识主库。它存储可追溯的实验记录 revision、编译产物、反应 Graph、RAG chunks、embedding、memory 和 Agent audit。

SQLite 如后续引入，只能用于本地 UI 状态和非权威缓存，不能替代 PostgreSQL。

---

## 2. 数据来源

所有持久化数据来自 Chemd 编译产物：

```text
source file
  -> compileChemd()
  -> document
  -> typedSemanticGraph
  -> stepGraph
  -> lnf
  -> ragExport
  -> trainingUnderstanding
  -> trainingExport
  -> graphIndex
```

禁止：

- 数据库 ingest 层重新解析 Chemd source。
- Graph/RAG 层各自实现新的 parser。
- Agent 将无 citation 的自由文本写入知识主库。

---

## 3. 核心实体

### 3.1 Workspace

```sql
CREATE TABLE chemd_workspaces (
  workspace_id text PRIMARY KEY,
  root_uri text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
```

### 3.2 Document

```sql
CREATE TABLE chemd_documents (
  document_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  file_path text NOT NULL,
  title text,
  current_revision_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (workspace_id, file_path)
);
```

### 3.3 Document revision

```sql
CREATE TABLE chemd_document_revisions (
  revision_id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES chemd_documents(document_id),
  source_hash text NOT NULL,
  source_text text NOT NULL,
  compile_status text NOT NULL,
  diagnostic_counts jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (document_id, source_hash)
);
```

### 3.4 Compiled artifacts

```sql
CREATE TABLE chemd_compiled_artifacts (
  revision_id text PRIMARY KEY REFERENCES chemd_document_revisions(revision_id),
  resolved_document jsonb NOT NULL,
  typed_semantic_graph jsonb NOT NULL,
  step_graph jsonb NOT NULL,
  lnf jsonb NOT NULL,
  rag_export jsonb NOT NULL,
  training_understanding jsonb NOT NULL,
  training_export jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

---

## 4. Reaction Graph

### 4.1 Reaction nodes

```sql
CREATE TABLE chemd_reaction_nodes (
  node_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  document_id text NOT NULL REFERENCES chemd_documents(document_id),
  revision_id text NOT NULL REFERENCES chemd_document_revisions(revision_id),
  entity_id text NOT NULL,
  block_id text,
  reaction_family text,
  route_id text,
  source_range jsonb NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

### 4.2 Reaction edges

```sql
CREATE TABLE chemd_reaction_edges (
  edge_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  graph_snapshot_id text NOT NULL,
  from_node_id text NOT NULL,
  to_node_id text NOT NULL,
  edge_type text NOT NULL,
  confidence text NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

Edge types：

- `route_prev`
- `route_next`
- `same_family`
- `same_condition_signature`
- `same_substrate`
- `same_product`
- `campaign_trajectory`
- `semantic_similarity`
- `evidence_link`

### 4.3 Graph snapshots

```sql
CREATE TABLE chemd_graph_snapshots (
  graph_snapshot_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  source_revision_ids jsonb NOT NULL,
  graph_kind text NOT NULL,
  node_count integer NOT NULL,
  edge_count integer NOT NULL,
  created_at timestamptz NOT NULL
);
```

规则：

- 每条 edge 必须有 evidence。
- Evidence 必须包含 document id、revision id、entity id 或 source range。
- Graph UI 只能展示可追溯 edge。

---

## 5. RAG

### 5.1 RAG chunks

```sql
CREATE TABLE chemd_rag_chunks (
  chunk_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  document_id text NOT NULL REFERENCES chemd_documents(document_id),
  revision_id text NOT NULL REFERENCES chemd_document_revisions(revision_id),
  entity_id text,
  block_id text,
  chunk_kind text NOT NULL,
  text text NOT NULL,
  metadata jsonb NOT NULL,
  source_range jsonb NOT NULL,
  quality jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

Chunk kinds：

- `experiment_summary`
- `reaction_condition`
- `procedure_step`
- `observation`
- `result`
- `analysis_evidence`
- `failure_case`
- `route_context`
- `graph_cluster_summary`

### 5.2 Embeddings

```sql
CREATE TABLE chemd_rag_embeddings (
  chunk_id text PRIMARY KEY REFERENCES chemd_rag_chunks(chunk_id),
  provider text NOT NULL,
  model text NOT NULL,
  embedding vector,
  embedding_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
```

规则：

- chunk text 变化后必须生成新的 `embedding_hash`。
- 检索结果必须返回 citation。
- 无 source range 的 chunk 不进入 Agent 上下文。

---

## 6. Semantic diff 与 memory

```sql
CREATE TABLE chemd_semantic_diffs (
  semantic_diff_id text PRIMARY KEY,
  before_revision_id text NOT NULL,
  after_revision_id text NOT NULL,
  diff jsonb NOT NULL,
  quality jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

```sql
CREATE TABLE chemd_training_memory_events (
  event_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  semantic_diff_id text,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
```

规则：

- memory event 必须引用 semantic diff、revision 或 source evidence。
- Agent 不能把无 evidence 的自然语言总结写入 memory 表。

---

## 7. Agent audit

```sql
CREATE TABLE chemd_agent_runs (
  agent_run_id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES chemd_workspaces(workspace_id),
  status text NOT NULL,
  goal text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);
```

```sql
CREATE TABLE chemd_agent_tool_calls (
  tool_call_id text PRIMARY KEY,
  agent_run_id text NOT NULL REFERENCES chemd_agent_runs(agent_run_id),
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);
```

```sql
CREATE TABLE chemd_patch_proposals (
  patch_proposal_id text PRIMARY KEY,
  agent_run_id text REFERENCES chemd_agent_runs(agent_run_id),
  document_id text NOT NULL REFERENCES chemd_documents(document_id),
  base_revision_id text NOT NULL REFERENCES chemd_document_revisions(revision_id),
  patch jsonb NOT NULL,
  status text NOT NULL,
  validation_result jsonb,
  created_at timestamptz NOT NULL,
  applied_at timestamptz
);
```

---

## 8. 查询能力

必须支持：

- 按 workspace 查询最新 document revisions。
- 按 document 查询 revision history。
- 按 reaction family 查询 reaction nodes。
- 按 route 查询 route graph。
- 按 source location 回跳文档。
- 按 vector similarity 查询 RAG chunks。
- 按 citation 过滤 Agent context。
- 按 graph snapshot 查询 edges。
- 按 agent run replay tool timeline。

---

## 9. 与 `@chemd/storage-postgres` 的关系

`@chemd/storage-postgres` 应保持 contract package 定位：

- 可以定义 schema SQL。
- 可以定义 TypeScript record types。
- 可以提供 compiled artifacts 到 records 的 mapping。
- 不打开数据库连接。
- 不执行 migration。
- 不生成 embedding。
- 不执行 Agent run。

Desktop runtime 负责：

- 连接池。
- migration。
- transaction。
- retry。
- embedding provider。
- ingest job。
- query service。

---

## 10. 验收清单

- [ ] 每个 RAG result 都有 citation。
- [ ] 每条 graph edge 都有 evidence。
- [ ] 每个 Agent patch 都有 base revision。
- [ ] 数据库 schema 不要求 source 重新解析。
- [ ] PostgreSQL 不可用时基础编辑功能降级可用。
- [ ] `@chemd/storage-postgres` 不包含 runtime database IO。
