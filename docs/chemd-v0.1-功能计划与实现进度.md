# chemd v0.1 功能计划与实现进度表

状态：根据当前代码整理  
更新时间：2026-03-31

---

## 1. 总体判断

当前工程已经完成 `chemd v0.1` 的可运行骨架版。

当前可以稳定演示的链路：

`source markdown -> parser -> resolver -> render profile -> html/json/svg -> web preview`

当前不应宣告“v0.1 已全部完成”，因为以下关键区域仍未收口：
- frontmatter / YAML 完整性
- 真正 Markdown AST
- 更完整的 render profile schema
- 更真实的化学渲染
- 可编辑 playground

---

## 2. 包级完成情况

| 包/应用 | 当前状态 | 说明 |
|---|---|---|
| `@chemd/core` | 已实现 | AST、diagnostics、基础 helper 已稳定 |
| `@chemd/parser` | 部分实现 | 基础 frontmatter/块/引用 token 化已完成，支持模板体嵌套 `use`、`render_overrides` 一层 map、`tags` 行内数组（仅 `tags` 字段启用，含引号内逗号与转义引号）、Markdown inline `code/link` token、unsafe link warning 与 token `start/end + startLine/startColumn/endLine/endColumn` 定位；除 `tags` / `render_overrides` 外的 meta 键现已收口为标量-only；但不是真正 YAML/Markdown parser |
| `@chemd/resolver` | 已实现主链路 | 引用、模板展开、重复 id、重复模板、未知模板、无效 `primary_*`、template cycle 已完成 |
| `@chemd/render-profile` | 部分实现 | profile 继承、fallback、cycle、unknown field warning、基础值校验、overrides 已完成；已补 `slides-large` 与基础 adapter mapping contract，仍缺更细 schema/联调 |
| `@chemd/renderer-html` | 部分实现 | 结构化块、inline chemistry、SVG 嵌入已完成；Markdown 已支持标题/列表/段落/引用块/代码块子集、`*em*`/`**strong**`/`~~del~~` 行内语义、嵌套列表/任务列表、有序列表 `start` 语义，以及引用块内部列表与嵌套引用语义，但仍非完整 Markdown AST |
| `@chemd/renderer-json` | 已实现 | JSON 输出已可用 |
| `@chemd/renderer-svg` | 部分实现 | 已从纯 placeholder 升级为“线性 SMILES 子集草图渲染 + 反应式片段布局”，并保留复杂输入回退文本；仍未接入真实 RDKit 化学绘图 |
| `@chemd/compiler` | 已实现 | 编译聚合入口已完成 |
| `@chemd/web` | 部分实现 | 三栏展示、可编辑输入、profile 切换、去抖低优先级重编译与 DOCX 导出按钮/接口已实现；接口已补 `application/json` 校验、请求体大小、并发、`Retry-After` 与超时保护，仍缺持久任务队列与分布式限流 |

---

## 3. 功能清单状态

### 3.1 文档与文件层

| 功能 | 状态 | 备注 |
|---|---|---|
| Markdown 作为源格式 | 已实现 | 输入即普通字符串/Markdown |
| UTF-8 文本输入 | 默认支持 | 未做专门校验 |
| YAML frontmatter | 部分实现 | 已支持顶层标量、顶层字符串数组、一层对象 map、非法行诊断，但还不是真正完整 YAML 解析 |
| `primary_*` 主对象声明 | 部分实现 | 已参与 resolver，并会校验是否指向真实对象；仍缺更完整类型校验 |
| `render_overrides` frontmatter | 已实现 | 当前支持一层 map，key 为 dotted path |

#### 3.1.1 Frontmatter Contract（当前约束）

- 顶层必填标量：`id`、`title`、`date`（非空字符串）
- 主对象引用：`primary_*`（非空字符串，解析后由 resolver 校验目标是否存在）
- 标签：`tags`（字符串数组）
- 渲染选择：`render_profile`（非空字符串）
- 渲染覆盖：`render_overrides`（一层对象，键格式 `section.field`，值仅允许标量；字段白名单与 render-profile schema 同步）
- 普通 meta 键：除 `tags` / `render_overrides` 外，仅允许标量值
- 普通 meta 的 block object / block list 会明确报错并跳过，不隐式降级为嵌套结构
- 多行值策略：不支持 YAML 块标量（`|` / `>`）与普通 meta 的隐式多行 scalar，遇到即报错并跳过该值
- 非法与冲突输入诊断（含 line/column 定位）：
  - `W_INVALID_FRONTMATTER_LINE`
  - `W_DUPLICATE_FRONTMATTER_KEY`
  - `E_INVALID_FRONTMATTER_VALUE`
  - `E_MISSING_REQUIRED_FRONTMATTER_KEY`
  - `W_NON_ISO_FRONTMATTER_DATE`
