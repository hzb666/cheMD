# Chemd Monaco 自动补全与 Snippets PRD

状态：PRD 草案
更新时间：2026-05-13
适用范围：Chemd Desktop IDE、Monaco editor、`@chemd/language-service`、workspace symbol index、snippets、autocomplete、hover、definition、diagnostics quick fix

关联文档：

- [Chemd Monaco 自动补全实施计划](./chemd-monaco-autocomplete-implementation-plan.zh-CN.md)
- [Chemd 语义节点渲染 PRD](./chemd-semantic-node-rendering-prd.zh-CN.md)
- `docs/desktop-ide/offline-first-productization-implementation.zh-CN.md`

---

## 1. 背景

Chemd Desktop IDE 已经进入真正 IDE 化阶段。

根据 `desktop-ide` 工作树当前实现，已完成的基础包括：

- `apps/desktop` 已接入 `@monaco-editor/react` 和 `monaco-editor`。
- `apps/desktop/src/MonacoChemdEditor.tsx` 已注册 `chemd` language id。
- 已有基础 Monarch tokenization、Chemd 浅色主题和 Monaco worker 配置。
- Monaco markers 由 `@chemd/language-service` 输出的 DTO 转换而来。
- `Ctrl/Cmd+S` 已接入现有 workspace save。
- Problems panel、preview、compile output 仍来自 compiler/language-service，不在 Monaco 里重复编译。
- `packages/language-service` 已提供 diagnostics、outline、symbols、quick-fix proposals、Monaco marker/code action adapters、Graph/RAG DTO。

这说明当前缺口不是“是否使用 Monaco”，而是：

```text
Monaco 已经在场，但 Chemd-aware completion/snippet/reference 能力还没有产品化。
```

---

## 2. 产品问题

Chemd 是实验 DSL。用户在编辑 Chemd 时最容易出错的地方不是普通拼写，而是：

- 不知道当前 block 可写哪些字段。
- `kind: molecule | reaction` 容易漏写。
- `reaction:`、`ref:`、`reactants:`、`products:` 需要手写 id。
- `procedure step` 的 `family`、`stage`、`inputs`、`outputs` 字段容易写散。
- `template/use` 有 typed params，但没有模板和参数补全。
- 跨文档引用没有库式索引。
- compiler diagnostics 有 quick fixes，但还没有在 Monaco 中形成完整 code action/provider 体验。

目标是让 Chemd IDE 从“能编辑”变成“能指导用户写对”。

---

## 3. 产品目标

### 3.1 总目标

在 Monaco 中提供 Chemd-aware authoring assistance：

```text
用户输入上下文
  -> language-service 分析
  -> snippets / field completions / reference completions / template completions
  -> Monaco completion provider 展示
  -> compiler diagnostics 与 code actions 修复
```

### 3.2 MVP 目标

MVP 只覆盖高价值、低风险能力：

1. Chemd block snippets。
2. block 内字段名补全。
3. 字段值枚举补全。
4. 当前文档引用补全。
5. workspace 跨文档引用补全的数据合同。
6. diagnostics quick fixes 暴露为 Monaco code actions。

### 3.3 非目标

第一阶段不做：

- 完整 LSP server。
- AI inline completion。
- 自动生成化学事实。
- 自动补全具体反应模板库内容。
- 跨项目远程模板 marketplace。
- 一次性实现 rename 跨文件重写。

---

## 4. 用户场景

### 4.1 新建反应块

用户输入：

```text
rxn
```

触发 snippet：

```chemd
:::chemd #rxn-${1:id}
kind: reaction
reactants: ${2:@mol-a}
products: ${3:@mol-b}
conditions: ${4:solvent | temperature | time}
:::
```

价值：

- 快速创建合法反应块。
- 默认补上 `kind: reaction`，减少 ambiguous kind 诊断。

### 4.2 在 reaction block 内补字段

用户位于：

```chemd
:::chemd #rxn-main
kind: reaction
rea
:::
```

