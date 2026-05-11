# Chemd Desktop Language Service 契约

状态：架构契约草案
更新时间：2026-05-12
适用范围：`packages/language-service`、Monaco integration、compile worker、desktop editor

---

## 1. 目标

Language Service 把现有 Chemd compiler pipeline 转换为 IDE 能力。它不创建新的语言语义，也不替代 `@chemd/compiler`。

目标：

- Monaco diagnostics。
- syntax tokenization。
- hover。
- completion。
- document outline。
- go to definition/reference。
- quick fix proposal。
- formatting proposal。
- compile result cache。

---

## 2. 包边界

建议新增：

```text
packages/language-service/
  src/
    index.ts
    compile-worker-contract.ts
    diagnostics.ts
    completion.ts
    hover.ts
    outline.ts
    quick-fix.ts
    source-map.ts
    monaco-adapter.ts
```

职责：

- 输入 Chemd source。
- 调用 `compileChemd()`。
- 把 compiler result 映射为 editor-friendly payload。
- 不访问文件系统。
- 不访问数据库。
- 不调用 `chem-service`。
- 不依赖 React。

---

## 3. 输入输出

### 3.1 Compile input

```ts
export interface ChemdLanguageCompileInput {
  source: string;
  documentUri?: string;
  options?: {
    strictChemdKind?: boolean;
    procedureMode?: "auto" | "explicit" | "lowered";
  };
}
```

### 3.2 Compile output

```ts
export interface ChemdLanguageCompileOutput {
  documentUri?: string;
  compiledAt: string;
  result: CompileResult;
  diagnostics: ChemdEditorDiagnostic[];
  outline: ChemdOutlineItem[];
  symbols: ChemdSymbol[];
}
```

### 3.3 Editor diagnostic

```ts
export interface ChemdEditorDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  range: ChemdSourceRange;
  sourceNodeId?: string;
  quickFixes: ChemdQuickFixProposal[];
}
```

### 3.4 Source range

```ts
export interface ChemdSourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
```

Range 使用 1-based line/column。Monaco adapter 负责转换为 Monaco 的 range model。

---

## 4. Diagnostics

来源：

- parser diagnostics。
- resolver diagnostics。
- typechecker diagnostics。
- render-profile diagnostics。
- authoring diagnostics。

规则：

- 不在 Language Service 里重新定义 diagnostic code。
- 如果 compiler diagnostic 缺少精确 range，先映射到 source node 或文档级 range。
- diagnostics 面板必须保留原始 code。
- quick fix 必须能回到 `@chemd/compiler` 的 safe fix 或 authoring patch。

验收：

- Editor gutter、underline、Problems panel 三处 severity 一致。
- 点击 diagnostic 跳转源码。
- diagnostic hover 显示 code、message 和 quick fix。

---

## 5. Completion

Completion 分层：

1. Block completion：`:::chemd`、`:::result`、`:::analysis`、`:::procedure`、`:::observation`、`:::sample`。
2. Field completion：根据 block kind 补字段。
3. Reference completion：`@rxn-main`、`@res-main.yield` 等。
4. Metadata completion：frontmatter keys、render profile、primary aliases。
5. Template completion：`:::template` 和 `:::use`。

规则：

- Completion 不应猜测不存在的实验事实。
- Reference completion 只能来自当前 compile result 的 resolved index。
- 对不完整 source，completion 可以基于 partial parse，但不得报错阻塞输入。

---

## 6. Hover

Hover 内容：

- block kind 说明。
- field 类型和用途。
- reference resolved target。
- diagnostic explanation。
- render profile override 说明。
- quick fix 摘要。

规则：

- Hover 不展示大段 JSON。
- 如果引用未解析，显示 unresolved reason。
- 如果字段参与 Graph/RAG 派生，说明对应下游用途。

---

## 7. Outline 与 Symbols

Outline item：

```ts
export interface ChemdOutlineItem {
  id: string;
  label: string;
  kind: "metadata" | "molecule" | "reaction" | "result" | "analysis" | "sample" | "procedure" | "observation" | "template";
  range: ChemdSourceRange;
  children?: ChemdOutlineItem[];
}
```

用途：

- 文档 outline panel。
- quick open symbol。
- graph node source jump。
- Agent patch preview context。

---

## 8. Quick Fix 与 Patch Proposal

Quick fix 不直接修改 editor 内容。它产出 patch proposal：

```ts
export interface ChemdQuickFixProposal {
  id: string;
  title: string;
  diagnosticCode?: string;
  sourceRange: ChemdSourceRange;
  patch: ChemdTextPatch;
}

export interface ChemdTextPatch {
  beforeHash: string;
  edits: ChemdTextEdit[];
}

export interface ChemdTextEdit {
  range: ChemdSourceRange;
  replacement: string;
}
```

应用规则：

- UI 先展示 diff。
- 用户确认后应用。
- 应用后重新 compile。
- 如果 `beforeHash` 不匹配，拒绝应用并要求重新生成 patch。

---

## 9. Worker 策略

Worker 负责：

- debounce compile。
- cancellation。
- stale response discard。
- result cache。
- error isolation。

建议 request model：

```ts
export interface WorkerRequest {
  requestId: string;
  type: "compile" | "completion" | "hover" | "outline" | "quickFix";
  payload: unknown;
}

export interface WorkerResponse {
  requestId: string;
  status: "ok" | "error" | "stale";
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

---

## 10. 验收清单

- [ ] Language Service 可在非 React 环境测试。
- [ ] 所有 diagnostics 来自 compiler pipeline。
- [ ] Completion 不伪造实验事实。
- [ ] Quick fix 默认只产出 patch proposal。
- [ ] Worker 可以丢弃 stale compile result。
- [ ] Monaco adapter 与核心 language service 分离。
- [ ] Graph/RAG/Agent 使用同一 source range contract。
