# chemd v0.1 架构文档（中文更新版）

状态：按当前产品方向重写  
更新时间：2026-04-02

---

## 1. 架构目标

v0.1 架构现在需要服务于**产品原型**，而不只是语言内核本身。

v0.1 架构目标应调整为：

1. `chemd` 文档继续保持纯 Markdown 文件形态。
2. 化学和实验对象被解析为结构化 AST 节点。
3. 系统支持轻量引用与模板复用。
4. 渲染风格通过独立的 render profile 控制。
5. 同一份源文档可以驱动 HTML、JSON、DOCX bridge 等输出。
6. Web 端主界面收敛为 `Editor + Preview` 产品原型。
7. `molecule` 与 `reaction` 都进入正式产品主线。
8. OCR、专业渲染和结构编辑依赖外部成熟能力接入，而不是继续自研重轮子。

---

## 2. 非目标

v0.1 不尝试提供：
- 完整桌面 ELN 产品
- 完整项目管理平台
- `Tree` 的正式产品化信息架构
- `training-export` 主线能力
- 完整双向 DOCX 编辑
- 任意编程式模板语言
- 全领域标准化分析 schema
- 自研高质量 depiction engine
- 自研 OCR 模型内核

补充说明：
- `Tree` 可以保留实验性代码，但不属于 v0.1 正式主界面。
- `training-export` 虽然已在仓库出现实现，但应整体归入 v0.2。

---

## 3. 技术栈

当前架构继续采用：
- TypeScript
- Node.js / 浏览器双运行时
- `pnpm workspace`
- `turbo`
- Next.js 15
- React 19
- Vitest

化学能力路线：
- `chemd` 自己负责文档语义、编译链、回写与诊断
- OCR 通过外部 provider 接入
- 正式 normalize / render 主路径切向 RDKit
- 图形化编辑依赖 Ketcher

---

## 4. 核心边界：语义 AST vs Render Options

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
- 语义层与渲染层边界已经是当前代码里最稳定的一部分。
- v0.1 接入 RDKit / OCR provider / Ketcher 时，不应破坏这条边界。

---

## 5. 系统流水线

### 5.1 文档编译主链

```text
source .md
  -> parseChemd()
  -> resolveChemd()
  -> resolveRenderProfileWithDiagnostics()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

说明：
- 当前文档编译主链已经可运行。
- parser 仍是轻量实现，不是真正 YAML / Markdown parser。
- render adapter payload 已接入主链路，但正式化学渲染后端仍未完成。

### 5.2 化学交互主链

v0.1 产品原型还需要补上一条正式的化学交互主链：

```text
image / screenshot
  -> OCR provider
  -> normalize / render backend
  -> write back chemd block
  -> preview
  -> Ketcher edit
  -> write back chemd block
```

说明：
- `molecule` 与 `reaction` 都应进入这条主链。
- `molecule` 当前已有 Web 入口壳层、服务接入位与 fallback renderer，可继续向正式主链收口。
- `reaction` 的 Web / API / Ketcher 正式主链仍是目标态，当前不能按“已落地”描述。
- `reaction.conditions` 保留在文本文档字段中，不要求放入图形编辑器内部维护。
- `renderer-svg` 继续作为 fallback，但不应再被定义为长期主 depiction 路线。

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
    exporter-training/
    parser/
    render-profile/
    renderer-docx/
    renderer-html/
    renderer-json/
    renderer-svg/
    resolver/
  services/
    chem-service/
  docs/
```

与 v0.1 版本边界对照：
- v0.1 主干：`core`、`parser`、`resolver`、`render-profile`、`compiler`、`renderer-html`、`renderer-json`、`renderer-svg`、`renderer-docx`、`web`、`chem-service`
- v0.2 预留：`exporter-training`

当前判断：
- 目录结构已经不再只是“语言内核仓库”，而是开始演进为产品原型仓库。
- 但 v0.1 文档应把 `exporter-training` 从主叙事中移出，避免版本范围混乱。

---

## 7. 各包职责

### 7.1 `@chemd/core`
职责：
- AST 类型
- diagnostics 类型
- 创建辅助函数

### 7.2 `@chemd/parser`
职责：
- frontmatter 解析
- `chemd` block 解析
- `:chem[...]` 与 `@...` token 化
- 模板体结构化解析
- `render_overrides` 前置提取

### 7.3 `@chemd/resolver`
职责：
- 对象索引
- 模板索引
- 引用解析
- 模板展开
- 语义校验

### 7.4 `@chemd/render-profile`
职责：
- profile 注册
- 继承解析
- fallback
- diagnostics
- 基础 schema validation
- 文档级 overrides 合并

要求：
- 必须成为 render constraints 的唯一真相来源。

### 7.5 `@chemd/renderer-html`
职责：
- 输出 HTML 预览
- 渲染结构化块和 inline chemistry

### 7.6 `@chemd/renderer-json`
职责：
- 输出结构化 JSON

### 7.7 `@chemd/renderer-svg`
职责：
- molecule / reaction SVG fallback 输出

新定位：
- 保留为 fallback renderer
- 测试环境与无正式后端时的展示桩
- 不再定义为长期正式 depiction 主路径

### 7.8 `@chemd/renderer-docx`
职责：
- DOCX bridge payload / markdown handoff 输出

