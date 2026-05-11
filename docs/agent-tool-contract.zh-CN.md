# Chemd Agent Tool Contract

状态：架构契约草案
更新时间：2026-05-12
适用范围：Desktop Agent Orchestrator、RAG、Graph、repair、patch preview、audit replay

---

## 1. 目标

Chemd Agent 是受控工作流执行器，不是拥有任意权限的聊天框。

Agent 可以：

- 读取当前文档、diagnostics、Graph 和 RAG context。
- 解释问题。
- 提出 repair 或 authoring patch。
- 比较实验。
- 推荐下一步实验。
- 调用受控工具。

Agent 不可以：

- 静默修改文件。
- 绕过用户确认应用 patch。
- 绕过 compile diagnostics gate。
- 使用无 citation 的 RAG 内容作为事实。
- 直接访问数据库 secret 或 sidecar access key。

---

## 2. 编排模型

```text
Agent Run
  -> tool call
  -> evidence collection
  -> proposal
  -> user review
  -> approved apply
  -> recompile
  -> persist audit
```

每个 Agent run 必须有：

- goal。
- workspace id。
- target files。
- tool call timeline。
- retrieved evidence。
- patch proposals。
- validation result。
- final status。

---

## 3. Tool 输入输出通用结构

```ts
export interface AgentToolCallInput<T> {
  agentRunId: string;
  workspaceId: string;
  toolName: string;
  payload: T;
}

export interface AgentToolCallOutput<T> {
  toolCallId: string;
  status: "ok" | "failed" | "blocked";
  payload?: T;
  error?: {
    code: string;
    message: string;
  };
  evidence: AgentEvidence[];
}
```

Evidence：

```ts
export interface AgentEvidence {
  kind: "source" | "diagnostic" | "rag" | "graph" | "revision" | "tool-output";
  documentId?: string;
  revisionId?: string;
  filePath?: string;
  entityId?: string;
  blockId?: string;
  sourceRange?: ChemdSourceRange;
  summary: string;
}
```

---

## 4. 标准工具

### 4.1 `compile_current_file`

用途：编译当前 editor source。

输入：

```ts
interface CompileCurrentFileInput {
  documentUri: string;
  source: string;
}
```

输出：

```ts
interface CompileCurrentFileOutput {
  diagnosticCounts: {
    error: number;
    warning: number;
    info: number;
  };
  diagnostics: ChemdEditorDiagnostic[];
  documentId: string;
  compileHash: string;
}
```

约束：

- 只能调用 Language Service 或 compiler。
- 不写文件。
- 不写数据库。

### 4.2 `validate_workspace`

用途：批量编译 workspace 中的 Chemd 文档。

输入：

```ts
interface ValidateWorkspaceInput {
  includeGlobs: string[];
  excludeGlobs?: string[];
}
```

输出：

```ts
interface ValidateWorkspaceOutput {
  filesChecked: number;
  filesFailed: number;
  diagnosticsByFile: Array<{
    filePath: string;
    diagnosticCounts: Record<string, number>;
  }>;
}
```

### 4.3 `query_rag`

用途：查询 PostgreSQL/pgvector 中的 Chemd RAG chunks。

输入：

```ts
interface QueryRagInput {
  query: string;
  filters?: {
    reactionFamily?: string;
    minYield?: number;
    maxYield?: number;
    chunkKinds?: string[];
    documentIds?: string[];
  };
  limit: number;
}
```

输出：

```ts
interface QueryRagOutput {
  results: Array<{
    chunkId: string;
    text: string;
    score: number;
    citation: AgentEvidence;
  }>;
}
```

约束：

- 没有 citation 的 result 必须丢弃。
- Agent 最终回答必须能引用 result evidence。

### 4.4 `inspect_reaction_graph`

用途：查询 reaction graph、route、cluster、edge evidence。

输入：

```ts
interface InspectReactionGraphInput {
  graphSnapshotId?: string;
  nodeId?: string;
  routeId?: string;
  reactionFamily?: string;
  depth?: number;
}
```

输出：

```ts
interface InspectReactionGraphOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: AgentEvidence[];
}
```

约束：

- edge 必须带 evidence。
- Graph 不重新解析 source。

### 4.5 `semantic_diff`

用途：比较两个 revision 或两个 source。

输入：

```ts
interface SemanticDiffInput {
  beforeRevisionId?: string;
  afterRevisionId?: string;
  beforeSource?: string;
  afterSource?: string;
}
```

输出：

```ts
interface SemanticDiffOutput {
  summary: string;
  diff: unknown;
  evidence: AgentEvidence[];
}
```

### 4.6 `propose_repair`

用途：根据 diagnostics 生成修复提案。

输入：

```ts
interface ProposeRepairInput {
  documentUri: string;
  source: string;
  diagnosticCodes?: string[];
}
```

输出：

```ts
interface ProposeRepairOutput {
  proposals: PatchProposal[];
}
```

约束：

- 只返回 patch proposal。
- 不应用 patch。

### 4.7 `apply_approved_patch`

用途：应用用户已批准的 patch。

输入：

```ts
interface ApplyApprovedPatchInput {
  patchProposalId: string;
  userApprovalId: string;
}
```

输出：

```ts
interface ApplyApprovedPatchOutput {
  applied: boolean;
  newRevisionId?: string;
  validationResult: {
    diagnosticCounts: Record<string, number>;
    blocked: boolean;
  };
}
```

约束：

- 必须校验 `baseRevisionId` 或 `beforeHash`。
- 应用后必须重新 compile。
- 如果 error diagnostics 增加，默认 blocked。

---

## 5. Patch Proposal

```ts
export interface PatchProposal {
  patchProposalId: string;
  documentId: string;
  baseRevisionId?: string;
  beforeHash: string;
  title: string;
  rationale: string;
  edits: ChemdTextEdit[];
  evidence: AgentEvidence[];
}
```

UI 展示要求：

- 显示 diff。
- 显示 rationale。
- 显示 evidence。
- 显示预计影响。
- 用户可以 accept、reject、regenerate。

---

## 6. Agent 状态机

```text
created
  -> running
  -> waiting_for_approval
  -> applying_patch
  -> validating
  -> completed
  -> failed
  -> blocked
  -> canceled
```

规则：

- `waiting_for_approval` 不能自动跳过。
- `applying_patch` 只能由用户确认触发。
- `validating` 必须运行 compile。
- `completed` 需要有 final summary 和 tool timeline。

---

## 7. 安全规则

- Agent 工具不接收任意 shell command。
- Agent 工具不接收任意 SQL。
- Agent 不能读取 workspace 之外的文件。
- Agent 不能直接调用 provider secret。
- Agent 不能把无 citation 的内容写入 memory。
- Agent patch 必须有 source evidence。
- 用户确认是应用 patch 的唯一入口。

---

## 8. 验收清单

- [ ] 每个 tool call 有输入、输出、状态和 evidence。
- [ ] 每个 patch proposal 有 base hash。
- [ ] Agent 无直接写文件工具。
- [ ] RAG tool 丢弃无 citation 结果。
- [ ] Graph tool 丢弃无 evidence edge。
- [ ] Apply patch 后强制 compile。
- [ ] Agent run 可从数据库完整 replay。