补全建议：

- `reactants:`
- `reagents:`
- `reaction`

排序规则：

- 当前 block 类型支持的字段优先。
- 已出现字段降权或不再重复提示。
- 常用核心字段优先。

### 4.3 引用当前文档实体

用户输入：

```chemd
reactants: @
```

补全建议：

- `@mol-main`
- `@mol-ligand`
- `@mol-base`

每条建议显示：

- kind：molecule
- source line
- summary：name / smiles / role

### 4.4 引用跨文档实体

用户输入：

```chemd
reaction: route-doc#
```

补全建议：

- `route-doc#rxn-step-01`
- `route-doc#rxn-step-02`

每条建议显示：

- document title
- local id
- kind
- source path
- stale 状态

### 4.5 使用模板

用户输入：

```chemd
:::use 
```

补全建议：

- 当前文档内 `:::template` 名称。
- workspace template library 中的模板。
- 后续可扩展内建模板，例如 `esterification.basic.v1`。

选中模板后补全参数骨架：

```chemd
:::use template-name
param_a: ${1:value}
param_b: ${2:value}
:::
```

### 4.6 诊断修复

compiler 输出 `W_CHEMD_KIND_AMBIGUOUS` 后，Monaco 中应显示 code action：

- Insert `kind: molecule`
- Insert `kind: reaction`

这些 action 必须复用 `@chemd/language-service` 已有 quick-fix proposal，不在 Monaco 组件内重新实现 patch 逻辑。

---

## 5. 当前工程基线

### 5.1 已完成

来自 IDE 工作树当前进度：

- `apps/desktop/src/MonacoChemdEditor.tsx`
  - 注册 Chemd language。
  - 设置 language configuration。
  - 设置 Monarch token provider。
  - 定义 Chemd Monaco theme。
  - 接入 markers。
  - 接入 save command。
- `packages/language-service/src/types.ts`
  - 定义 `ChemdEditorDiagnostic`、`ChemdOutlineItem`、`ChemdSymbol`。
- `packages/language-service/src/outline.ts`
  - 从 compile result 生成 outline 和 symbols。
- `packages/language-service/src/monaco-adapter.ts`
  - 把 diagnostics 转 Monaco marker。
  - 把 quick fixes 转 Monaco-like code actions。
- `packages/language-service/tests/language-service.test.ts`
  - 覆盖 diagnostics、outline、symbols、Monaco payload、Graph/RAG records。

### 5.2 还缺

当前尚未看到：

- `registerCompletionItemProvider`。
- snippet registry。
- completion source 分层。
- hover provider。
- definition provider。
- workspace symbol index。
- cross-document reference resolution UI。
- Monaco provider disposal / registration ownership 管理。
- completion/filter/sort 测试。

---

## 6. 功能需求

### 6.1 Snippet registry

需要内置一组基础 snippets：

- `chemd molecule`
- `chemd reaction`
- `result`
- `procedure`
- `procedure step`
- `observation`
- `analysis`
- `template`
- `use`
- `condition-varies`

Snippet 必须满足：

- 使用 Monaco snippet placeholder。
- 不伪造实验事实。
- 默认生成合法字段。
- 不内置具体反应模板内容。
- 支持后续从 workspace template library 追加。

### 6.2 Field completion

字段补全按 block kind 过滤：

| Block | 字段 |
| --- | --- |
| `chemd kind=molecule` | `kind`、`smiles`、`cas`、`name`、`role`、`amount`、`equivalents`、`caption` |
| `chemd kind=reaction` | `kind`、`route`、`prev`、`reactants`、`products`、`conditions`、`reagents`、`catalyst`、`solvent`、`temperature`、`time`、`pressure`、`atmosphere`、`yield`、`conversion`、`selectivity` |
| `result` | `status`、`yield`、`conversion`、`selectivity`、`reaction`、`product`、`notes` |
| `procedure` | `ref`、`reaction`、`evidence`、`step` |
| `step` | `family`、`stage`、`purpose`、`inputs`、`outputs`、`dependsOn`、`evidence`、`confidence` |
| `template` | `params`、`bind`、`description`、`body` |
| `use` | template params |

