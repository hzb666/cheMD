# chemd 重构路线图

## 文档目的

本文档汇总当前 `chemd` 仓库的文件级拆分建议、重复能力扫描结果、目标架构边界与重构优先级。

本文档只回答三个问题：

1. 现在的代码主要卡在什么地方。
2. 哪些能力已经重复、但还没有被独立出来。
3. 后续应该按什么顺序重构，才能优先提升可维护性与可扩展性。

本文档不包含具体代码改动，也不等同于实现计划。

---

## 重构目标

本次重构的首要目标是：

- 提升可维护性：降低单文件复杂度，减少跨层耦合。
- 提升可扩展性：为新语法、新渲染器、新导出格式预留清晰边界。

本次重构的明确边界是：

- 允许激进拆分。
- 允许重划包边界。
- 允许新增 package。
- 不以“最少改动”为优先。
- 不直接引入完整插件系统，避免过度设计。

---

## 当前架构判断

当前仓库在“包级分层”上已经具备基础清晰度：

- `packages/core` 负责 AST、诊断与共享类型。
- `packages/parser` 负责 chemd 源文本解析。
- `packages/resolver` 负责语义校验、引用解析与模板展开。
- `packages/render-profile` 负责渲染参数与 profile 解析。
- `packages/renderer-*` 负责不同输出格式。
- `packages/compiler` 负责总编排。
- `apps/web` 负责 playground UI。

核心链路也比较明确：

`source -> parser -> resolver -> render-profile -> renderer-* -> web`

问题不在“包完全混乱”，而在“包内职责开始堆积”和“可复用能力还埋在具体输出层中”。

---

## 当前主要问题

### 1. 单文件过大，职责聚集

以下文件已经明显超过舒适维护范围：

- `packages/parser/src/index.ts`：约 1096 行
- `packages/renderer-html/src/index.ts`：约 806 行
- `packages/renderer-svg/src/index.ts`：约 552 行
- `packages/render-profile/src/index.ts`：约 536 行
- `packages/resolver/src/index.ts`：约 435 行

这些文件内部同时承担多种责任，导致：

- 阅读成本高
- 改动面大
- 测试粒度粗
- 新功能容易继续堆到原文件里

### 2. 输出层内嵌了可复用能力

两个典型例子：

- `packages/renderer-html/src/index.ts` 不只是 HTML renderer，已经承担了半个 markdown 引擎。
- `packages/renderer-svg/src/index.ts` 不只是 SVG renderer，已经承担了简化版 SMILES 解析与结构草图能力。

这意味着：

- 输出格式和领域能力耦合过深。
- 以后增加新输出格式时，很难复用既有能力。

### 3. 共享规则重复实现，且已有分叉风险

当前有几类规则在不同层被重复实现：

- markdown 链接安全判断
- render selection 合并
- render option 约束与 adapter payload 清洗
- 节点字段展示清单
- 前端 DOCX 下载流程

其中有些重复已经开始出现“数值约束不一致”的问题，这比普通 helper 重复更危险。

---

## 已确认的重复能力

### A. 前端 DOCX 导出流程重复

以下两个组件分别维护了几乎相同的导出逻辑：

- `apps/web/src/features/preview/components/PreviewShell.tsx`
- `apps/web/src/features/diagnostics/components/DiagnosticsShell.tsx`

重复内容包括：

- `parseFileNameFromContentDisposition`
- `fetch("/api/export/docx")`
- 读取 `blob`
- 创建临时下载链接
- 下载失败处理
- 导出状态与提示信息

这类重复应该抽成：

- `useDocxExport`
- `parseContentDispositionFilename`

备注：当前 `DiagnosticsShell` 已经未被页面使用，说明重复代码已经开始漂移。

### B. Markdown 链接安全策略重复

以下两个位置都在维护链接安全白名单：

- `packages/parser/src/index.ts`
- `packages/renderer-html/src/index.ts`

前者在 token 化阶段做 `safe` 判断，后者在渲染阶段再次检查协议和路径。

这类能力应该抽成共享策略，例如：

- `@chemd/markdown-policy`
- 或 `packages/markdown/src/link-policy.ts`

目标是只保留一套可复用规则，让解析和渲染都依赖同一策略。

### C. RenderSelection 合并逻辑重复

以下两个位置都维护了 `RenderSelection` 合并逻辑：

