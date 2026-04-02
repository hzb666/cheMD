# chemd v0.1 语言规范（中文更新版）

状态：按当前产品方向重写  
更新时间：2026-04-02  
适用范围：`packages/core`、`packages/parser`、`packages/resolver`、`packages/render-profile`、`packages/compiler`、`packages/renderer-*`、`apps/web`、`services/chem-service`

---

## 1. 项目目标

`chemd` 是一个面向化学文档与实验记录的 Markdown 语义系统。v0.1 不应只理解为“语言内核版本”，而应理解为**产品原型版本**。

v0.1 的目标不是替代 ChemDraw，也不是一次做成完整 ELN，而是先把实验记录推进到“可解析、可引用、可模板化、可渲染、可识别、可纠错”的结构化文档产品原型。

v0.1 的正式产品形态应收敛为：
- `Editor`
- `Preview`

v0.1 的对象主线：
- `molecule`
- `reaction`

v0.1 的版本边界：
- `Tree` 不属于 v0.1 正式主界面，只作为实验性能力保留代码。
- `training-export` 不属于 v0.1 主范围，应整体归入 v0.2。

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
5. OCR、专业渲染和结构编辑优先依赖外部成熟能力，不自研重轮子。
6. 错误应尽量局部降级，不能轻易拖垮整份文档。

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
- 已支持顶层标量、顶层字符串数组与一层对象 map。
- `render_profile` 已进入 `renderSelection`。
- `primary_*` 已在 resolver 中参与 alias 解析，并校验目标是否存在。
- 尚未实现真正 YAML 解析，因此多行值、更深层嵌套对象和复杂类型推断仍未完成。

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
- AST 中语义对象与 `renderSelection` / `renderOptions` 已分开存放。

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
- 目前仍是轻量占位渲染，尚未接入正式化学排版后端。

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
conditions: Cu catalyst | air | 80 C | 4 h
```

当前规范约定：
- `reactants`
- `products`
- `params`
- `conditions`

说明：
- `conditions` 用于承接多个反应条件项。
- `conditions` 继续以文本语义字段存在于 `chemd` 文档中，不要求放入图形编辑器内部维护。

当前代码状态：
- 已支持 `reactants`、`products`、`params` 三类列表字段。
- `conditions` 已确定纳入 v0.1 正式 contract，应按相同的 `|` 语义收口。
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
- 已有基础 Web 入口壳层与 HTML / SVG fallback 输出。
- `services/chem-service` 已具备承接正式化学后端的最小服务外壳。
- 正式 RDKit 渲染主路径、molecule OCR provider 和 Ketcher 编辑闭环仍待补齐。

### 9.2 `reaction`

主要字段：
- `reactants`
- `products`
- `conditions`
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

当前规范判断：
- `reaction` 不是边缘块类型，而是 v0.1 产品主线对象。
- Web / API / Ketcher 的 reaction 正式主链目前仍属于目标态，不能写成已落地能力。
- 目标链路是 OCR 识别后静默写回标准 `reaction` block，并在预览中提供修改入口。
- `Ketcher` 反应骨架编辑闭环仍待补齐。
- `conditions` 继续保留在文本文档字段中，使用 `|` 分隔多个条件项。

当前代码状态：
- 已解析。
- `reactants`、`products` 被当作必填字段。
- HTML / SVG 已输出。
- 当前已有基础 reaction 片段布局，但仍不是最终正式化学绘图质量。
- Web 端交互入口、后端 provider 接入与 Ketcher 正式闭环仍待补齐。

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

### 9.4 `analysis`

主要字段：
- `type`
- `instrument`
- `solvent`
- `frequency`
- `data`
- `method`
- `notes`

### 9.5 `sample`

主要字段：
- `name`
- `sample_id`
- `batch`
- `purity`
- `supplier`
- `notes`

### 9.6 `template`

用于定义可复用模板。

当前代码状态：
- 已支持模板定义。
- 模板体可包含 markdown 与嵌套 `use`，并保留结构化 AST 形态。

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
- 已实现模板循环检测 `E_TEMPLATE_CYCLE`。

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
- 已实现 `E_INVALID_ID`、`E_DUPLICATE_ID`、`E_MISSING_REQUIRED_FIELD`、`W_UNKNOWN_FIELD`、`W_UNKNOWN_BLOCK`、`W_UNRESOLVED_REFERENCE`、`E_INVALID_PRIMARY_REFERENCE`、`E_UNKNOWN_TEMPLATE`、`E_DUPLICATE_TEMPLATE`、`E_TEMPLATE_CYCLE`、`W_INVALID_FRONTMATTER_LINE`、`W_UNKNOWN_RENDER_PROFILE`、`E_RENDER_PROFILE_CYCLE`、`W_UNKNOWN_RENDER_PROFILE_FIELD`、`E_INVALID_RENDER_PROFILE_VALUE`。
- 大部分错误不会中断整份文档编译。
- render profile 异常会回退到 `eln-default`。

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

v0.1 产品目标下的渲染分层：
- `render-profile` 继续控制风格层与参数层
- 正式化学 normalize / depiction 主路径应切向 RDKit
- `renderer-svg` 保留为 fallback，而不是长期主渲染真相层

当前代码状态：
- HTML：已实现
- JSON：已实现
- SVG：已实现线性 SMILES 子集草图与 reaction 片段布局
- DOCX：已实现最小 bridge 与 Web 导出链路

---

## 15. Web Playground

v0.1 的默认 UI 与标准产品形态应是：
- 左：编辑器
- 右：预览

说明：
- diagnostics、JSON、DOCX bridge 等 inspect 内容可以保留在原型里，但不要求继续把 v0.1 定义成三栏工作台。
- `Tree` 当前只应视为实验性能力，不属于 v0.1 正式主界面。

当前代码状态：
- 当前代码中已经出现编辑器、预览、OCR、结构编辑、DOCX 导出等能力。
- 代码里也出现了实验性的 `Tree` 面板实现。
- 但从版本口径上，v0.1 应收敛为 `Editor + Preview`，而不是继续扩张主界面范围。

---

## 16. 测试状态

当前测试已覆盖：
- parser 基础解析
- resolver 引用解析
- 模板展开与模板循环
- render profile fallback / cycle / invalid value / overrides
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
- RDKit / OCR provider / reaction 编辑闭环测试

---

## 17. 当前版本结论

当前代码已经实现了 `chemd v0.1` 的可运行产品骨架。

已经具备基础的部分：
- 结构化块
- 引用
- 模板调用
- 嵌套模板展开与循环检测
- render profile 基础解析、基础校验与文档级 overrides
- HTML / JSON / SVG / Web 预览
- OCR、结构编辑、DOCX 导出的初步产品壳

v0.1 仍需继续补齐的主项：
- 正式 RDKit molecule / reaction 渲染主路径
- molecule OCR provider 闭环
- reaction OCR provider 闭环
- molecule / reaction 的 Ketcher 编辑闭环
- `reaction.conditions` 的正式 contract 收口
- Tree 从 v0.1 主界面退出并转入 v0.2 规划

因此，当前最合理的工程判断应改为：

**v0.1 已经不只是语言骨架，而是一个以 `Editor + Preview` 为核心的化学文档产品原型。下一步应围绕 molecule 与 reaction 两条主线，打通外部 OCR provider、RDKit 正式渲染/规范化和 Ketcher 编辑闭环；`Tree` 与 `training-export` 不属于 v0.1 正式范围。**
