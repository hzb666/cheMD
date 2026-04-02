# chemd v0.1 功能计划与实现进度表

状态：按当前产品方向重写  
更新时间：2026-04-02

---

## 1. 总体判断

`chemd v0.1` 现在应定义为**产品原型版本**，不是单纯的语言内核阶段。

v0.1 的目标不是一次做成完整 ELN，也不是把所有平台能力都铺开，而是先把一条对用户真正有价值的主链跑通：

`Editor -> Preview -> OCR -> normalize/render -> 用户修正 -> 文档回写`

v0.1 的产品主形态应收敛为：
- `Editor`
- `Preview`

其中核心对象不是只有 `molecule`，还包括 `reaction`。

当前更准确的工程判断是：
- 语言内核主链已经跑通。
- Web 默认主界面已经收口为 `Editor + Preview`，`Tree` 已退出默认展示。
- Web 端已经开始具备 OCR、结构编辑、DOCX 导出等产品能力，但化学主链仍未完全闭环。
- `reaction.conditions` 已进入 AST / parser / renderer / exporter 的核心 contract。
- 但版本边界需要重新收口，避免把 `Tree` 和 `training-export` 提前混进 v0.1 主叙事。

---

## 2. v0.1 版本边界

### 2.1 v0.1 正式范围

v0.1 包含以下主线：

1. `Editor + Preview` 默认 UI 产品原型
- 文档可编辑
- 预览可实时刷新
- diagnostics 与导出能力保留在原型中，但不要求演进成完整工作台平台

2. `molecule` 主链
- `molecule` block 解析、校验、引用与 fallback 渲染已具备基础能力
- Web 入口、预览承载位与服务外壳已经存在
- 正式 OCR provider、RDKit 主渲染链与 Ketcher 编辑闭环仍待补齐
- 临时结构缓存继续作为编辑态承载位保留

3. `reaction` 主链
- `reaction` block 解析、校验、引用与基础预览已纳入主线
- OCR 静默回写标准 `reaction` block 属于目标链路，当前仍待补齐
- `reaction` 新增 `conditions` 字段
- `conditions` 使用 `|` 分隔多个条件项
- 预览修改入口、Web/API 接口与 `Ketcher` 反应骨架编辑闭环仍待补齐
- 临时结构缓存保留 reaction 编辑态

4. 正式化学后端接入
- OCR 不自研，依赖外部库或外部 API
- 专业 normalize / render 不自研，主路径依赖 RDKit
- `renderer-svg` 保留为 fallback，而不是长期主渲染真相层

5. 必要的阻塞型重构
- `render-profile` 与 render constraints 单一真相来源
- preview / OCR / structure-editor / reaction editor 相关组件边界收口
- 只做支撑 v0.1 主链的重构，不做审美型大重构

### 2.2 v0.1 不纳入正式范围

以下能力不属于 v0.1 正式范围：
- `Tree` 作为正式 UI 入口
- `training-export`
- 完整实验管理平台
- 重型任务队列与分布式基础设施
- 自研高质量化学 depiction engine
- 自研 OCR 模型

### 2.3 已存在但不属于 v0.1 主路径的能力

1. `Tree`
- 当前代码里已经出现实验性实现。
- 代码可以保留。
- 但 v0.1 前端主界面不应默认显示。
- 它应作为 v0.2 首要能力重新规划。

2. `training-export`
- 当前仓库已经存在最小实现与设计稿。
- 但该能力应整体归入 v0.2，而不是继续写进 v0.1 的主计划里。

---

## 3. 当前主链定义

### 3.1 文档主链

当前已经具备稳定基础的主链：

`source markdown -> parser -> resolver -> render profile -> html/json/docx bridge -> web preview`

这条链路仍然是整个系统的根骨架。

### 3.2 molecule 产品主链

v0.1 应以以下链路为目标：

`molecule image -> OCR provider -> normalize/render -> 静默写回 molecule block -> Preview -> Ketcher 修改 -> 文档回写`

说明：
- 当前已具备 Web 壳层、服务接入位与 fallback 渲染，不应误写为正式 RDKit/provider 主链已完成。
- OCR provider 可以是外部库，也可以是外部 API。
- 正式预览应优先走 RDKit。
- 当前自研 `renderer-svg` 作为 fallback 保留。

### 3.3 reaction 产品主链

v0.1 应以以下链路为目标：

`reaction image -> OCR provider -> 标准化 reaction block -> 静默写回 -> Preview -> Ketcher 修改 -> 文档回写`

推荐的标准 block 形态：

```md
:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
yield: 63%
:::
```

