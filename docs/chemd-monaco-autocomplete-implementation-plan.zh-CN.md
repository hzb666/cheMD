# Chemd Monaco 自动补全实施计划

状态：实施计划草案
更新时间：2026-05-13
适用范围：`packages/language-service`、`apps/desktop`、Monaco providers、workspace symbol index、snippets、autocomplete、hover、definition、code actions

上位文档：

- [Chemd Monaco 自动补全与 Snippets PRD](./chemd-monaco-autocomplete-prd.zh-CN.md)

---

## 1. 当前进度基线

从 `desktop-ide` 工作树检查到的当前状态：

### 1.1 已有 Monaco UI 基础

`apps/desktop/src/MonacoChemdEditor.tsx` 已经完成：

- `@monaco-editor/react` 接入。
- `monaco-editor` worker 配置。
- `chemd` language id 注册。
- `.chemd` / `.chemd.md` 扩展名声明。
- brackets、auto closing pairs 等 language configuration。
- Monarch tokenization。
- Chemd desktop theme。
- markers 同步。
- `Ctrl/Cmd+S` 保存命令。

### 1.2 已有 language-service 基础

`packages/language-service` 已经完成：

- `compileChemdForEditor()`
- diagnostics range 映射。
- outline。
- symbols。
- quick-fix proposals。
- Monaco marker adapter。
- Monaco-like code action DTO。
- Graph/RAG editor records。

### 1.3 尚未完成

当前未看到这些实现：

- completion provider。
- snippets provider。
- hover provider。
- definition provider。
- workspace symbol index。
- cross-document reference completion。
- Monaco code action provider 注册。
- provider 单例/生命周期管理。

---

## 2. 实施原则

### 2.1 分层

```text
@chemd/language-service
  - completion context
  - snippet registry
  - field/value/reference/template sources
  - workspace symbol index types
  - Monaco-neutral DTO

apps/desktop
  - Monaco provider registration
  - editor model interaction
  - open document / go to file command
  - UI lifecycle
```

### 2.2 不重复编译

Completion 不能在每次键入时全量 compile。优先使用当前 compile output：

```text
editor source change
  -> existing compile scheduler
  -> compileOutput
  -> completion provider reads compileOutput snapshot
```

### 2.3 先做确定性补全

第一阶段只做确定性补全：

- snippets
- fields
- enum values
- current document references
- workspace references
- template names

不接 AI，不接远程服务。

---

## 3. 目标文件规划

### 3.1 `packages/language-service`

新增：

```text
packages/language-service/src/completion-types.ts
packages/language-service/src/completion-context.ts
packages/language-service/src/completion-snippets.ts
packages/language-service/src/completion-fields.ts
packages/language-service/src/completion-values.ts
packages/language-service/src/completion-references.ts
packages/language-service/src/completion-templates.ts
packages/language-service/src/completion.ts
packages/language-service/src/workspace-symbols.ts
packages/language-service/src/monaco-completion-adapter.ts
packages/language-service/src/hover.ts
packages/language-service/src/definition.ts
```

新增测试：

```text
packages/language-service/tests/completion.test.ts
packages/language-service/tests/workspace-symbols.test.ts
packages/language-service/tests/monaco-completion-adapter.test.ts
packages/language-service/tests/hover-definition.test.ts
```

### 3.2 `apps/desktop`

新增或修改：

```text
apps/desktop/src/MonacoChemdEditor.tsx
apps/desktop/src/monaco/chemdProviders.ts
apps/desktop/src/monaco/providerDisposables.ts
apps/desktop/src/monaco/ranges.ts
apps/desktop/src/workspace-symbol-index.ts
```

新增测试：

```text
apps/desktop/src/monaco/chemdProviders.test.ts
apps/desktop/src/workspace-symbol-index.test.ts
```

---

## 4. Phase 1：语言服务补全 DTO

目标：在不接 Monaco 的情况下，先让 `@chemd/language-service` 能返回 completion items。

### Task 1.1 定义 completion 类型

新增 `completion-types.ts`：

```ts
export interface ChemdEditorPosition {
  line: number;
  column: number;
}

export interface ChemdCompletionRequest {
  source: string;
  documentUri?: string;
  position: ChemdEditorPosition;
  triggerKind: "manual" | "trigger-character" | "typing";
  triggerCharacter?: string;
  compileOutput?: ChemdLanguageCompileOutput;
  workspaceIndex?: ChemdWorkspaceSymbolIndex;
}

export interface ChemdCompletionItem {
  id: string;
  label: string;
  kind: "snippet" | "field" | "value" | "reference" | "template" | "quick_fix";
  insertText: string;
  insertTextFormat: "plain" | "snippet";
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  range: ChemdSourceRange;
}
```

验收：

- 类型从 `packages/language-service/src/index.ts` 导出。
- 不引入 Monaco 类型依赖。

### Task 1.2 实现 completion context

新增 `completion-context.ts`，识别：

