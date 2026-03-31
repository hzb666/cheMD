# chemd v0.1 架构文档（中文更新版）

状态：中文翻译并根据当前代码更新  
更新时间：2026-03-31

---

## 1. 架构目标

v0.1 架构需要满足以下目标：

1. `chemd` 文档继续保持纯 Markdown 文件形态。
2. 化学和实验对象被解析为结构化 AST 节点。
3. 系统支持轻量引用与模板复用。
4. 渲染风格通过独立的 render profile 控制。
5. 同一份源文档可以驱动 HTML、JSON、SVG 等多种输出。
6. 整体实现足够小，能在 v0.1 阶段快速迭代。

当前代码状态：
- 1 到 5 已经落到第一版可运行实现。
- 第 6 点也基本成立，当前 monorepo 规模仍可控。

---

## 2. 非目标

v0.1 不尝试提供：
- 图形化分子编辑器
- 完整桌面 ELN 产品
- 完整双向 DOCX 编辑
- 任意编程式模板语言
- 全领域标准化分析 schema
- 每根键的手工坐标编辑

当前代码状态：
- 与非目标范围一致，没有过度扩展。

---

## 3. 技术栈

推荐技术方向：
- TypeScript
- Node.js / 浏览器双运行时
- monorepo

当前代码实际采用：
- `pnpm workspace`
- `turbo`
- TypeScript
- Next.js 15
- React 19
- Vitest

说明：
- 架构文档里提到的 `unified` / `remark` / `KaTeX` / `RDKit.js` 仍属于目标方案。
- 当前代码是更轻量的 MVP 实现，尚未接入这些依赖。

---

## 4. 核心边界：语义 AST vs Render Options

这是当前代码里已经成立的最重要边界。

### 4.1 语义 AST 包含
- frontmatter meta
- `molecule` / `reaction` / `result` / `analysis` / `sample`
- references
- templates / uses
- diagnostics

### 4.2 Render Options 包含
- 选中的 profile id
- 文档级 overrides
- 结构渲染参数
- reaction 布局参数
- export 参数

### 4.3 当前代码实现
- 语义 AST 在 `@chemd/core`
- 解析在 `@chemd/parser`
- 引用和模板展开在 `@chemd/resolver`
- profile 解析在 `@chemd/render-profile`
- 编译阶段通过 `compileChemd()` 汇总两者

当前判断：
- 这条边界已经落实得比较干净，是目前代码质量最稳的一部分。

---

## 5. 系统流水线

理想流水线：

```text
source .md
  -> frontmatter parse
  -> markdown parse
  -> chemd block parse
  -> AST normalization
  -> object indexing
  -> template indexing
  -> reference resolution
  -> template expansion
  -> validation
  -> render profile resolution
  -> render adapter mapping
  -> output renderers (HTML / JSON / SVG / DOCX bridge)
```

当前代码实际流水线：

```text
source string
  -> parseChemd()
  -> resolveChemd()
  -> resolveRenderProfileWithDiagnostics()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

说明：
- 当前已经具备完整可运行流水线。
- parser 仍是轻量实现，不是真正 YAML / Markdown parser。
- render profile 解析已经有基础运行时校验，并支持文档级 overrides。
- render adapter payload 已接入 HTML / SVG / DOCX bridge 主链路，但真实化学渲染后端仍未完成。

---

## 6. Monorepo 结构

当前实际目录：

```text
chemd/
  apps/
    web/
  packages/
    compiler/
    core/
    parser/
    render-profile/
    renderer-html/
    renderer-json/
    renderer-svg/
    resolver/
  docs/