说明：
- reaction 的 Web / API / Ketcher 主链目前仍是待补齐目标，不应写成现状能力。
- 反应条件不要求放进 Ketcher 编辑。
- `Ketcher` 主要负责箭头左右两侧的反应骨架编辑。
- 条件文本继续保留在 `chemd` 的语义字段中。

---

## 4. 包级与应用级状态

| 包/应用 | 当前状态 | v0.1 角色定位 |
|---|---|---|
| `@chemd/core` | 已实现 | 语义 AST、diagnostics、共享 contract |
| `@chemd/parser` | 部分实现 | 继续承接 `molecule/reaction/template` 语法解析 |
| `@chemd/resolver` | 已实现主链路 | 继续承接引用、模板与语义校验 |
| `@chemd/render-profile` | 部分实现 | 必须上收为 render constraints 唯一真相来源 |
| `@chemd/renderer-html` | 部分实现 | 继续承担文档 HTML 预览装配 |
| `@chemd/renderer-json` | 已实现 | 继续承担 inspect / 调试输出 |
| `@chemd/renderer-svg` | 部分实现 | 保留为 fallback renderer，不再定义为长期主渲染层 |
| `@chemd/renderer-docx` | 已实现最小链路 | 保留 DOCX bridge 与导出能力 |
| `@chemd/compiler` | 已实现 | 继续作为编排入口 |
| `@chemd/web` | 部分实现 | 收敛为 `Editor + Preview` 产品原型 |
| `services/chem-service` | 已有 fallback 外壳 | 作为 RDKit / OCR provider 接入位 |
| `@chemd/exporter-training` | 已有最小实现 | 归入 v0.2，不计入 v0.1 主路径 |

---

## 5. 功能清单状态

### 5.1 语言与文档层

| 功能 | 状态 | 备注 |
|---|---|---|
| Markdown 作为源格式 | 已实现 | 输入即普通字符串/Markdown |
| 结构化 block 语法 | 已实现 | `:::block ... :::` |
| frontmatter 基础解析 | 部分实现 | 顶层标量、字符串数组、一层 map 已支持 |
| `molecule` / `reaction` 语义节点 | 已实现 | 已进入 AST / resolver / renderer 主链 |
| 引用系统 | 已实现 | `@id`、`@id.field`、`@meta.*`、alias 已支持 |
| 模板系统 | 已实现主链路 | 含嵌套 `use` 与循环检测 |
| `reaction.conditions` | 已实现 | 使用 `|` 分隔多个条件项，已进入 AST / parser / renderer / exporter |

### 5.2 渲染与化学能力

| 功能 | 状态 | 备注 |
|---|---|---|
| HTML 预览 | 已实现 | 当前 web 主预览基础 |
| JSON 输出 | 已实现 | 继续用于 inspect / 调试 |
| fallback SVG | 已实现 | 线性 SMILES 子集草图 + reaction 片段布局 |
| RDKit normalize/render | 未完成 | 应成为 v0.1 正式主渲染链 |
| molecule OCR provider 接入 | 已有前端与服务外壳 | 仍需接正式 provider，当前仅能算壳层预留 |
| reaction OCR provider 接入 | 未完成 | 纳入 v0.1 正式范围 |
| molecule Ketcher 闭环 | 已有最小前端壳 | 仍需接正式 normalize/render 主链 |
| reaction Ketcher 闭环 | 未完成 | Web/API/编辑闭环仍待补齐 |

### 5.3 Web / Playground

| 功能 | 状态 | 备注 |
|---|---|---|
| 源码编辑 | 已实现 | `textarea` 编辑器已存在 |
| 实时重编译 | 已实现 | 去抖与低优先级调度已接通 |
| 预览面板 | 已实现 | 当前已承载 HTML/JSON/DOCX 切换 |
| DOCX 导出 | 已实现最小链路 | 接口已做基础保护 |
| Tree 面板 | 已有实验性实现 | v0.1 主界面应隐藏，转入 v0.2 |
| OCR 入口 | 部分实现 | `molecule` 路径已具备入口、静默回写与会话隔离保护，正式 provider 与 `reaction` 路径未完成 |
| 结构修改弹窗 | 部分实现 | `molecule` 路径已有最小草稿加载/保存链路，正式 Ketcher 与 `reaction` 闭环未完成 |

---

## 6. 最近已完成的关键基础工作

以下能力已经为 v0.1 产品原型打下基础：

1. 语言内核主链已跑通
- parser / resolver / render-profile / compiler 已形成可运行闭环。

2. 模板与引用能力已进入稳定阶段
- 嵌套 `use`、循环检测、alias 绑定、主对象回退均已具备基础可用性。