- `W_INVALID_FRONTMATTER_DATE_VALUE`

### 3.2 语言层核心语法

| 功能 | 状态 | 备注 |
|---|---|---|
| `:chem[...]` | 已实现 | token + HTML span，非 mhchem |
| directive block | 已实现 | `:::block ... :::` |
| block 头 ID | 已实现 | 含 `E_INVALID_ID` |
| `|` 列表字段 | 已实现 | 当前支持 `reactants/products/params` |

### 3.3 块类型

| 块类型 | 状态 | 备注 |
|---|---|---|
| `molecule` | 已实现 | 含 HTML / SVG |
| `reaction` | 已实现 | 含 HTML / SVG |
| `result` | 已实现 | 含 HTML |
| `analysis` | 已实现 | 含 HTML |
| `sample` | 已实现 | 含 HTML |
| `template` | 部分实现 | 已支持结构化模板体和嵌套 `use`，但仍不是完整 Markdown AST 模板系统 |
| `use` | 已实现 | 支持参数与 alias override |

### 3.4 引用系统

| 功能 | 状态 | 备注 |
|---|---|---|
| `@id` | 已实现 | 对象引用 |
| `@id.field` | 已实现 | 字段读取 |
| `@meta.*` | 已实现 | frontmatter 读取 |
| `@param.*` | 已实现 | 模板参数读取 |
| `@reaction.*` / `@result.*` 等 | 已实现 | alias 绑定已完成 |

### 3.5 模板系统

| 功能 | 状态 | 备注 |
|---|---|---|
| 模板定义 | 已实现 | `template` |
| 模板调用 | 已实现 | `use` |
| 自动绑定 | 已实现 | `bind` + `primary_*` |
| 显式覆盖 | 已实现 | `use` 参数优先 |
| 模板展开进入最终 AST | 已实现 | `use` 展开后移除 |
| 模板体嵌套 `use` | 已实现 | parser + resolver 已打通 |
| 未知模板诊断 | 已实现 | `E_UNKNOWN_TEMPLATE` |
| 重复模板诊断 | 已实现 | `E_DUPLICATE_TEMPLATE` |
| 模板循环检测 | 已实现 | `E_TEMPLATE_CYCLE` |

### 3.6 诊断系统

| 功能 | 状态 | 备注 |
|---|---|---|
| 非法 ID | 已实现 | `E_INVALID_ID` |
| 重复对象 ID | 已实现 | `E_DUPLICATE_ID` |
| 缺失必填字段 | 已实现 | `E_MISSING_REQUIRED_FIELD` |
| 未知字段 | 已实现 | `W_UNKNOWN_FIELD` |
| 未知块 | 已实现 | `W_UNKNOWN_BLOCK` |
| 缺失引用对象/字段 | 已实现 | `W_UNRESOLVED_REFERENCE` |
| 非法 `primary_*` 引用 | 已实现 | `E_INVALID_PRIMARY_REFERENCE` |
| 非法 frontmatter 行 | 已实现 | `W_INVALID_FRONTMATTER_LINE` |
| 未知模板 | 已实现 | `E_UNKNOWN_TEMPLATE` |
| 重复模板名 | 已实现 | `E_DUPLICATE_TEMPLATE` |
| 模板循环 | 已实现 | `E_TEMPLATE_CYCLE` |
| 未知 render profile | 已实现 | `W_UNKNOWN_RENDER_PROFILE` |
| profile 继承循环 | 已实现 | `E_RENDER_PROFILE_CYCLE` |
| 未知 render profile 字段 | 已实现 | `W_UNKNOWN_RENDER_PROFILE_FIELD` |
| 非法 render profile 值 | 已实现 | `E_INVALID_RENDER_PROFILE_VALUE` |
| 非法 frontmatter 值 | 部分实现 | 已覆盖多类类型错误与嵌套/多行边界，仍缺真正 YAML 级别校验 |
| 缺失必填 frontmatter key | 已实现 | `E_MISSING_REQUIRED_FRONTMATTER_KEY`（当前覆盖 `id/title/date`） |
| 非 ISO 日期格式提示 | 已实现 | `W_NON_ISO_FRONTMATTER_DATE`（建议 `YYYY-MM-DD`） |
| ISO 日期值合法性提示 | 已实现 | `W_INVALID_FRONTMATTER_DATE_VALUE`（格式合法但日历日期非法时 warning） |

