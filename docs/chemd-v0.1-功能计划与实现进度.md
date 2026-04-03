# chemd v0.1 功能计划与实现进度表

状态：按当前产品方向重写  
更新时间：2026-04-04（阶段 34：reaction host adapter 已切到 bridge envelope）

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
- molecule render route 已形成 `normalize -> render` 主链
- chem-service 在运行时存在 `rdkit` 时会优先走 RDKit normalize/render，否则保留 fallback
- molecule 编辑弹窗已具备 bridge import/export、molfile round-trip 与预览刷新闭环
- molecule OCR provider 的运行时 hook 已接入，并已扩展到 Mathpix / MolScribe / DECIMER
- v0.1 当前优先走 Mathpix 外部 API，不再受本地模型运行时限制
- Mathpix 的环境模板、healthz 自检与请求契约已补齐
- 当前剩余工作主要是补齐真实 API 凭证并完成一次联调验证
- 临时结构缓存继续作为编辑态承载位保留

3. `reaction` 主链
- `reaction` block 解析、校验、引用与基础预览已纳入主线
- reaction OCR 的 web route、页面入口与静默回写标准 `reaction` block 的最小链路已具备
- reaction 已可从 preview 修改入口打开最小编辑弹窗并保存回文档
- reaction 已可从服务端会话缓存恢复草稿，再回退到本地 draft / preview payload
- reaction 编辑器已拆成 helper / frame / dialog 三层，为后续接正式 Ketcher 留出替换位
- reaction frame 已带上 sketch surface 与结构摘要，正式 Ketcher 接入点更明确
- reaction editor 已补上 import/export bridge contract，dialog 与 frame 的职责边界更清晰
- molecule Ketcher 侧也已补齐 ketcher-ready shell 与 bridge export 路径
- 正式 OCR provider 仍待接入
- `reaction` 新增 `conditions` 字段
- `conditions` 使用 `|` 分隔多个条件项
- 预览修改入口与标准 save payload 已具备基础能力
- `Ketcher` 反应骨架编辑 UI 与正式编辑闭环仍待补齐
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
| `@chemd/render-profile` | 已实现主链约束 | 已上收 render constraints 与 adapter payload 约束 |
| `@chemd/renderer-html` | 部分实现 | 继续承担文档 HTML 预览装配 |
| `@chemd/renderer-json` | 已实现 | 继续承担 inspect / 调试输出 |
| `@chemd/renderer-svg` | 部分实现 | 保留为 fallback renderer，不再定义为长期主渲染层 |
| `@chemd/renderer-docx` | 已实现最小链路 | 保留 DOCX bridge 与导出能力 |
| `@chemd/compiler` | 已实现 | 继续作为编排入口 |
| `@chemd/web` | 部分实现 | 收敛为 `Editor + Preview` 产品原型 |
| `services/chem-service` | 已有 fallback 外壳与 reaction endpoint 形状 | 作为 RDKit / OCR provider 接入位 |
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
| RDKit normalize/render | 已接入运行时优先路径 | chem-service 检测到 `rdkit` 运行时后优先走 RDKit，否则保留 fallback |
| molecule OCR provider 接入 | 部分实现 | chem-service 已有 Mathpix / MolScribe / DECIMER provider hook；v0.1 主路线已切到 Mathpix，当前待真实凭证联调 |
| reaction OCR provider 接入 | 已有 web route 与服务外壳 | 页面入口、route 与静默回写已接通，正式 provider 仍未接入 |
| molecule Ketcher 闭环 | 已实现最小闭环 | 已支持 draft load、bridge import/export、save route、source 回写与基于结构缓存的预览刷新 |
| reaction Ketcher 闭环 | 未完成 | 预览修改入口、最小编辑弹窗、save route 与 block 写回工具已具备，正式 Ketcher UI/闭环仍待补齐 |

### 5.3 Web / Playground