### 7.9 `@chemd/compiler`
职责：
- 把 parse / resolve / profile / render 串成统一 API

约束：
- 继续保持纯编排定位
- 不承接长任务、子进程和 OCR provider 编排逻辑

### 7.10 `apps/web`
职责：
- `Editor + Preview` 产品原型 UI
- OCR、结构编辑、导出等入口壳层

### 7.11 `services/chem-service`
职责：
- 承接 RDKit、OCR provider、临时结构缓存等后端能力
- 作为 Web 侧 `/api/chem/*` 的下游服务位

---

## 8. AST 结构现状

当前 AST 可分为三层：

1. 文档层：`ChemdDocument`
2. 节点层：`MarkdownNode` 与各类 `StructuredNode`
3. token 层：references、inline chemistry

模板相关 contract：
- `TemplateNode.body` 已是结构化子节点数组，而不是单段字符串。
- resolver 可以递归展开 `use`，并在展开链上检测循环。

render 相关 contract：
- `ChemdDocument.renderSelection` 同时承载 `profileId` 与 `overrides`。
- `RenderOptions` 仍保持独立，不回写进语义 AST。

---

## 9. 渲染系统

### 9.1 当前状态
- HTML：已实现
- JSON：已实现
- fallback SVG：已实现
- DOCX bridge：已实现最小链路

### 9.2 v0.1 目标分层
- `render-profile` 继续表达产品层风格参数
- RDKit 承担正式 normalize / depiction 主路径
- `renderer-svg` 保留为 fallback

### 9.3 reaction 渲染要求
- reaction 不应继续停留在轻量草图阶段
- reaction 正式预览应进入与 molecule 一样的正式后端路线
- reaction 的 OCR provider、Web 交互入口和 Ketcher 编辑闭环仍待补齐
- `conditions` 保留在 `chemd` 文本文档字段中，渲染时放到合适位置

---

## 10. Web 界面状态

v0.1 的默认 UI 与标准产品形态应是：
- 左：编辑器
- 右：预览

补充说明：
- diagnostics、JSON、DOCX bridge 等 inspect 内容可以保留在原型中，但不要求继续把 v0.1 定义为三栏工作台。
- `Tree` 当前只应视为实验性能力，不属于 v0.1 正式主界面。

当前判断：
- Web 已不再只是开发调试壳。
- 下一步应先收口版本边界，再继续补 molecule / reaction 的正式主链。

---

## 11. 当前架构阶段判断

结合代码现状，当前更适合定义为：

**语言内核主链已打通，模板系统已进入可递归展开的闭环阶段，render-profile 已进入基础可校验并支持 overrides 的阶段；但 v0.1 现在最关键的问题已经不只是“规范是否收口”，而是“产品边界与正式化学主链是否清楚”。**

---

## 12. 下一阶段建议

推荐阶段：`v0.1 产品原型收口阶段`

优先顺序：
1. 收口 Web 版本边界，主界面回到 `Editor + Preview`
2. 统一 `render-profile` 与 render constraints
3. 接 RDKit molecule normalize / render 主路径
4. 建立 molecule Ketcher 编辑闭环
5. 接 molecule OCR provider 最小链
6. 正式化 reaction render contract
7. 固化 `reaction.conditions` 字段
8. 建立 reaction OCR / Ketcher 闭环

理由：
- 现在最大的版本风险已经不是 parser 是否还能继续工作，而是产品边界已经开始漂移。
- 如果不先把 Web 形态、render 真相来源和 molecule / reaction 两条主线收口，后续继续补 feature 会让 v0.1 与 v0.2 混在一起。

---

## 13. 具体切入建议

### 第一优先级
- `packages/render-profile/src/*`
- `packages/compiler/src/*`
- `services/chem-service/*`

目标：
- render constraints 单一来源
- RDKit molecule normalize / render 接入
- 正式 backend payload contract 建立

### 第二优先级
- `apps/web/src/features/preview/*`
- `apps/web/src/features/structure-editor/*`
- `apps/web/src/features/ocr/*`

目标：
- `Editor + Preview` 主界面收口
- molecule 的 OCR / 预览 / 编辑闭环建立

### 第三优先级
- `packages/core/src/*`
- `packages/parser/src/*`
- `apps/web/src/features/reaction-*`

目标：
- `reaction.conditions` contract 收口
- reaction render payload 正式化
- reaction OCR / Ketcher 闭环建立

---

## 14. 架构结论

当前工程已经具备继续推进 v0.1 的正确基础：
- monorepo 结构合理
- 语义与渲染边界清晰
- 编译入口统一
- 测试链路存在
- 模板递归展开与循环检测已落地
- render-profile 基础字段级校验与 overrides 已落地
- Web 端已出现 OCR、结构编辑和导出等产品雏形

但 v0.1 的核心问题已经不再只是“规范是否收口”，还包括“产品边界是否清楚”。更准确的表述应是：

**当前架构已经适合继续开发，但 v0.1 应定义为 `Editor + Preview` 的化学文档产品原型。下一步应优先统一 render constraints，并围绕 molecule / reaction 两条主线接入外部 OCR provider、RDKit 正式渲染/规范化和 Ketcher 编辑闭环；`Tree` 与 `training-export` 不属于 v0.1 正式范围。**