- 当前行文本。
- 当前 block type。
- 当前 block id。
- 当前 field key。
- 当前是否在 field key 位置。
- 当前是否在 field value 位置。
- 当前是否在 `@` reference token 后。
- 当前是否在 `:::use` header 后。
- 当前 block 已有字段集合。

验收：

- 单测覆盖 frontmatter、chemd block、procedure block、step 行、use block。
- 不要求完整 parse，只做编辑器上下文分析。

---

## 5. Phase 2：Snippets

目标：提供可立即提升写作效率的 snippets。

### Task 2.1 建 snippet registry

新增 `completion-snippets.ts`。

内置 snippets：

- `chemd-molecule`
- `chemd-reaction`
- `result`
- `procedure`
- `step`
- `observation`
- `analysis`
- `template`
- `use`
- `condition-varies`

示例：

```ts
{
  id: "snippet.chemd.reaction",
  label: "reaction block",
  insertText: [
    ":::chemd #rxn-${1:id}",
    "kind: reaction",
    "reactants: ${2:@mol-a}",
    "products: ${3:@mol-b}",
    "conditions: ${4:solvent | temperature | time}",
    ":::"
  ].join("\\n"),
  insertTextFormat: "snippet"
}
```

验收：

- snippets 不填真实 yield、温度、产物结构等实验事实。
- snippets 插入后至少是 parser 可接受的结构。

### Task 2.2 Monaco snippet adapter

新增 `monaco-completion-adapter.ts`。

映射规则：

- `insertTextFormat: "snippet"` -> `CompletionItemInsertTextRule.InsertAsSnippet`
- `kind: "snippet"` -> `CompletionItemKind.Snippet`
- `kind: "field"` -> `CompletionItemKind.Field`
- `kind: "reference"` -> `CompletionItemKind.Reference`

验收：

- adapter 单测不依赖 Monaco runtime。
- `apps/desktop` 负责把 enum number 注入实际 Monaco API。

---

## 6. Phase 3：字段和值补全

目标：减少字段写错和漏写。

### Task 3.1 字段 registry

先在 language-service 建本地 registry：

```ts
const FIELD_REGISTRY = {
  molecule: ["kind", "smiles", "cas", "name", "role", "amount", "equivalents", "caption"],
  reaction: ["kind", "route", "prev", "reactants", "products", "conditions", "reagents", "catalyst", "solvent", "temperature", "time", "pressure", "atmosphere", "yield", "conversion", "selectivity"],
  result: ["status", "yield", "conversion", "selectivity", "reaction", "product", "notes"],
  procedure: ["ref", "reaction", "evidence", "step"],
  step: ["family", "stage", "purpose", "inputs", "outputs", "dependsOn", "evidence", "confidence"],
  template: ["params", "bind", "description", "body"]
};
```

后续再把它下沉为 parser/core 共享字段合同。

验收：

- 在字段 key 位置触发。
- 已存在字段降权。
- block type 过滤正确。

### Task 3.2 值补全

基础值：

- `kind`
- `status`
- `stage`
- `family`

验收：

- `kind:` 后提示 `molecule`、`reaction`。
- `stage:` 后提示 `reaction_setup`、`reaction`、`workup`、`purification`、`analysis`。
- `step: ` 行的第一个 segment 提示 step family。

---

## 7. Phase 4：当前文档引用补全

目标：引用不再手写。

### Task 4.1 从 compile output 读取 symbols

使用已有 `compileOutput.symbols` 和 `outline`。

规则：

- 当前文档 symbol 来源为 `compileOutput.symbols`。
- fallback 到 outline 中有 id 的节点。
- 统一转换为 `ChemdWorkspaceSymbol`。

验收：

- `@` 后提示当前文档 symbols。
- `reaction:` 只高优先提示 reaction。
- `reactants:` 高优先提示 molecule。

### Task 4.2 引用上下文过滤

新增 `completion-references.ts`。

字段到 kind 映射：

```ts
reaction -> reaction
prev -> reaction
reactants -> molecule
products -> molecule
inputs -> molecule | artifact | sample
outputs -> molecule | artifact | sample
evidence -> result | analysis | observation | artifact
```

验收：

- 单测覆盖同一 symbol 在不同字段下的排序差异。

---

## 8. Phase 5：Workspace symbol index

目标：为跨文档引用建立“引用库”。

### Task 5.1 定义 workspace symbol index

新增 `workspace-symbols.ts`。

```ts
export interface ChemdWorkspaceSymbol {
  symbolId: string;
  documentUri: string;
  documentId: string;
  localId: string;
  kind: string;
  label: string;
  range: ChemdSourceRange;
  summary?: string;
  sourceHash?: string;
  stale?: boolean;
}

export interface ChemdWorkspaceSymbolIndex {
  version: "chemd-workspace-symbol-index/v0.1";
  generatedAt: string;
  symbols: ChemdWorkspaceSymbol[];
  diagnostics: ChemdEditorDiagnostic[];
}
```

验收：

- 能从一组 `ChemdLanguageCompileOutput` 构建 index。
- symbolId 使用 `documentId#localId`。

### Task 5.2 接 workspace ingest

利用已实现的 workspace ingest runner：