字段建议来源应复用 parser/core 的字段合同，避免手写两套枚举长期漂移。

### 6.3 Value completion

基础枚举：

- `kind`: `molecule`、`reaction`
- `status`: `success`、`failed`、`partial`、`pending`
- `stage`: `reaction_setup`、`reaction`、`workup`、`purification`、`analysis`
- `step.family`: `charge`、`add`、`stir`、`heat`、`cool`、`quench`、`extract`、`wash`、`dry`、`concentrate`、`purify`、`analyze`

这些枚举第一阶段作为 authoring suggestions，不应被当作完整本体。

### 6.4 Reference completion

按上下文过滤：

- `reactants`、`products`、`inputs` 优先 molecule / artifact。
- `reaction`、`prev` 优先 reaction。
- `product` 优先 molecule / product-like entity。
- `evidence` 可提示 result、analysis、observation、artifact。
- `ref` 根据所在 block 类型混合排序。

补全结果分两类：

- 当前文档 symbols。
- workspace symbols。

### 6.5 Template completion

模板建议来源：

- 当前文档 `:::template`。
- workspace template documents。
- 后续内建 template library。

模板补全必须显示：

- template name。
- params。
- typed param specs。
- description。
- source document。

### 6.6 Hover

Hover MVP：

- hover symbol reference 显示 kind、id、source document、summary。
- hover diagnostic marker 显示 code、message、quick fix count。
- hover template name 显示 params 和 description。

### 6.7 Go to definition

Definition MVP：

- 当前文档内 `@mol-a` 跳到 `:::chemd #mol-a`。
- 跨文档 `doc#rxn-a` 跳到对应 document 和 range。
- 如果目标文档未打开，返回 open-document intent，由 desktop app 执行。

### 6.8 Code actions

Code action 必须复用：

- `ChemdQuickFixProposal`
- `toMonacoCodeActions`
- compiler/language-service patch

MVP 不要求做所有 quick fix，只要求当前已有 proposal 能被 Monaco code action provider 使用。

---

## 7. 数据合同

### 7.1 Completion request

```ts
export interface ChemdCompletionRequest {
  source: string;
  documentUri?: string;
  position: ChemdEditorPosition;
  triggerKind: "manual" | "trigger-character" | "typing";
  triggerCharacter?: string;
  compileOutput?: ChemdLanguageCompileOutput;
  workspaceIndex?: ChemdWorkspaceSymbolIndex;
}
```

### 7.2 Completion item

```ts
export interface ChemdCompletionItem {
  id: string;
  label: string;
  kind:
    | "snippet"
    | "field"
    | "value"
    | "reference"
    | "template"
    | "quick_fix";
  insertText: string;
  insertTextFormat: "plain" | "snippet";
  detail?: string;
  documentation?: string;
  sortText?: string;
  filterText?: string;
  range: ChemdSourceRange;
  data?: Record<string, unknown>;
}
```

### 7.3 Workspace symbol

```ts
export interface ChemdWorkspaceSymbol {
  symbolId: string;
  documentUri: string;
  documentId: string;
  localId: string;
  kind: ChemdOutlineKind | string;
  label: string;
  range: ChemdSourceRange;
  summary?: string;
  sourceHash?: string;
  stale?: boolean;
}
```

### 7.4 Workspace symbol index

```ts
export interface ChemdWorkspaceSymbolIndex {
  version: "chemd-workspace-symbol-index/v0.1";
  generatedAt: string;
  symbols: ChemdWorkspaceSymbol[];
  diagnostics: ChemdEditorDiagnostic[];
}
```

---

## 8. 排序规则

Completion 排序按以下优先级：

1. 当前上下文精确匹配。
2. 当前文档 symbol。
3. 同 workspace symbol。
4. 最近使用 symbol。
5. snippets。
6. 低置信 fallback。