- `packages/parser/src/index.ts`
- `packages/compiler/src/index.ts`

两边都需要合并：

- `profileId`
- `overrides`

这说明它已经不是某个单层的私有逻辑，而是领域层共享能力。

建议抽成：

- `packages/core/src/render-selection.ts`
- 或单独 `packages/render-profile/src/render-selection.ts`

### D. 渲染参数约束与清洗逻辑重复，且已分叉

这组问题是当前最值得优先处理的重复之一。

重复位置：

- `packages/render-profile/src/index.ts`
- `packages/renderer-svg/src/index.ts`

`render-profile` 负责 profile 解析和数值约束，`renderer-svg` 又对 adapter payload 做了一套自己的范围清洗。

目前已确认的分叉包括：

- `bondLength` 在 `render-profile` 上限是 `80`，在 `renderer-svg` 清洗逻辑里允许到 `120`
- `reaction.arrowLength` 在 `render-profile` 上限是 `180`，在 `renderer-svg` 清洗逻辑里允许到 `240`

这意味着：

- 同一个参数在不同层的合法值不一致
- 最终渲染结果可能不符合 profile 层约束
- 后续调试时会出现“上层通过、下层改写”的隐性行为

建议抽成单一来源：

- 一个共享的 render constraint 模块
- renderer 只消费“已约束后的安全输入”，不再自定义第二套规则

### E. 节点字段展示清单重复

以下两个 renderer 都在手工维护对象节点的字段展示：

- `packages/renderer-html/src/index.ts`
- `packages/renderer-docx/src/index.ts`

重复字段包括：

- `Reactants`
- `Products`
- `Yield`
- `Conversion`
- `Selectivity`
- `SMILES`
- `Instrument`
- `Sample ID`
- `Bind`
- `Params`

这意味着每次为节点新增字段，都要同步修改多个 renderer。

建议抽成统一 schema，例如：

- `packages/core/src/presentation-schema.ts`
- 或新建 `packages/presentation-model`

renderer 只关心如何输出，不再各自决定字段枚举。

### F. 结构草图能力尚未独立

`packages/renderer-svg/src/index.ts` 中的简化 SMILES 解析与布局能力，目前虽未在多个文件重复，但已经具备独立能力特征：

- `parseSmilesSketch`
- 草图 edge/atom model
- 线性布局逻辑

当前这部分同时服务：

- molecule 渲染
- reaction fragment 渲染

这类能力已经应该独立，否则未来新增 Canvas、PNG 或更强的 SVG 变体时，会继续复制。

建议抽成：

- `packages/structure-sketch`

---

## 不建议优先抽离的重复

以下重复目前存在，但不建议放到第一优先级：

- `escapeHtml` / `escapeXml`
- `clampNumber`
- `isFiniteNumber`
- `formatNumber`
- 单个 route 文件内部的错误响应构造函数

原因不是这些 helper 没价值，而是它们不是当前架构痛点。

如果先为这些小工具建共享包，收益低，反而会分散重构注意力。

---

## 目标架构边界

建议后续重构收敛到以下结构：

```text
packages/
├─ core/                  # AST、diagnostics、共享类型、共享 schema
├─ parser/                # chemd 语法解析，只做 parse
├─ resolver/              # 语义校验、引用解析、模板展开
├─ render-profile/        # profile 解析、override、约束、adapter payload
├─ markdown/              # markdown block/inline 渲染与链接策略
├─ structure-sketch/      # SMILES 子集解析、草图模型、基础布局
├─ renderer-svg/          # 只负责 SVG 序列化
├─ renderer-html/         # 只负责 document HTML 装配
├─ renderer-json/         # JSON 输出
├─ renderer-docx/         # bridge payload / markdown 输出
├─ compiler/              # 编排 parse/resolve/render，不处理进程或文件系统
└─ export-docx/           # pandoc、临时文件、超时、输出校验
```

### 各层边界要求

#### core

放稳定、纯领域、跨层都会依赖的内容：

- AST
- Diagnostic
- render override path 与 value 规则
- 可选的 presentation schema
- 可选的 render selection helper

#### parser

只负责把文本转换为 AST 与 parser diagnostics，不承担：

- 后置语义解析
- renderer 专属逻辑
- 编排层逻辑

#### resolver

只负责：

