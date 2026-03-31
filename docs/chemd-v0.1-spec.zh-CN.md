# chemd v0.1 语言规范（中文更新版）

状态：中文翻译并根据当前代码更新  
更新时间：2026-03-31  
适用范围：`packages/core`、`packages/parser`、`packages/resolver`、`packages/render-profile`、`packages/compiler`、`packages/renderer-*`、`apps/web`

---

## 1. 项目目标

`chemd` 是一个面向化学 ELN 的 Markdown 语言内核。v0.1 的目标不是替代 ChemDraw，而是把实验记录从普通 Markdown 推进到“可解析、可引用、可模板化、可渲染”的结构化文档。

v0.1 当前已跑通的主链路：

`Markdown 实验记录 -> 语义 AST -> 引用/模板解析 -> Render Profile 解析 -> HTML / JSON / SVG 输出`

当前工程判断：
- 主链路已经可运行。
- HTML / JSON / SVG / Web 预览都已接通。
- 仍处在“语义闭环和渲染精度补全阶段”，不是最终完成态。

---

## 2. 文件模型

一个 `chemd` 文档由四层组成：

1. frontmatter
2. Markdown 正文
3. `chemd` 行内与块级语法
4. 可选的 render profile 选择信息

推荐扩展名：
- `.md`
- `.chemd.md`

编码：
- UTF-8

当前代码状态：
- 已支持普通 Markdown 字符串作为输入。
- 没有做扩展名层面的强校验。

---

## 3. 设计原则

1. 普通用户主要写 Markdown 和少量结构化块。
2. 重复信息只声明一次，再通过引用复用。
3. 模板复杂度应隔离在模板系统内部。
4. 语义内容和渲染样式必须严格分离。
5. 错误应尽量局部降级，不能轻易拖垮整份文档。

当前代码状态：
- 第 2、4、5 点已经落地到第一版实现。
- 第 1、3 点的易用性还不完整，主要受限于 frontmatter 和 Markdown 仍是轻量解析器。

---

## 4. Frontmatter

建议文档以 frontmatter 开始，例如：

```yaml
---
entry_type: experiment
id: exp-2026-03-30-001
title: Ethanol oxidation to acetic acid
author: zhibin hu
date: 2026-03-30
project: oxidation-study
status: completed
primary_reaction: rxn-main
primary_result: res-main
render_profile: eln-default
render_overrides:
  structure.bondLineWidth: 2.1
tags:
  - oxidation
  - copper
---
```

推荐键：
- `entry_type`
- `id`
- `title`
- `author`
- `date`
- `project`
- `status`
- `tags`
- `primary_reaction`
- `primary_result`
- `primary_product`
- `primary_sample`
- `render_profile`
- `render_overrides`

当前代码状态：
- 已支持顶层 `key: value` 标量读取。
- 已支持顶层字符串数组，例如 `tags`。
- 已支持顶层一层对象 map，当前已用于 `render_overrides`。
- 已支持 `render_profile` 进入 `renderSelection`。
- 已支持 `primary_*` 在 resolver 中参与 alias 解析，并校验是否引用真实对象。
- 已支持非法行 warning：`W_INVALID_FRONTMATTER_LINE`。
- 除 `tags` 与 `render_overrides` 外，其他 frontmatter meta 键当前只接受标量值。
- 普通 meta 若出现 block object / block list，会给出明确 `E_INVALID_FRONTMATTER_VALUE` 诊断并跳过该键。
- 普通 meta 若出现隐式多行 scalar，也会给出明确 `E_INVALID_FRONTMATTER_VALUE` 诊断并跳过该键。
- 尚未实现真正 YAML 解析，因此以下能力仍缺：
  - 多行值
  - 更深层嵌套对象
  - 复杂类型推断
  - 完整的值域校验

---

## 5. 语义与渲染分离

`molecule`、`reaction`、`result`、`analysis`、`sample` 等块只承载语义信息，不应直接写渲染样式字段。

错误示例：

```md
:::molecule #mol-1
smiles: CC(=O)O
bond_length: 32
:::
```

正确做法：

```yaml
---
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: 1.4
---
```

当前代码状态：
- 这一边界已经落实。
- AST 中语义对象与 `renderSelection` / `renderOptions` 分开存放。

---

## 6. 行内语法

### 6.1 `:chem[...]`

v0.1 支持：

```md
:chem[H2O]
:chem[SO4^2-]
:chem[2H2 + O2 -> 2H2O]
```