| 功能 | 状态 | 备注 |
|---|---|---|
| 源码编辑 | 已实现 | `textarea` 编辑器已存在 |
| 实时重编译 | 已实现 | 去抖与低优先级调度已接通 |
| 预览面板 | 已实现 | 当前已承载 HTML/JSON/DOCX 切换，molecule 与 reaction 都可走后端预览升级 |
| DOCX 导出 | 已实现最小链路 | 接口已做基础保护 |
| Tree 面板 | 已有实验性实现 | v0.1 主界面应隐藏，转入 v0.2 |
| OCR 入口 | 部分实现 | `molecule` 路径已具备入口、静默回写与会话隔离保护；`reaction` 路径已具备独立按钮入口、route 与静默回写壳层，但两者都未接正式 provider |
| 结构修改弹窗 | 部分实现 | `molecule` 路径已有最小草稿加载/保存链路；reaction 已接入 preview bridge、draft load、最小编辑弹窗、save route 与 block 写回 helper，正式 Ketcher 闭环未完成 |

---

## 6. 最近已完成的关键基础工作

以下能力已经为 v0.1 产品原型打下基础：

1. 语言内核主链已跑通
- parser / resolver / render-profile / compiler 已形成可运行闭环。

2. 模板与引用能力已进入稳定阶段
- 嵌套 `use`、循环检测、alias 绑定、主对象回退均已具备基础可用性。

3. `render-profile` 已上收主链约束
- fallback、cycle、unknown field、invalid value、overrides 等基础诊断已存在。
- adapter payload 约束已从 renderer 侧回收到 `render-profile`。

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
- 当前虽主要返回 fallback 响应，但已具备 molecule / reaction 双路径 endpoint 承载位。

11. reaction 预览升级已接通
- Web preview 现已支持 reaction backend hydration。
- preview bridge 已能发出 reaction 修改消息。
- reaction render route、DTO/store 基础契约已落地。

12. reaction save contract 已落地
- 已新增 reaction save route。
- reaction block 的 insert/update helper 已就位。
- reaction draft load helper 已补齐，为后续编辑 UI 留出承载位。

13. reaction OCR 最小主链已接通
- 已新增 reaction OCR web route。
- 页面层已提供独立 reaction OCR 入口。
- reaction OCR 结果已可静默写回标准 `reaction` block。
- placeholder provider 会被显式拦截，不会伪造回写成功。

14. reaction 最小编辑闭环已接通
- preview 中的 reaction 修改入口现在会打开编辑弹窗。
- reaction draft 已可优先从本地草稿恢复，再回退到 preview payload。
- 保存后会调用 reaction save route，并回写标准 `reaction` block。
- 当前仍是最小文本编辑壳，不代表正式 Ketcher reaction UI 已完成。

15. reaction 会话草稿 hydration 已接通
- 已新增 reaction structure route，用于读取会话缓存中的 reaction draft。
- `loadReactionDraft` 现在会按“本地 draft -> 服务端会话缓存 -> preview payload”顺序恢复编辑态。
- reaction save route 写入的缓存不再只写不读。

16. reaction 编辑器组件边界已收口
- reaction list 解析/格式化逻辑已独立成 helper。
- reaction 编辑表单已独立成 `ReactionFrame`。
- `ReactionDialog` 只保留状态与保存流程，后续替换成正式 Ketcher 壳时改动面更小。

17. reaction sketch shell 已收口
- `ReactionFrame` 已提供 ketcher-ready 的 sketch surface 占位区。
- 当前弹窗内可直接看到 reactants / products / conditions 的即时结构摘要。
- 后续接正式 Ketcher 时，优先替换 `ReactionFrame` 内部承载区即可。

18. molecule Ketcher shell / bridge 已收口
- `KetcherFrame` 已升级为 ketcher-ready 的 structure sketch shell。
- `useKetcherBridge` 不再是空 hook，已提供标准 draft export 归一化路径。
- `KetcherDialog` 保存时已统一走 bridge export，而不是绕过 bridge 直接提交。