- object/template 索引
- 引用解析
- 模板展开
- 必填字段校验

不负责格式输出。

#### render-profile

作为渲染参数的唯一真相来源，负责：

- profile registry
- 继承解析
- override 应用
- 数值约束
- adapter payload 映射

renderer 不应再维护第二套参数合法性定义。

#### markdown

负责 markdown 相关能力：

- inline render
- block render
- link policy
- code fence / table / list / quote

renderer-html、未来 renderer-docx 或其他富文本输出都可复用。

#### structure-sketch

负责轻量结构解释能力：

- SMILES 子集解析
- sketch model
- 布局算法

renderer-svg 或未来其他结构输出格式只消费 sketch model。

#### compiler

只做纯编排：

- parse
- resolve
- profile resolve
- 调用 renderer

不直接承担：

- pandoc
- 子进程管理
- 临时文件
- OS 级路径输出

#### export-docx

负责：

- markdown -> docx
- pandoc 参数拼装
- runner 封装
- 临时文件处理
- 超时和输出存在性校验

---

## 文件级拆分建议

### 1. parser

建议将 `packages/parser/src/index.ts` 拆为：

```text
packages/parser/src/
├─ index.ts
├─ frontmatter/
│  ├─ parse-frontmatter.ts
│  ├─ assign-frontmatter-value.ts
│  ├─ frontmatter-diagnostics.ts
│  └─ yaml-utils.ts
├─ body/
│  ├─ parse-body.ts
│  ├─ parse-children.ts
│  └─ parse-structured-block.ts
├─ inline/
│  ├─ tokenize-references.ts
│  ├─ tokenize-inline-chem.ts
│  ├─ tokenize-inline-code.ts
│  ├─ tokenize-markdown-links.ts
│  └─ markdown-link-policy.ts
└─ shared/
   ├─ source-location.ts
   ├─ patterns.ts
   └─ values.ts
```

`index.ts` 最终只保留 `parseChemd()` 入口。

### 2. renderer-html

建议将 `packages/renderer-html/src/index.ts` 拆为：

```text
packages/renderer-html/src/
├─ index.ts
├─ render-document.ts
├─ render-node.ts
├─ render-structured-node.ts
├─ html-escape.ts
└─ fields/
   ├─ render-field-list.ts
   └─ structured-field-schema.ts
```

同时将 markdown 相关能力迁出到 `packages/markdown`。

### 3. markdown

新增：

```text
packages/markdown/src/
├─ index.ts
├─ render-markdown.ts
├─ render-inline.ts
├─ render-blocks.ts
├─ render-list.ts
├─ render-table.ts
├─ render-code-fence.ts
├─ inline-token-ranges.ts
└─ link-policy.ts
```

### 4. renderer-svg

建议将 `packages/renderer-svg/src/index.ts` 拆为：

```text
packages/renderer-svg/src/
├─ index.ts
├─ options.ts
├─ svg-utils.ts
├─ primitives.ts
├─ render-molecule.ts
├─ render-reaction.ts
├─ render-reaction-side.ts
└─ render-linear-sketch.ts
```

同时将结构草图能力迁出到 `packages/structure-sketch`。

### 5. structure-sketch

新增：

```text
packages/structure-sketch/src/
├─ index.ts
├─ sketch-types.ts
├─ parse-smiles.ts
├─ layout-linear.ts
└─ sketch-errors.ts
```

### 6. render-profile

建议将 `packages/render-profile/src/index.ts` 拆为：

```text
packages/render-profile/src/
├─ index.ts
├─ types.ts
├─ builtin-profiles.ts
├─ resolve-profile.ts
├─ validate-section.ts
├─ apply-overrides.ts
├─ apply-constraints.ts
├─ adapter-payload.ts
└─ diagnostics.ts
```

### 7. resolver

建议将 `packages/resolver/src/index.ts` 拆为：

```text
packages/resolver/src/
├─ index.ts
├─ indexes.ts
├─ validate-nodes.ts
├─ resolve-reference.ts
├─ resolve-markdown.ts
├─ template-context.ts
├─ expand-template.ts
└─ diagnostics.ts
```

### 8. export-docx

建议新增：

```text
packages/export-docx/src/
├─ index.ts
├─ compile-to-docx.ts
├─ export-markdown-to-docx.ts
├─ pandoc-runner.ts
└─ docx-args.ts
```