用途：
- 分子式
- 离子式
- 简单反应式
- 正文中的短化学表达

当前代码状态：
- parser 已识别 `:chem[...]` 并产出 token。
- HTML renderer 会渲染为 `chem-inline` span。
- 目前还是轻量占位渲染，尚未接入正式化学排版后端。

---

## 7. 块级语法

通用形式：

```md
:::block_name #optional-id
key: value
:::
```

ID 规则：
- 以 `#` 开头
- 正则：`[a-zA-Z][a-zA-Z0-9_-]*`

当前代码状态：
- 已支持标准块头与 `#id`。
- 已支持非法 ID 诊断 `E_INVALID_ID`。
- 未支持更复杂 header 语法。

---

## 8. 简单列表字段

v0.1 使用 `|` 表示平铺列表，例如：

```md
reactants: CCO | O=O
products: CC(=O)O
```

当前代码状态：
- 已支持 `reactants`、`products`、`params` 三类列表字段。
- 空列表项会产生 `E_INVALID_LIST_ITEM`。

---

## 9. v0.1 必需块类型

### 9.1 `molecule`

主要字段：
- `smiles`
- `name`
- `role`
- `caption`
- `formula`
- `amount`
- `equivalents`

当前代码状态：
- 已解析。
- `smiles` 被当作必填字段。
- HTML / SVG 已输出。

### 9.2 `reaction`

主要字段：
- `reactants`
- `products`
- `reagents`
- `catalyst`
- `solvent`
- `temperature`
- `time`
- `pressure`
- `atmosphere`
- `yield`
- `conversion`
- `selectivity`
- `caption`

当前代码状态：
- 已解析。
- `reactants`、`products` 被当作必填字段。
- HTML / SVG 已输出。
- 当前已有基础 reaction 片段布局，但仍不是最终化学绘图质量。

### 9.3 `result`

主要字段：
- `status`
- `yield`
- `conversion`
- `selectivity`
- `isolated_mass`
- `product_state`
- `purity`
- `notes`

当前代码状态：
- 已解析。
- HTML 已输出全部核心字段。

### 9.4 `analysis`

主要字段：
- `type`
- `instrument`
- `solvent`
- `frequency`
- `data`
- `method`
- `notes`

当前代码状态：
- 已解析为 `type_name`。
- `type_name` 和 `data` 当前被当作必填字段。

### 9.5 `sample`

主要字段：
- `name`
- `sample_id`
- `batch`
- `purity`
- `supplier`
- `notes`

当前代码状态：
- 已解析。
- `name` 被当作必填字段。

### 9.6 `template`

用于定义可复用模板。

当前代码状态：
- 已支持模板定义。
- 模板体已不再局限于单个 markdown 文本。
- 当前模板体可包含 markdown 与嵌套 `use`，并保留结构化 AST 形态。
- 更复杂的模板体语法仍未完全展开成完整 Markdown AST 体系。

### 9.7 `use`

用于调用模板。

当前代码状态：
- 已支持参数传入与模板展开。
- 展开后 `use` 节点会从最终文档树中移除。

---

## 10. 引用系统

v0.1 支持：

```md
@rxn-main
@res-main.yield
@meta.title
@param.note
@reaction.temperature
@result.yield
```

当前代码状态：
- 已支持 `@meta.*`
- 已支持 `@id` 和 `@id.field`
- 已支持 `@param.*`
- 已支持 alias：`@reaction.*`、`@result.*`、`@product.*`、`@sample.*`
- 已支持 `use` 显式 override 覆盖模板 bind
- 未解析成功的引用会给出 `W_UNRESOLVED_REFERENCE`

---

## 11. 模板系统

v0.1 模板系统应支持：
- 模板定义
- 模板调用
- 自动绑定
- 显式覆盖
- 展开后进入最终 AST / 渲染流程

当前代码状态：
- 已实现模板定义与调用。
- 已实现 `bind` 和 `params`。
- 已实现 alias 绑定、`primary_*` 回退、调用参数覆盖。
- 已实现嵌套 `use` 展开。
- 已实现未知模板诊断 `E_UNKNOWN_TEMPLATE`。
- 已实现重复模板名诊断 `E_DUPLICATE_TEMPLATE`，并保留第一个模板定义。
- 已实现模板循环检测 `E_TEMPLATE_CYCLE`。
- 仍未实现更完整的模板表达式和值插值系统。

---