19. reaction bridge contract 已收口
- 已新增 `useReactionBridge`，统一 reaction draft 的 import/export 路径。
- `ReactionDialog` 初始化与保存已改为走 bridge，而不是各自维护一套转换逻辑。
- `ReactionFrame` 已切到单一 `value/onChange` 合同，并显式标注 bridge-ready 状态。
- 当前仍是文本壳层，不代表正式 reaction Ketcher iframe/editor 已接入。

20. molecule P0 主链已收口
- `/api/chem/render` 已改为先 normalize 再 render，molecule render route 不再绕过 normalize。
- chem-service 已补上可选 RDKit 路径；运行时存在 `rdkit` 时，`/normalize` 与 `/render` 会优先返回 RDKit 结果。
- preview hydration 现在会优先读取 molecule 结构缓存中的 `molfile`，再回退到文档中的 `smiles`。
- molecule editor 已补齐 bridge import/export、molfile 编辑与 save 后预览刷新链路。
- 当前仍是 ketcher-ready shell，不代表真实第三方 Ketcher iframe 已接入。

21. molecule OCR provider hook 已接入
- chem-service 的 `/ocr` 已补上可选 provider hook，不再只有硬编码 placeholder。
- 当前 molecule OCR provider 目标已明确为 MolScribe，并已支持 checkpoint path / Hugging Face repo-file 解析。
- provider 未启用或运行时不可用时，仍会安全返回 failed placeholder，不会伪造化学结构。
- 但当前机器只有 `Python 3.14`，Poetry 解析 MolScribe 时会落到 `torch==1.13.1`，本地还无法真正启用该 provider。

22. molecule OCR providers hook 已扩展
- chem-service 已补上 `decimer` provider adapter，可与现有 `molscribe` adapter 并存。
- provider 分发、base64 解码、临时文件调用与失败回退契约已统一。
- 但当前机器只有 `Python 3.14`，Poetry 解析 DECIMER 时会落到 `tensorflow==2.20.0`，本地同样无法真正启用该 provider。

23. Mathpix OCR provider 已接入主路线
- chem-service 已补上 `mathpix` provider adapter，并支持 `app_id/app_key` 请求头与 data URI 请求体。
- Mathpix 返回的 `text` / `latex` / `latex_normal` 字段现在会统一走 SMILES 抽取逻辑。
- v0.1 的 molecule OCR 主路线现已明确切到外部 API，不再依赖本机 OCR 模型运行时。
- 当前剩余阻塞主要是补齐真实 Mathpix 凭证并完成一次真实接口联调。

24. Mathpix 联调准备已完成
- 已新增 `services/chem-service/.env.example`，便于直接填入 Mathpix 凭证。
- `/healthz` 已补上 OCR provider 自检信息，可在不泄露 secret 的前提下确认配置是否生效。
- Mathpix 缺凭证、请求头和 data URI 请求体的基础契约均已纳入测试。

25. reaction render contract 与本地 draft 防陈旧已收口
- `/api/chem/reaction/render` 现在会稳定返回 `svg + warnings + renderer + reaction` 的结构化合同。
- preview reaction hydration 现在会优先读取 `/api/chem/reaction/structure` 中的会话草稿，再回退到文档里的 reaction payload。
- chem-service 的 `/reaction/render` fallback 响应也已对齐同一合同形状，便于后续无缝替换正式 render provider。
- reaction 本地 draft 现在会校验是否仍匹配当前 preview/source；不匹配时会自动丢弃，避免旧草稿覆盖新内容。

26. reaction save helper contract 已对齐
- 已新增 `reaction-save` helper，reaction 保存请求与保存后草稿回写不再散落在页面组件里。
- 页面层现在会像 molecule 一样，统一走 `build*SaveRequest / resolveSaved*Draft` 这组 helper。
- 后续接正式 reaction editor bridge 时，页面层只需要替换 editor 输入源，不必再重复改 save contract。