同时让 `compiler` 保持纯编排。

### 9. web

建议在 `apps/web` 内补齐真正的 feature 边界：

```text
apps/web/src/features/
├─ playground/
│  ├─ hooks/usePlaygroundCompiler.ts
│  ├─ lib/sample-source.ts
│  └─ lib/render-profile-options.ts
├─ export-docx/
│  ├─ hooks/useDocxExport.ts
│  └─ lib/parse-content-disposition-filename.ts
├─ preview/
│  └─ components/PreviewShell.tsx
└─ diagnostics/
   ├─ components/DiagnosticsList.tsx
   ├─ components/InspectTabs.tsx
   └─ components/RenderOptionsSummary.tsx
```

---

## 重构优先级

### P0：立即优先

#### P0-1. 拆 parser

原因：

- 当前最大文件
- 新语法入口都集中在这里
- 再不拆，后续任何语法演进都会继续恶化

#### P0-2. 抽 markdown，并拆 renderer-html

原因：

- markdown 已经形成独立能力
- HTML renderer 当前承担过多职责
- 未来富文本输出会需要复用这套能力

#### P0-3. 抽 structure-sketch，并拆 renderer-svg

原因：

- 领域能力被埋在具体输出层中
- 分子和反应式都在复用它
- 最适合成为独立 package

#### P0-4. 统一 render constraints，消除数值分叉

原因：

- 当前已经出现同一参数的不同上限
- 这是功能正确性风险，不只是代码风格问题

#### P0-5. 前端抽离统一 DOCX export 流程

原因：

- 真实重复已经出现
- 容易漂移
- 拆分成本低、收益立即可见

### P1：高优先级

#### P1-1. 拆 render-profile

原因：

- 内部职责已偏多
- 是后续所有 renderer 的上游规则源

#### P1-2. 拆 resolver

原因：

- 体量已经不小
- 后续模板与引用语法很可能继续增长

#### P1-3. 迁出 export-docx

原因：

- 让 `compiler` 回归纯编排
- 把进程与文件系统操作隔离到基础设施层

### P2：中优先级

#### P2-1. 统一节点字段展示 schema

原因：

- 现在已经在 HTML 和 DOCX renderer 中重复
- 但短期还不至于阻塞核心重构

#### P2-2. 拆 web playground 页面状态

原因：

- 当前 UI 层尚可维护
- 但随着输出模式和导出功能继续增加，页面很快会再次膨胀

---

## 推荐执行顺序

建议按以下顺序推进：

1. `parser`
2. `markdown + renderer-html`
3. `structure-sketch + renderer-svg`
4. `render-profile constraints 统一`
5. `frontend export-docx 复用`
6. `render-profile`
7. `resolver`
8. `export-docx`
9. `presentation schema`
10. `apps/web`

这个顺序的理由是：

- 先切最重、最堵的文件
- 再抽真正可复用的中间能力
- 最后处理基础设施与 UI 表层收尾

---

## 非目标

本轮重构不建议做以下事情：

- 不引入完整插件系统
- 不为了抽小 helper 而新增大量 package
- 不优先处理 `escapeHtml` / `escapeXml` 一类低价值共享
- 不大规模改写 `core`
- 不把所有 renderer 一次性重写为统一框架

---

## 判断重构是否成功

如果重构完成后达到以下状态，可以认为方向正确：

- `parser`、`renderer-html`、`renderer-svg` 不再由单个超大文件承载主要逻辑
- markdown 渲染逻辑不再内嵌在 HTML renderer 中
- SMILES 子集解析与草图布局不再内嵌在 SVG renderer 中
- render option 的约束规则只有一套真相来源
- 前端 DOCX 导出逻辑只有一个复用实现
- 新增字段、新增语法、新增输出格式时，不再需要同时改多个无关模块

---

## 一句话结论

当前仓库的问题不是“整体架构错误”，而是“包内能力已经堆积，且若干共享规则和中间能力仍埋在具体输出层中”。

最值得优先做的三件事是：

1. 拆 `parser`
2. 抽 `markdown`
3. 抽 `structure-sketch`

最需要立即消除的重复风险是：

1. render constraints 的双重定义与数值分叉
2. 前端 DOCX 导出流程重复
3. markdown 链接安全策略重复