### 3.7 输出系统

| 输出 | 状态 | 备注 |
|---|---|---|
| HTML | 已实现 | 可用于 web 预览 |
| JSON | 已实现 | 含 render / diagnostics |
| SVG | 部分实现 | 线性 SMILES 子集草图 + reaction 片段布局 |
| DOCX bridge | 部分实现（已达最小可执行导出链路） | 已新增 DOCX markdown handoff、Pandoc 导出函数和 Web 端导出入口；接口已补请求体大小、并发与超时保护，仍缺真实环境 pandoc 集成验证与持久任务队列 |

### 3.8 Web / Playground

| 功能 | 状态 | 备注 |
|---|---|---|
| 三栏布局 | 已实现 | 左中右三栏 |
| 预览真实 compiler 输出 | 已实现 | 不是静态占位 |
| diagnostics 面板 | 已实现 | 含 render options |
| JSON 面板 | 已实现 | normalized JSON |
| 可编辑源码输入 | 已实现 | 左栏已切换为 `textarea` 编辑器 |
| live recompilation | 已实现 | 输入或 profile 变更会触发去抖、低优先级实时编译 |
| profile 切换 UI | 已实现 | 左栏已提供 `select` 下拉切换 |

---

## 4. 最近已完成的关键补齐

本轮及最近几轮已完成：

1. frontmatter 能读取顶层字符串数组
- 例如 `tags` 已可解析为字符串数组。

2. frontmatter 非法行会产出 warning
- 已加入 `W_INVALID_FRONTMATTER_LINE`。

3. `primary_*` 会校验真实对象是否存在
- 已加入 `E_INVALID_PRIMARY_REFERENCE`。

4. 重名模板不再静默覆盖
- 已改为报 `E_DUPLICATE_TEMPLATE`，并保留第一个模板定义。

5. 模板体支持嵌套 `use`
- parser 已把模板体保留为结构化子节点，而不是单段 markdown 文本。

6. 模板循环现在会被检测
- resolver 已加入 `E_TEMPLATE_CYCLE`，并在局部降级后继续处理其他内容。

7. render-profile 已有基础 schema 校验
- 已加入 `W_UNKNOWN_RENDER_PROFILE_FIELD`。
- 已加入 `E_INVALID_RENDER_PROFILE_VALUE`。
- 非法值会保留继承值或基础默认值，不中断编译。

8. render_overrides 已打通
- parser 已支持 frontmatter 一层 map 形式的 `render_overrides`。
- render-profile 已支持 dotted path overrides 合并与校验。
- compiler 已把 overrides 链路串到最终 render options。

9. HTML 和 SVG 占位渲染做了补齐
- HTML 补全更多字段。
- reaction SVG 修复空数组回退。

10. render-profile 内建 profile 扩展
- 已新增 `slides-large` 预设（presentation 大字号/大间距）。

11. renderer adapter mapping contract（已接入主链路）
- `@chemd/render-profile` 已新增 `mapRenderOptionsToAdapterPayload`。
- compiler 已输出 `renderAdapterPayload`，JSON render 节点已可序列化 adapter 数据。
- `renderer-html -> renderer-svg` 已使用 adapter payload 参与渲染参数计算。

12. render-profile 约束校验（范围 + 跨字段）
- 已新增数值范围约束并做 clamp（如 `bondLength`、`fontSize`、`dpi`）。
- 已新增跨字段约束（如 `reaction.plusGap <= reaction.componentGap`），异常给出诊断并降级。


13. render_overrides 共享校验 contract
- `@chemd/core` 已新增 `isValidRenderOverrideValue` / `getRenderOverrideValueHint`。
- parser 与 render-profile 已共用这套值校验规则，减少重复维护。