同类建议中：

- required fields 优先。
- 已存在字段降权。
- 产生现有 diagnostics 的修复项优先。
- stale workspace symbol 降权并标记。

---

## 9. 质量要求

### 9.1 不重复编译

Completion provider 不应每次键入都完整编译。它应优先消费已有 `compileOutput`，必要时做轻量文本上下文分析。

### 9.2 不伪造事实

snippets 只能生成结构，不生成具体实验事实。

例如可以生成：

```chemd
temperature: ${1:room temperature}
```

但不应自动填：

```chemd
yield: 92%
```

### 9.3 可离线

所有 MVP completion 必须离线可用。

### 9.4 provider 可释放

Monaco provider 注册必须可 dispose，避免热更新或文件切换后重复注册。

---

## 10. 验收标准

### 10.1 Snippets

- [ ] `molecule`、`reaction`、`result`、`procedure` snippets 可在 Monaco 中触发。
- [ ] snippet 使用 tabstop。
- [ ] snippet 插入后文档仍可编译。

### 10.2 Field completion

- [ ] 在 reaction block 中提示 reaction 字段。
- [ ] 在 molecule block 中提示 molecule 字段。
- [ ] 已存在字段不重复高亮提示。

### 10.3 Reference completion

- [ ] 当前文档 `@` 后提示本文件 symbols。
- [ ] `reaction:` 字段只优先提示 reaction。
- [ ] `reactants:` 字段只优先提示 molecule。

### 10.4 Cross-document index

- [ ] workspace ingest 或文件扫描能生成 symbol index。
- [ ] 补全中可显示 `doc#id`。
- [ ] stale 或 unresolved reference 有诊断或 UI 标记。

### 10.5 Code actions

- [ ] Monaco marker 对应 quick fix 可通过 code action 触发。
- [ ] patch 应用后 source hash 校验一致。

---

## 11. 风险

### 11.1 与 parser 字段合同漂移

风险：

- completion 字段列表和 parser 支持字段不一致。

处理：

- 抽出共享 field schema 或由 parser/core 导出 field registry。

### 11.2 Completion 触发太吵

风险：

- DSL 编辑中弹窗过频会干扰写作。

处理：

- `:`、`@`、`#`、空 block header 作为主要触发点。
- 普通 typing 只在明确字段前缀时触发。

### 11.3 跨文档索引过重

风险：

- 每次输入都扫描 workspace。

处理：

- workspace ingest 负责增量索引。
- Monaco provider 只读内存 index snapshot。

### 11.4 Quick fix 破坏用户未保存内容

风险：

- patch 基于旧 source 生成，应用到新 buffer 可能错位。

处理：

- 使用 `beforeHash` 校验。
- hash 不匹配时要求重新 compile。

---

## 12. 推荐决策

1. 补全核心放在 `@chemd/language-service`，Monaco 只做 adapter。
2. snippets、field、value、reference、template 分 source 实现。
3. workspace symbol index 是跨文档引用库的核心资产。
4. 不做完整 LSP，先做 Monaco provider。
5. code actions 复用现有 quick-fix proposal。
6. 第一阶段不引入 AI completion，保证离线和可预测。

---

## 13. 参考依据

当前 IDE 工作树依据：

- `apps/desktop/src/MonacoChemdEditor.tsx`
- `apps/desktop/package.json`
- `packages/language-service/src/types.ts`
- `packages/language-service/src/outline.ts`
- `packages/language-service/src/monaco-adapter.ts`
- `packages/language-service/tests/language-service.test.ts`
- `docs/desktop-ide/offline-first-productization-implementation.zh-CN.md`

当前主线语言依据：

- `packages/core/src/ast.ts`
- `packages/parser/src/body/block-parsers/chemd.ts`
- `packages/parser/src/body/block-parsers/procedure.ts`
- `packages/parser/src/body/parse-children.ts`
- `packages/resolver/src/index.ts`
- `packages/resolver/src/template-params.ts`