3. `render-profile` 已有基础约束能力
- 具备 fallback、cycle、unknown field、invalid value、overrides 等基础诊断。

4. HTML / JSON / DOCX bridge 已接通
- Web 原型已经不只是静态示意页面。

5. Web 端已出现 OCR、结构编辑、导出入口
- 说明产品正在从“编译器 demo”走向“可交互原型”。

6. 默认 UI 已收口为 `Editor + Preview`
- `Tree` 代码保留，但已退出 v0.1 默认主界面。

7. `reaction.conditions` 已贯通主链
- AST、parser、HTML/SVG renderer 与 training-export 已统一支持该字段。

8. molecule 写回安全性已补强
- OCR 回写已避免基于旧 source 覆盖。
- 多 molecule 文档不再默认误选目标块。
- 结构缓存已增加 `sessionId` 维度，避免跨会话串草稿。

9. `renderer-svg` 已可作为 fallback
- 当前仍有展示价值，但不应继续定义为长期主 depiction 路线。

10. `services/chem-service` 已有服务壳
- 当前虽主要返回 fallback 响应，但已具备后续接入 RDKit / OCR provider 的承载位。

---

## 7. 下一阶段建议

推荐阶段名称：`v0.1 产品原型收口阶段`

### 已完成

1. 收口 Web 版本边界
- 主界面已收敛为 `Editor + Preview`
- `Tree` 保留代码但已退出 v0.1 默认展示

2. 固化 `reaction.conditions` 字段
- 字段语义与 `|` 分隔约定已进入核心 contract
- AST / parser / renderer / exporter 已贯通

3. 补强 molecule 写回安全
- OCR 与结构保存改为基于最新 source 回写
- 结构缓存已增加 `sessionId` 维度
- 多 molecule 场景下不再默认写入不明确目标

### 剩余优先级 P0

1. 统一 render constraints
- `render-profile` 成为唯一真相来源
- 清除 profile、renderer、backend 之间的合法值漂移

2. 接 RDKit molecule normalize/render
- 让 molecule 正式预览主路径成立

3. 建立 molecule Ketcher 闭环
- 打开、编辑、保存、回写、刷新预览全部打通

### 剩余优先级 P1

1. 接 molecule OCR provider 最小链
- 图片或截图进入系统后可静默写回 molecule block

2. 正式化 reaction render contract
- reaction 预览不再只依赖轻量草图输出

3. 建立 reaction Ketcher 闭环
- reaction 预览上提供修改入口
- 修改后可回写标准 reaction block

### 剩余优先级 P2

1. 接 reaction OCR provider 最小链
- 反应图进入系统后可静默写回标准 reaction block

2. 完善前端组件边界
- molecule / reaction 卡片
- OCR 入口
- structure editor
- reaction editor

3. 继续补强 frontmatter 与 Markdown contract
- 但只做不阻塞产品主链的收口工作

### 明确后移到 v0.2 的事项

- Tree 正式化
- training-export
- 围绕 Tree 和 training-export 的系统化产品设计

---

## 8. 当前验证状态

已验证（2026-04-02 最近一轮）：
- `pnpm --filter @chemd/parser test -- parser.test.ts`
- `pnpm --filter @chemd/compiler test -- compiler.test.ts`
- `pnpm --filter @chemd/renderer-html test -- renderer-html.test.ts`
- `pnpm --filter @chemd/renderer-svg test -- renderer-svg.test.ts`
- `pnpm --filter @chemd/exporter-training test`
- `pnpm --filter @chemd/web test -- page.test.tsx ocr-molecule-writeback.test.ts structure-save.test.ts load-structure-draft.test.ts structure-store.test.ts chem-ocr-route.test.ts chem-structure-route.test.ts`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
- `pnpm test`
- `pnpm typecheck`

需要强调：
- 当前验证结论主要证明“现有可运行骨架成立，且最近一轮收口修复没有打坏现有主链”。
- 不代表新的 v0.1 产品边界已经完成。
- 尤其不代表 RDKit、reaction OCR、reaction Ketcher 闭环已经完成。

---

## 9. 当前结论

当前最合理的版本判断应改为：

**`chemd v0.1` 是一个以 `Editor + Preview` 为核心的化学文档产品原型。它已经具备语言内核、模板引用、预览导出和部分化学交互基础；下一步应围绕 `molecule` 与 `reaction` 两条主线，接入外部 OCR provider、RDKit 正式渲染/规范化，以及 Ketcher 编辑闭环。`Tree` 与 `training-export` 不属于 v0.1 正式范围，其中 Tree 以实验性能力保留代码并计划在 v0.2 正式化，training-export 整体转入 v0.2。**