14. frontmatter 诊断精细化（render_overrides）
- render_overrides 值错误现在定位到具体条目行（非根键行）。
- 一层策略下，嵌套 frontmatter 结构会明确报错并跳过嵌套行，降低噪声 warning。


15. render_overrides 键格式共享校验
- `@chemd/core` 已新增 `isRenderOverridePathFormat`。
- parser 已移除本地键格式正则，改为复用 core 规则。

16. frontmatter 必填 key 缺失诊断
- parser 已新增 `E_MISSING_REQUIRED_FRONTMATTER_KEY`。
- 当前覆盖 `id`、`title`、`date` 三个基础必填键，缺失时给出 error 并保留默认回退值。

17. frontmatter 日期格式 warning
- parser 已新增 `W_NON_ISO_FRONTMATTER_DATE`。
- 对非 `YYYY-MM-DD` 日期给出 warning，但保留原值，避免阻断现有数据迁移。

18. render-profile schema 收口（显式数值单位）
- 已新增数值 schema 导出（含单位与范围约束）。
- 已补 `structure.atomLabelPadding <= structure.fontSize * 0.5` 约束。
- `export.imageFormat=png` 时已强制 `dpi >= 150` 并给出诊断。

19. adapter payload contract 跨 renderer 对齐
- `compiler` 已把同一份 `renderAdapterPayload` 同时传给 HTML 与 JSON 渲染。
- `renderer-html` 已支持优先使用外部传入 payload，避免双源映射漂移。
- 已补编译链路测试，验证 `result.renderAdapterPayload` 与 JSON render.adapter 一致。

20. Markdown/HTML 准确性阶段推进
- `renderer-html` 已新增 `blockquote` 与 fenced code block 渲染。
- 已补行内 `code`、安全链接（拒绝 `javascript:`）与分隔线（`---`/`***`）渲染。
- 代码块内仅做转义，不执行引用与 `:chem[]` 替换，避免语义误替换。
- 已补 compile 端到端测试，覆盖 markdown/inline 语义一致性。

21. Markdown inline token contract 收口（core/parser）
- `@chemd/core` 已为 `MarkdownNode` 增加 `inlineCode` 与 `links` token 字段。
- parser 已新增 inline `code` / markdown `link` token 化。
- parser 对不安全链接已新增 `W_UNSAFE_LINK_HREF` warning（如 `javascript:`）。
- parser 已为 reference/inline_chem/inline_code/link token 补充 `start/end` 偏移。

22. renderer-html 优先消费 parser inline token
- renderer-html 对 `inlineCode` / `links` 已新增 token-first 渲染路径。
- 当 token 不存在时保留正则回退，兼容手写 `createMarkdownNode` 场景。
- 已补 token 驱动测试，验证非 Markdown 原始标记也能按 token 渲染。

23. renderer-html reference/chem 区间渲染收口
- renderer-html 已把 reference 与 inline-chem 纳入 token 区间渲染。
- 同一 raw 重复出现时，按 token `start/end` 精确替换，避免全局误替换。
- 保留无区间 token 的回退路径，兼容旧测试与手写节点。

24. Markdown token 行列定位 contract 收口（core/parser）
- `@chemd/core` 已为 reference/inline_chem/inline_code/link token 扩展 `startLine/startColumn/endLine/endColumn`。
- parser 已基于 `start/end` 偏移统一推导并填充行列信息，支持多行 markdown 文本。
- 已补 parser/core 测试，校验 offset 与 line/column 一致性。

25. Markdown 行内样式语义收口（renderer-html/compiler）
- renderer-html 已新增 `*em*`、`**strong**`、`~~del~~` 渲染，并在 token-first 与 regex fallback 路径保持一致。
- 行内样式仅作用于文本节点，不改写已生成 HTML 标签/属性，降低误替换风险。
- 已补 renderer-html 与 compiler 测试，覆盖样式与 code span 隔离（代码内不做样式替换）。

26. Markdown 列表语义收口（renderer-html/compiler）
- renderer-html 已支持按缩进解析嵌套无序/有序列表，避免扁平化列表语义丢失。
- 已新增任务列表渲染：`- [x]` / `- [ ]` 输出为禁用 checkbox，保留只读预览语义。
- 已补 renderer-html 与 compiler 测试，覆盖嵌套列表结构与任务项选中状态。