## 12. 诊断与降级

v0.1 至少需要覆盖：
- 非法 ID
- 重复 ID
- 缺失必填字段
- 未知字段
- 未知块类型
- 缺失引用对象或字段
- 缺失模板
- 模板循环
- profile 继承循环
- 非法 frontmatter 值

当前代码状态：
- 已实现：
  - `E_INVALID_ID`
  - `E_DUPLICATE_ID`
  - `E_MISSING_REQUIRED_FIELD`
  - `W_UNKNOWN_FIELD`
  - `W_UNKNOWN_BLOCK`
  - `W_UNRESOLVED_REFERENCE`
  - `E_INVALID_PRIMARY_REFERENCE`
  - `E_UNKNOWN_TEMPLATE`
  - `E_DUPLICATE_TEMPLATE`
  - `E_TEMPLATE_CYCLE`
  - `W_INVALID_FRONTMATTER_LINE`
  - `W_UNKNOWN_RENDER_PROFILE`
  - `E_RENDER_PROFILE_CYCLE`
  - `W_UNKNOWN_RENDER_PROFILE_FIELD`
  - `E_INVALID_RENDER_PROFILE_VALUE`
- 尚未实现：
  - 更严格的 frontmatter 值校验
  - 更完整的 render profile schema 诊断

降级策略现状：
- 大部分错误不会中断整份文档编译。
- 未知模板和循环模板会局部丢弃，但后续文档仍继续处理。
- render profile 异常会回退到 `eln-default`。
- render profile 的未知字段和非法值会局部忽略，并保留继承值、profile 值或基础默认值。

---

## 13. AST 与输出

v0.1 不应“解析完直接渲染”，而应先生成规范化 AST，再做 resolver 和 renderer。

当前代码状态：
- 已有语义 AST。
- 已有 resolver 后文档对象树。
- `compileChemd()` 当前输出：
  - `document`
  - `diagnostics`
  - `renderOptions`
  - `html`
  - `json`

---

## 14. 渲染系统

v0.1 目标输出：
- HTML 预览
- JSON 输出
- SVG 输出
- DOCX 桥接预留

当前代码状态：
- HTML：已实现
- JSON：已实现
- SVG：已实现线性 SMILES 子集草图与 reaction 片段布局
- DOCX：已实现最小 bridge 与 Web 导出链路

说明：
- `molecule` / `reaction` 当前使用自定义草图 renderer，不是 RDKit。
- 这满足了当前架构预留，但不等于最终化学绘图质量。

---

## 15. Web Playground

理想 v0.1 playground：
- 左栏：源码编辑
- 中栏：预览
- 右栏：JSON + diagnostics + render profile

当前代码状态：
- 三栏结构已存在。
- 中栏已经消费 compiler 产出的真实 HTML。
- 右栏已显示 diagnostics、render options、normalized JSON。
- 左栏已切换为可编辑源码输入。
- 已实现 profile 切换和去抖 live recompilation。

---

## 16. 测试状态

当前测试已覆盖：
- parser 基础解析
- frontmatter 数组、一层 map 与非法行诊断
- resolver 引用解析
- 模板展开、嵌套 `use`、模板循环
- render profile fallback / cycle
- render profile unknown field / invalid value / overrides
- renderer-html 基础输出
- renderer-json 输出
- renderer-svg 草图输出与复杂输入回退
- compiler 集成
- web 页面展示、DOCX 路由与去抖编译调度

当前缺口：
- fixture / golden 测试体系
- frontmatter 更复杂 YAML 边界测试
- 真正 Markdown AST 渲染测试
- 更完整的 render-profile schema 测试

---

## 17. 当前版本结论

当前代码已经实现了 `chemd v0.1` 的“可运行骨架版”。

已经可用：
- 结构化块
- 引用
- 模板调用
- 嵌套模板展开与循环检测
- render profile 基础解析、基础校验与文档级 overrides
- HTML / JSON / SVG / Web 预览

尚未完成：
- 真正 YAML frontmatter
- 真正 Markdown AST
- 更完整 render profile 校验
- 真实化学渲染
- 更完整的交互 playground（当前已具备可编辑输入、profile 切换与去抖重编译）

因此，当前最合理的工程判断是：

**v0.1 核心链路已打通，并且模板链路与 render-profile 都已经进入“基础可校验且支持 overrides”的闭环阶段；但距离最终完成态仍差 frontmatter 完整性与真实渲染能力。**