```

与目标结构对比：
- 已有：`core`、`parser`、`resolver`、`render-profile`、`renderer-html`、`renderer-json`、`renderer-svg`、`compiler`、`web`
- 已有：`renderer-docx` 也已接入最小导出链路
- 未有：独立 `react` 包

当前判断：
- 对 v0.1 来说，这个结构已经足够继续开发。
- `compiler` 作为聚合入口是当前工程里的合理补充。

---

## 7. 各包职责

### 7.1 `@chemd/core`
职责：
- AST 类型
- diagnostics 类型
- 创建辅助函数

当前状态：已实现并稳定。

### 7.2 `@chemd/parser`
职责：
- frontmatter 解析
- `chemd` block 解析
- `:chem[...]` 与 `@...` token 化
- 模板体结构化解析
- `render_overrides` 前置提取

当前状态：
- 已实现基础版本。
- 已支持模板体内嵌套 `use` 的结构化节点。
- 已支持 frontmatter 一层 object map，当前用于 `render_overrides`。
- 尚未是真正 YAML / Markdown parser。

### 7.3 `@chemd/resolver`
职责：
- 对象索引
- 模板索引
- 引用解析
- 模板展开
- 语义校验

当前状态：
- 已实现。
- 已覆盖重复模板、未知模板、无效 `primary_*`。
- 已支持嵌套模板展开和模板循环检测。

### 7.4 `@chemd/render-profile`
职责：
- profile 注册
- 继承解析
- fallback
- diagnostics
- 基础 schema validation
- 文档级 overrides 合并

当前状态：
- 已有可诊断解析。
- 已支持 unknown field warning 与基础值校验。
- 已支持 dotted path 的 overrides 合并。
- 仍缺更完整 schema / adapter 约束。

### 7.5 `@chemd/renderer-html`
职责：
- 输出 HTML 预览
- 渲染结构化块和 inline chemistry

当前状态：
- 已可用。
- 结构化块字段输出已补齐到当前 AST 范围。
- 已支持标题、列表、引用块、代码块、表格与常见行内语义子集，但仍不是完整 Markdown AST renderer。

### 7.6 `@chemd/renderer-json`
职责：
- 输出结构化 JSON

当前状态：已实现。

### 7.7 `@chemd/renderer-svg`
职责：
- molecule / reaction SVG 输出

当前状态：
- 已支持线性 SMILES 子集草图渲染与 reaction 片段布局。
- 已处理空 `reactants/products` 和复杂输入的可解释回退文案。
- 尚未接 RDKit 或其他真实绘图后端。

### 7.8 `@chemd/compiler`
职责：
- 把 parse / resolve / profile / render 串成统一 API

当前状态：已实现。

### 7.9 `apps/web`
职责：
- 三栏 playground / demo UI

当前状态：
- 已具备三栏布局。
- 已支持源码编辑、profile 切换与去抖实时重编译，仍是偏开发调试取向的 playground。

---

## 8. AST 结构现状

当前 AST 可分为三层：

1. 文档层：`ChemdDocument`
2. 节点层：`MarkdownNode` 与各类 `StructuredNode`
3. token 层：references、inline chemistry

模板相关 contract 当前是：
- `TemplateNode.body` 已经是结构化子节点数组，而不是单段字符串。
- 这使 resolver 可以递归展开 `use`，并在展开链上检测循环。

render 相关 contract 当前是：
- `ChemdDocument.renderSelection` 已同时承载 `profileId` 与 `overrides`。
- `RenderOptions` 仍保持独立，不回写进语义 AST。

架构意义：
- 语义层 contract 已经明显优于最初的“模板体纯 markdown”实现。
- render-profile 文档级覆盖也已经有稳定挂载点。
- 后续若继续升级 Markdown AST 或 adapter，不需要推倒现有主链路。

---

## 9. 渲染系统

### 9.1 HTML
当前状态：
- 可渲染 meta、diagnostics、结构化块、inline chemistry、resolved references。
- 已在 reaction / molecule 中嵌入 SVG。

### 9.2 JSON
当前状态：
- 输出 document、diagnostics、render profile 结果。

### 9.3 SVG
当前状态：
- 已输出线性 SMILES 子集草图与 reaction 片段布局。
- 对超出子集的输入会回退为可解释文本，不适合作为最终化学图质量标准。

### 9.4 DOCX
当前状态：
- 已实现最小 DOCX bridge 与 Pandoc 导出链路。

---

## 10. Web 界面状态

理想 v0.1 playground：
- 左：编辑器
- 中：预览
- 右：JSON / diagnostics / render profile

当前 Web 实现：
- 左：可编辑源码输入 + profile 切换
- 中：真实 HTML 预览
- 右：diagnostics + render options + normalized JSON

当前判断：
- 已有“开发调试壳”。
- 已具备基础 playground 交互，但仍偏开发调试用途。

---

## 11. 当前架构阶段判断

结合代码现状，当前更适合定义为：

**语义主链路已打通，模板系统已进入可递归展开的闭环阶段，render-profile 已进入基础可校验并支持 overrides 的阶段，渲染层仍是可运行但轻量的适配阶段。**

这意味着：
- 包边界已经稳定到可以继续分阶段推进。
- parser / resolver contract 风险已明显下降。
- 但 frontmatter 完整性和真实渲染后端都还没完成。

---

## 12. 下一阶段建议

推荐阶段：`v0.1 规范收口阶段`

优先顺序：
1. `parser`
2. `render-profile`
3. `renderer-html` / `renderer-svg`
4. `web`

理由：
- 模板循环检测和 overrides 都已经补齐，resolver / profile 主风险已下降。
- 现在最大的剩余不确定性在 frontmatter contract 和 renderer adapter。
- 如果过早推进真实化学渲染或复杂交互，后续 parser / profile contract 变动仍会造成返工。

---

## 13. 具体切入建议

### 第一优先级
- `packages/parser/src/index.ts`
- `packages/parser/tests/parser.test.ts`

目标：
- 更完整的 frontmatter contract
- 更清晰的 Markdown node model
- 更多 parser diagnostics

### 第二优先级
- `packages/render-profile/src/index.ts`
- `packages/render-profile/tests/render-profile.test.ts`

目标：
- 更完整 schema validation
- 更多内建 profile
- adapter mapping contract

### 第三优先级
- `packages/renderer-html/src/index.ts`
- `packages/renderer-svg/src/index.ts`
- `apps/web/src/app/page.tsx`

目标：
- 更完整 HTML 渲染
- 更真实的结构 / 反应图 adapter
- 更接近 playground 的交互体验

---

## 14. 架构结论

当前工程已经具备继续推进 v0.1 的正确基础：
- monorepo 结构合理
- 语义与渲染边界清晰
- 编译入口统一
- 测试链路存在
- 模板递归展开与循环检测已落地
- render-profile 基础字段级校验与 overrides 已落地

但它还不是最终态。更准确的表述应是：

**当前架构已经适合继续开发，不适合过早宣告 v0.1 完成。下一步应优先补 frontmatter 与更完整的 render-profile / renderer contract，再进入更重的渲染和前端交互。**