27. reaction dialog 本地暂存已接通
- `ReactionDialog` 在编辑过程中会持续把当前 draft 写入本地存储，关闭后再次打开不再丢失未保存编辑。
- 本地暂存会继续沿用 `sourceReactionKey` 作为基线签名，因此仍保留“源内容变了就丢弃旧 draft”的防陈旧行为。
- `loadReactionDraft` 现在会显式透传基线签名，后续接正式 reaction editor bridge 时可以继续复用这套恢复策略。

28. reaction frame 插槽层已落地
- `ReactionFrame` 现在支持 `renderSurface / renderFields` 两个替换位。
- 默认仍渲染当前文本壳，但正式 reaction editor bridge 后续可以直接替换 surface、输入区或两者一起替换。
- `ReactionFrame` 已从“硬编码 UI”变成“默认实现 + 可注入插槽”的承载层。

29. reaction dialog bridge / frame 注入位已落地
- `ReactionDialog` 现在支持注入自定义 `bridge`，不再强绑定默认文本 bridge。
- `ReactionDialog` 也支持注入自定义 `renderFrame`，可直接替换整块编辑承载区，同时继续复用保存、错误、关闭与本地暂存逻辑。
- 这意味着后续接正式 reaction editor adapter 时，不必重写 dialog 主流程，只需要替换 bridge/frame 注入项。

30. reaction text adapter 已实际接入页面
- 已新增 `reactionTextEditorAdapter`，把当前文本 reaction editor 包装成标准 adapter，而不是继续散落在 dialog/frame 默认实现里。
- 页面层现在已经通过 adapter 路径接入 reaction editor，后续替换成真实第三方 editor 时可以直接替换同一 adapter 位。
- `ReactionFrame / ReactionDialog / Page` 三层都已被验证可继续沿用，不需要为了接下一个 editor 再做一次大拆分。

31. reaction editor 通用 adapter state 已补齐
- `ReactionDialog` 内部状态不再直接绑定 `ReactionFrameValue` 文本模型，而是升级为通用 `draft + payload` adapter state。
- reaction editor adapter 现在需要显式提供 `createState / exportDraft / renderFrame`，后续可承载非文本型第三方 editor。
- 默认 text adapter 仍可工作，但已不再是 dialog 的隐藏真相层。

32. reaction render provider seam 已补齐
- `chem-service` 的 `/reaction/render` 不再是纯硬编码 fallback 逻辑，而是先经过 provider 分发函数。
- 当前 provider 仍只有 fallback，但后续接正式 reaction render provider 时，改动面已收缩到服务端 provider 层。
- 这使得“reaction render contract 已对齐，剩余是 provider 接入”这一判断更接近代码现状。

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

4. 统一 render constraints 与 adapter payload
- `render-profile` 已成为当前 adapter payload 的唯一约束来源
- `renderer-svg` 不再维护独立的一套范围与联动钳制逻辑

5. 打通 reaction 预览升级主链
- 已新增 reaction render route
- preview hook 已支持 reaction backend hydration
- reaction edit message 已进入 preview bridge

6. 打通 reaction save 基础契约
- 已新增 reaction save route
- 已支持标准 `reactants/products/conditions` payload 回写
- 已补 reaction block 写回 helper

7. 打通 reaction OCR 最小主链
- 已新增 reaction OCR route
- 页面工具栏已提供 reaction OCR 按钮入口
- 已支持标准 reaction block 的静默回写
- 仍未接正式 OCR provider

8. 打通 reaction 最小编辑闭环
- preview reaction edit message 已接到页面层
- 已支持 draft load / local draft restore
- 已支持 save route 返回后更新 source
- 当前编辑器仍是最小文本弹窗，不是正式 Ketcher reaction UI

9. 打通 reaction 会话草稿 hydration
- 已新增 reaction structure GET route
- 已支持按 sessionId 读取 reaction draft cache
- reaction 编辑再次打开时可恢复最近一次保存结果