27. Markdown 引用块内部语义收口（renderer-html/compiler）
- renderer-html 在 `blockquote` 内已复用 markdown 渲染流程，支持引用块中的列表、任务列表与二级引用。
- 引用块文本中的 reference 解析保持有效，避免仅按纯段落拼接导致语义丢失。
- 已补 renderer-html 与 compiler 测试，覆盖引用块内任务项与嵌套引用场景。

28. Markdown 有序列表起始序号语义收口（renderer-html/compiler）
- renderer-html 对有序列表已支持 `start` 语义（例如 `3. item` 输出 `<ol start="3">`）。
- 嵌套有序列表按各自首项编号独立计算 `start`，与父级列表语义解耦。
- 已补 renderer-html 与 compiler 测试，覆盖非 1 起始值与嵌套场景。

29. Frontmatter 行内数组 contract 补齐（parser）
- parser 已支持行内字符串数组解析（如 `tags: [oxidation, "copper catalyst"]`）。
- 支持裸字符串与引号字符串混合输入，最终按字符串数组进入 `meta.tags`。
- 已补 parser 测试，覆盖行内数组场景并验证与 `render_profile` 协同解析。

30. Frontmatter 行内数组边界语义收口（parser）
- parser 行内数组解析已改为状态机，支持引号内逗号（如 `"copper, catalyst"`）。
- 已支持单双引号与转义引号（如 `"quoted \\\"value\\\""`）的字符串恢复。
- 已补 parser 测试，覆盖 quoted comma + escaped quote 场景。

31. Markdown 表格语义收口（renderer-html/compiler）
- renderer-html 已新增 GFM 风格表格渲染（`thead/tbody`）并支持列对齐语义（left/center/right）。
- 已将表格语义接入 compiler 输出链路，保证 web/compile 侧输出一致。
- 已补 renderer-html 与 compiler 测试，覆盖对齐列与单元格输出断言。

32. SVG 渲染真实性阶段增量（renderer-svg）
- renderer-svg 已支持线性 SMILES 子集（单/双/三键）草图渲染，不再只显示固定占位图形。
- reaction SVG 已支持按组分片段布局与 `+` 分隔符渲染，并保留长文本/复杂输入的可读回退。
- 已新增 adapter payload 运行时净化（数值 clamp、类型校验、颜色白名单、跨字段约束），避免不可信输入污染 SVG 属性。
- 已补 renderer-svg 测试，覆盖线性草图路径、组分分隔渲染与不可信 adapter payload 安全回退。

33. DOCX 最小可执行导出链路（compiler/renderer-docx）
- `renderer-docx` 已新增 `renderDocxMarkdown`，将解析后的文档结构稳定转为 DOCX 转换友好的 markdown handoff 文本。
- `@chemd/compiler` 已新增 `./node` 导出入口，支持 `compileChemdToDocx` 与 `exportMarkdownToDocx`（Pandoc 子进程执行）。
- 导出链路新增路径校验、临时文件清理、输出文件存在性验证（可配置关闭），避免“命令成功但无产物”的假阳性。
- 已补 `compiler-node` 与 `renderer-docx` 测试，覆盖 args 构建、注入 runner 的导出调用、以及 compile->markdown->docx handoff 的最小 E2E 契约。

34. Web 端 DOCX 导出闭环（apps/web）
- 已新增 `POST /api/export/docx`（Node runtime）接口，接收 source/profile 并调用 `@chemd/compiler/node` 导出 `.docx`。
- diagnostics 面板新增 `DOCX Export` 区块与 `Export DOCX` 按钮，可直接下载导出文件。
- 接口已加入入参校验、文件名净化、失败 JSON 回传与临时文件清理，避免无声失败与临时文件泄漏。
- 已补 web 页面测试断言，覆盖导出入口 UI 可见性。

35. SVG 回退可解释性增强（renderer-svg）
- molecule 渲染在遇到超出子集的 SMILES 时，不再只给通用 placeholder；已新增 `SMILES fallback` 文本与原因说明。
- reaction 片段在无法草图化时，会保留可读文本并附带 `<title>` 原因提示，便于调试和后续诊断聚合。
- 已补 renderer-svg 测试，覆盖 unsupported token 的可解释回退路径。