```text
workspace scan
  -> compile file
  -> collect symbols
  -> update in-memory index
```

第一阶段只做内存 index，不强制持久化。

验收：

- 打开 workspace 后可跨文档补全。
- 文件内容变化后 index 更新。
- 编译失败的文件保留 diagnostic，不污染 symbol index。

---

## 9. Phase 6：Template completion

目标：让 `template/use` 机制可用起来。

### Task 6.1 当前文档模板补全

从 `outline` 或 AST 中提取 `template`。

支持：

- `:::use ` 后提示模板名。
- `:::use template-name` block body 内提示该 template 的 params。

验收：

- `params:` typed param 能变成 use block 字段建议。
- 缺参诊断能与字段建议一致。

### Task 6.2 Workspace 模板补全

从 workspace symbol index 提取 template symbols。

验收：

- 跨文档 template 可作为 completion item。
- detail 显示 source document。

---

## 10. Phase 7：Monaco provider 接入

目标：把 language-service DTO 接入 Monaco。

### Task 7.1 Provider registry

新增 `apps/desktop/src/monaco/chemdProviders.ts`。

注册：

- `registerCompletionItemProvider`
- `registerCodeActionProvider`
- `registerHoverProvider`
- `registerDefinitionProvider`

返回：

```ts
export interface ChemdMonacoProviderDisposables {
  dispose(): void;
}
```

验收：

- provider 不重复注册。
- React unmount 时 dispose。
- 热更新不产生多份 suggestions。

### Task 7.2 Completion provider

触发字符：

- `:`
- `@`
- `#`
- 空格

验收：

- Monaco completion popup 显示 snippets、fields、references。
- snippets 可 tabstop。

### Task 7.3 Code action provider

把 `toMonacoCodeActions()` 的结果接到 Monaco。

验收：

- marker quick fix 出现在 lightbulb。
- 应用前校验 `beforeHash`。
- hash 失配时提示重新编译，不应用 patch。

### Task 7.4 Hover provider

hover sources：

- diagnostics。
- current document symbols。
- workspace symbols。
- templates。

验收：

- hover `@mol-a` 显示 kind、range、summary。

### Task 7.5 Definition provider

definition sources：

- current document symbol range。
- workspace symbol range。

验收：

- 当前文档引用跳转到对应 block。
- 跨文档引用返回 open-document intent。

---

## 11. Phase 8：测试与验证

### 11.1 Unit tests

运行：

```bash
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/desktop test
```

如果 package 未配置 test script，则用 workspace 当前测试入口运行对应 Vitest 文件。

### 11.2 Typecheck

运行：

```bash
pnpm --filter @chemd/language-service typecheck
pnpm --filter @chemd/desktop typecheck
```

### 11.3 Desktop build

运行：

```bash
pnpm --filter @chemd/desktop build
```

### 11.4 Manual smoke

手测路径：

1. 打开 desktop IDE。
2. 新建或打开 `.chemd.md`。
3. 输入 `rxn`，确认 snippet。
4. 在 reaction block 内输入 `rea`，确认字段补全。
5. 输入 `reactants: @`，确认当前文档 molecule 补全。
6. 打开 workspace，确认跨文档 `doc#id` 补全。
7. 触发 `W_CHEMD_KIND_AMBIGUOUS`，确认 quick fix 出现在 Monaco code action。

---

## 12. 建议提交顺序

### Commit 1：language-service completion core

范围：

- completion types
- context parser
- snippets
- field/value completion
- tests

### Commit 2：reference and workspace symbols

范围：

- current document reference completion
- workspace symbol index
- workspace reference completion
- tests

### Commit 3：Monaco provider integration

范围：

- provider registration
- completion adapter
- code actions
- hover/definition MVP
- desktop tests

### Commit 4：docs and smoke

范围：

- README/docs 更新
- verification notes
- manual smoke checklist

---

## 13. 风险控制

### 13.1 避免共享字段漂移

短期可在 language-service 放 registry。实施后必须开后续任务，把字段合同下沉到 parser/core。

### 13.2 避免 provider 泄漏

所有 Monaco provider registration 都必须集中在一个 registry 中，返回 dispose handle。

### 13.3 避免跨文档补全卡顿

workspace symbol index 只读内存 snapshot，不在 completion provider 中扫描文件。

### 13.4 避免 quick fix 错位

所有 patch 应用前必须校验 `beforeHash`。失配时重新 compile。

---

## 14. Definition of Done

- [ ] Monaco 中可插入核心 Chemd snippets。
- [ ] Monaco 中可按 block type 补字段。
- [ ] Monaco 中可补当前文档引用。
- [ ] workspace symbol index 能生成并被 completion 使用。
- [ ] Monaco code actions 能应用已有 quick fixes。
- [ ] hover 和 go to definition 至少覆盖当前文档 symbols。
- [ ] 所有 completion 逻辑在 `@chemd/language-service` 有 Monaco-neutral 单测。
- [ ] `apps/desktop` provider lifecycle 有测试或可验证 smoke。
- [ ] `@chemd/desktop build` 通过。