10. 收口 reaction 编辑器组件边界
- 已拆出 reaction list helper
- 已拆出 `ReactionFrame`
- dialog 逻辑与编辑表单职责已分离

11. 收口 reaction sketch shell
- `ReactionFrame` 已具备 sketch surface 语义
- 已展示 reaction 结构摘要与计数
- 正式 Ketcher bridge 的替换位已明确

12. 收口 molecule Ketcher shell / bridge
- `KetcherFrame` 已具备 structure sketch shell
- molecule Ketcher save 已接入统一 bridge export
- molecule / reaction 两侧的编辑承载方式开始对齐

13. 收口 reaction bridge contract
- `ReactionDialog` 已通过 bridge 统一处理草稿导入与保存导出
- `ReactionFrame` 已切到 `value/onChange` 单一编辑合同
- 后续接正式 reaction editor bridge 时，可优先替换 `useReactionBridge` 与 frame 内承载区

14. 接入 reaction Ketcher host shell
- 已新增独立 `ReactionKetcherFrame`
- 已新增 `reaction-ketcher-shell-adapter`
- page 层已从纯文本 adapter 切到 reaction host shell adapter
- 当前仍不是正式第三方 Ketcher，只是把 reaction editor 接入位收口到独立 host 组件

15. reaction host adapter 已切到 bridge envelope
- `reaction-ketcher-shell-adapter` 现在不再直接暴露文本 payload，而是改用独立 bridge envelope
- 已新增 `reaction-ketcher-shell` helper，统一 host payload 的创建、归一化与导出
- `ReactionKetcherFrame` 现在显式展示 `bridgeMode` 与 `syncToken`
- 这一步让后续真实第三方 reaction editor 接入时，只需要替换 host bridge，不必再把文本模型当作 adapter 真相层

### 剩余优先级 P1

1. 接 molecule OCR provider 最小链
- chem-service provider hook 已落地，当前已支持 Mathpix / MolScribe / DECIMER 三种 adapter
- v0.1 主路线已切到 Mathpix，当前剩余工作主要是补齐真实凭证并完成真实联调
- 图片或截图进入系统后可静默写回 molecule block

2. 正式化 reaction render contract
- route、preview hydration、chem-service fallback/provider seam 响应合同已对齐
- 当前剩余主要是把 provider seam 后面的 fallback 实现替换成正式 reaction render provider

3. 建立 reaction Ketcher 闭环
- reaction 预览上已提供修改入口
- 最小编辑弹窗、save route、session draft hydration 与标准 block 回写已具备
- page 层 reaction save contract 已与 molecule 路径对齐
- frame / dialog / bridge 三层都已补上注入位
- reaction host shell adapter 已实际接入页面
- 通用 adapter state 已补齐，可承载非文本 editor
- 当前剩余主要是把第三方 reaction editor / Ketcher 真正挂到现有 host adapter 位上

### 剩余优先级 P2

1. 接正式 reaction OCR provider
- 用真实 provider 替换当前 placeholder shell
- 保持现有静默写回与失败保护契约不变

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