36. DOCX 导出接口对外部署级加固（apps/web/compiler）
- `POST /api/export/docx` 已新增请求体大小限制、模块内并发门闩与 Pandoc 执行超时控制。
- compiler node 导出链路已支持 `executionTimeoutMs`，超时会主动终止 Pandoc 子进程，降低悬挂进程与资源耗尽风险。
- 已补 web/compiler 测试，覆盖超大请求体、并发饱和与超时 runner 场景。

37. Frontmatter 普通 meta 标量-only 收口（parser）
- parser 现在对除 `tags` / `render_overrides` 外的普通 frontmatter 键仅接受标量值。
- 对 object / sequence 输入会产出 `E_INVALID_FRONTMATTER_VALUE`，并跳过该键写入，避免未定义嵌套结构泄漏到文档 contract。
- 已补 parser 测试，覆盖 object / sequence 非法输入场景。

38. DOCX 导出协议层硬化（apps/web）
- `POST /api/export/docx` 现在会强制校验 `Content-Type: application/json`，对非 JSON 请求返回 `415 / E_UNSUPPORTED_MEDIA_TYPE`。
- 并发饱和时响应已补 `Retry-After` 头，便于未来接入客户端重试与网关层退避策略。
- 已补 web 测试，覆盖非 JSON 请求拒绝与 busy 响应头行为。

39. Frontmatter 嵌套结构诊断细化（parser）
- 对普通 meta 的 block object / block list，parser 现在会区分报出 `Nested frontmatter object/list is not supported for <key>`。
- 同时会在首个嵌套条目位置补充 `Nested frontmatter structure is not supported under <key>`，便于定位具体层级。
- 已补 parser 测试，覆盖 object / list 两种路径及其行号定位。

40. Frontmatter 隐式多行标量收口（parser）
- 对普通 meta 的 YAML implicit multiline scalar，parser 现在会报 `Unsupported multiline frontmatter scalar for <key>`。
- 这使多行值策略从“仅拒绝 `|` / `>` block scalar”进一步收口为“普通 meta 一律单行标量”。
- 已补 parser 测试，覆盖隐式多行 scalar 被拒绝且后续键继续解析的路径。

41. 训练数据导出最小主链路（exporter-training）
- 已新增 `@chemd/exporter-training` 包，按 `chemd-v0.1-training-export-plan` 落地阶段 0/1 的最小实现。
- 已补齐 v0.1 顶层 schema 与分层类型定义，并实现 `exportTrainingRecordFromDocument` 主 API。
- 已实现 `source_layer` 快照透传、`semantic_layer` 基础实体映射（含稳定 `entity_id` 与 primary relation）和 `quality_layer.parse_quality`。
- 已新增 exporter 测试，覆盖最小成功导出链路与 diagnostics 透传/计数行为。

---

## 5. 下一阶段建议

推荐阶段名称：`v0.1 规范收口阶段`

### 优先级 A
- 更完整的 frontmatter contract
- 多行值 / 嵌套结构策略
- 更准确的 frontmatter diagnostics

### 优先级 B
- 更完整 render profile schema（范围/单位/跨字段约束）
- 更多内建 profile（按场景补齐）
- adapter mapping 与 renderer 接口联调

### 优先级 C
- 更完整的 Markdown AST
- 更准确的 HTML 渲染

### 优先级 D
- RDKit / 真正化学 SVG adapter
- 可编辑 playground
- DOCX bridge

---

## 6. 当前验证状态

已验证（2026-03-31）：
- pnpm --filter @chemd/parser test 通过
- pnpm --filter @chemd/render-profile test 通过
- pnpm --filter @chemd/compiler test 通过
- pnpm test 通过
- pnpm typecheck 通过
- pnpm --filter @chemd/web build 通过

当前结论：

**项目已具备继续推进 `v0.1 规范收口阶段` 的稳定基础。当前 `优先级 A` 与 `优先级 D` 的一部分已继续推进：frontmatter contract 已进一步收口，Web 已补去抖低优先级重编译与 DOCX 导出接口硬化，下一步可继续补齐更完整 Markdown AST 与更真实化学渲染。**