累计验证（2026-04-03）：
- `pnpm --filter @chemd/render-profile test`
- `pnpm --filter @chemd/parser test -- parser.test.ts`
- `pnpm --filter @chemd/compiler test -- compiler.test.ts`
- `pnpm --filter @chemd/renderer-html test -- renderer-html.test.ts`
- `pnpm --filter @chemd/renderer-svg test -- renderer-svg.test.ts`
- `pnpm --filter @chemd/exporter-training test`
- `pnpm --filter @chemd/web test -- page.test.tsx ocr-molecule-writeback.test.ts structure-save.test.ts load-structure-draft.test.ts structure-store.test.ts chem-ocr-route.test.ts chem-structure-route.test.ts`
- `pnpm --filter @chemd/web test -- reaction-render-route.test.ts`
- `pnpm --filter @chemd/web test -- reaction-save-route.test.ts`
- `pnpm --filter @chemd/web test -- preview-edit-message.test.ts`
- `pnpm --filter @chemd/web test -- rendered-preview-helpers.test.ts`
- `pnpm --filter @chemd/web test -- reaction-editor-utils.test.ts`
- `pnpm --filter @chemd/web test -- preview-shell.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-render-route.test.ts rendered-preview-helpers.test.ts`
- `pnpm --filter @chemd/web test -- reaction-structure-route.test.ts preview-edit-message.test.ts preview-shell.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-dialog.test.tsx reaction-frame.test.tsx reaction-bridge.test.ts reaction-editor-utils.test.ts page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-save.test.ts page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-save.test.ts reaction-editor-utils.test.ts reaction-render-route.test.ts rendered-preview-helpers.test.ts page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-editor-utils.test.ts reaction-dialog.test.tsx page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-frame.test.tsx reaction-dialog.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-dialog.test.tsx reaction-frame.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-text-editor-adapter.test.tsx reaction-dialog.test.tsx reaction-frame.test.tsx page.test.tsx`
- `poetry run python -m unittest discover -s tests -p 'test_*.py'`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
- `pnpm test`
- `pnpm typecheck`
- `pnpm --filter @chemd/web test -- reaction-ocr-route.test.ts page.test.tsx reaction-save-route.test.ts reaction-editor-utils.test.ts`
- `pnpm --filter @chemd/web test -- reaction-ocr-route.test.ts reaction-save-route.test.ts reaction-editor-utils.test.ts reaction-dialog.test.tsx page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-structure-route.test.ts reaction-editor-utils.test.ts`
- `pnpm --filter @chemd/web test -- reaction-list.test.ts reaction-frame.test.tsx reaction-dialog.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-frame.test.tsx reaction-dialog.test.tsx`
- `pnpm --filter @chemd/web test -- ketcher-bridge.test.ts ketcher-frame.test.tsx ketcher-dialog.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-bridge.test.ts reaction-frame.test.tsx reaction-dialog.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-bridge.test.ts reaction-list.test.ts reaction-frame.test.tsx reaction-dialog.test.tsx reaction-editor-utils.test.ts ketcher-bridge.test.ts ketcher-frame.test.tsx ketcher-dialog.test.tsx page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-ketcher-frame.test.tsx reaction-ketcher-shell-adapter.test.tsx reaction-dialog.test.tsx reaction-frame.test.tsx page.test.tsx`
- `pnpm --filter @chemd/web test -- reaction-ketcher-shell.test.ts reaction-ketcher-frame.test.tsx reaction-ketcher-shell-adapter.test.tsx`
- `pnpm typecheck`
- `pnpm --filter @chemd/web test`
- `python -m unittest discover -s services/chem-service/tests -p 'test_*.py'`
- `pnpm test`
- `poetry run python -m unittest discover -s tests -p 'test_*.py'`
- `pnpm --filter @chemd/web test -- chem-ocr-route.test.ts`

需要强调：
- 当前验证结论主要证明“现有可运行骨架成立，且最近一轮收口修复没有打坏现有主链”。
- 不代表新的 v0.1 产品边界已经完成。
- 尤其不代表 RDKit、正式 reaction OCR provider、reaction 编辑 UI、reaction Ketcher 闭环已经完成。

---

## 9. 当前结论

当前最合理的版本判断应改为：

**`chemd v0.1` 是一个以 `Editor + Preview` 为核心的化学文档产品原型。它已经具备语言内核、模板引用、预览导出和部分化学交互基础；下一步应围绕 `molecule` 与 `reaction` 两条主线，接入外部 OCR provider、RDKit 正式渲染/规范化，以及 Ketcher 编辑闭环。`Tree` 与 `training-export` 不属于 v0.1 正式范围，其中 Tree 以实验性能力保留代码并计划在 v0.2 正式化，training-export 整体转入 v0.2。**
