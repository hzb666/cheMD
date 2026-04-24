# OCR Provider + Ketcher + RDKit 集成设计

状态：按 v0.1 产品原型方向重写
更新时间：2026-04-02

---

## 背景

当前 `chemd` 仓库已经具备以下基础能力：

- `chemd` 文本编辑
- parser / resolver / render-profile 编译链
- HTML / JSON / DOCX bridge 输出
- Web playground 预览界面

但当前正式化学主链仍未完成，主要缺口包括：
- 高质量分子与反应图渲染
- 图片到分子 / 反应的 OCR 接入
- 图形化人工纠错编辑
- 与文档回写联动的临时结构缓存

本设计的目标是把以下能力统一接入当前仓库：
- **OCR provider**：分子 / 反应识别
- **RDKit**：结构规范化、校验、渲染
- **Ketcher**：分子与反应骨架的人工纠错编辑器

说明：
- OCR 不绑定单一库。
- `MolScribe`、`RxnScribe`、外部视觉 API、外部 OCR 大模型 API 都属于可选 provider。
- `chemd` 自己不实现 OCR 模型内核。

---

## 产品目标

v0.1 的目标不是做完整 ELN，也不是做通用 IDE，而是做一个以 `Editor + Preview` 为核心的化学文档产品原型。

v0.1 的两条对象主线：
- `molecule`
- `reaction`

产品核心体验：

1. 用户在左侧编辑 `chemd` 文本
2. 用户上传图片、粘贴截图或调用外部 OCR 能力
3. 系统自动识别分子或反应
4. 系统默认静默写回标准 `chemd` block
5. 右侧立即显示 RDKit 质量的正式预览
6. 用户若不满意，可以点击修改按钮弹出 `Ketcher`
7. 保存后，系统重新规范化并回写文档

---

## 最终产品形态

v0.1 UI 目标应收敛为：
- 左：`chemd` 编辑器
- 右：预览与 inspect

版本边界说明：
- `Tree` 不属于 v0.1 正式主界面，只作为实验性能力保留代码。
- `Ketcher` 不作为常驻区域，不占主工作区。
- `Ketcher` 只作为纠错弹窗出现。
- OCR 成功后默认不打断用户。

---

## 关键产品决策

### 1. OCR 是输入加速层，不是真相层

OCR 的职责是：
- 从图片 / 截图得到分子或反应草稿
- 进入后续 normalize / render / review 流程

OCR 结果不应被当作最终真相。

### 2. 默认静默写回文本

识别成功后：
- 默认不弹编辑器
- 默认直接把标准化结果写回文档
- 用户通过预览即时看到效果

### 3. Ketcher 是纠错工具，不是主文档编辑器

`Ketcher` 的定位是：
- 分子结构纠错工具
- 反应骨架纠错工具
- 视觉姿态修正工具

它不负责：
- `chemd` 文本编辑
- 文档树
- 主流程自动回写策略

### 4. 文档层仍然保存 `chemd` 语义字段

#### molecule

`molecule` block 只保存：
- `smiles`

不把 `molfile` 持久写进文档。

#### reaction

`reaction` block 保存正式语义字段，例如：

```md
:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
yield: 63%
:::
```

说明：
- `conditions` 新增为 v0.1 正式字段。
- `conditions` 使用 `|` 分隔多个条件项。
- 条件继续以文本语义字段存在，不要求放入 Ketcher 内部维护。

### 5. 编辑态结构只做短期缓存

服务端临时保存：
- molecule：`molfile`
- reaction：`rxnfile` 或等价 reaction payload

它们只用于：
- 保留 OCR 或 Ketcher 的编辑状态
- 后续重新打开 Ketcher 时恢复更接近原图的布局

---

## 系统角色划分

### OCR Provider

职责：
- 图片转结构草稿
- 图片转反应草稿

输入：
- 图片

输出：
- molecule：`smiles`、`molfile`、`confidence`、`warnings`
- reaction：reaction draft、`confidence`、`warnings`

不负责：
- 文档回写
- 最终渲染
- 最终结构真值判断

### RDKit

职责：
- 结构解析
- 规范化
- 校验
- 分子与反应 SVG 渲染

输入：
- molecule：`smiles`、`molfile`
- reaction：标准 reaction payload、reaction smiles、rxnfile 或等价 payload

输出：
- 规范化结构
- 渲染 SVG
- warnings

RDKit 是以下能力的正式真相层：
- 结构规范化
- 正式预览渲染
- 文档回写前的规范化处理

### Ketcher

职责：
- 分子人工结构编辑
- 反应骨架人工编辑

输入：
- molecule：优先 `molfile`，其次 `smiles`
- reaction：优先 reaction 编辑态缓存，其次标准 reaction payload

输出：
- 编辑后的 molecule 或 reaction 编辑态

不负责：
- OCR
- 文档树
- `conditions` 文本管理
- 主流程自动写回策略

---

## 总体架构

推荐采用：
- `apps/web`：主应用、文档编辑、UI 状态、API route
- `services/chem-service`：独立 Python 服务

### 高层结构

```text
apps/web
├─ chemd 编辑器
├─ OCR 入口
├─ 预览 / inspect
└─ Ketcher 弹窗

apps/web API routes
├─ /api/chem/ocr
├─ /api/chem/render
├─ /api/chem/normalize
├─ /api/chem/structure
├─ /api/chem/structure/save
├─ /api/chem/reaction/ocr
├─ /api/chem/reaction/render
└─ /api/chem/reaction/save

services/chem-service
├─ OCR provider adapters
├─ RDKit normalize
└─ RDKit render
```

### 设计原则

- 前端不直接调用 OCR provider
- 前端不直接调用 RDKit
- Ketcher 不直接调用 Python 服务
- `apps/web` 只调用自己的 `/api/chem/*`

这样后续可平滑从“同机 Python 服务”升级到“独立服务部署”。

---

## 前端交互流程

### 1. molecule：OCR -> 静默写回 -> 预览

1. 用户上传图片或粘贴截图
2. 前端请求 `/api/chem/ocr`
3. route 调用 OCR provider
4. route 再调用 RDKit normalize
5. 前端获得规范化结果
6. 前端定位当前选中的 `molecule` block
7. 若存在目标块，则更新该块的 `smiles`
8. 若不存在目标块，则新建一个 `:::molecule`
9. 前端显示轻提示：已更新结构块
10. 右侧预览更新为 RDKit SVG

### 2. molecule：Ketcher 纠错

1. 用户点击结构卡片上的“编辑结构”按钮
2. 前端读取临时结构缓存
3. 若有 `molfile`，优先用 `molfile` 初始化 Ketcher
4. 若无 `molfile`，退回用 `smiles`
5. 用户在弹窗中修改结构
6. 保存后，前端请求 `/api/chem/structure/save`
7. route 调用 RDKit normalize
8. 系统更新：
   - 临时缓存里的 `molfile`
   - 文档里的 `smiles`
   - 右侧 RDKit 预览

### 3. reaction：OCR -> 静默写回 -> 预览

1. 用户上传反应图
2. 前端请求 `/api/chem/reaction/ocr`
3. route 调用 OCR provider
4. route 将结果标准化为正式 `reaction` block
5. 系统默认静默写回：
   - `reactants`
   - `products`
   - `conditions`
6. 前端显示轻提示：已更新反应块
7. 右侧预览更新为 RDKit reaction SVG

### 4. reaction：Ketcher 纠错

1. 用户点击 reaction 卡片上的“编辑反应”按钮
2. 前端读取 reaction 临时结构缓存
3. 若有 reaction 编辑态缓存，则优先加载
4. 若无缓存，则根据正式 `reaction` block 构造初始输入
5. 用户在 Ketcher 中修改箭头左右两侧的反应骨架
6. 保存后，前端请求 `/api/chem/reaction/save`
7. route 调用 RDKit normalize / render
8. 系统更新：
   - reaction 临时缓存
   - 文档中的 `reactants/products`
   - 预览中的正式 reaction SVG

说明：
- `conditions` 不要求在 Ketcher 中编辑。
- `conditions` 仍由 `chemd` 文本字段维护。

---

## 文档存储与临时结构存储

### 文档存储原则

文档中的结构块使用稳定 id：

```text
:::molecule #mol-001
smiles: CCO
:::

:::reaction #rxn-001
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
:::
```

这些 `id` 是文档层与临时结构缓存之间的关联键。

### 临时结构缓存原则

MVP 不接数据库。

使用：
- 服务端内存级缓存

并采用：
- `创建或最后修改后 5 分钟过期`

### 缓存记录模型（示意）

```ts
interface StructureRecord {
  documentId: string;
  blockId: string;
  kind: "molecule" | "reaction";
  smiles?: string;
  molfile?: string;
  reactionPayload?: Record<string, unknown>;
  source: "ocr" | "ketcher" | "manual";
  confidence?: number;
  updatedAt: string;
  expiresAt: string;
}
```

### 行为规则

- OCR 成功：
  - 回写正式文档字段
  - 缓存编辑态结构
- Ketcher 打开：
  - 优先取缓存编辑态
  - 没有则回退到正式文档字段
- Ketcher 保存：
  - 更新缓存编辑态
  - 重新规范化并回写正式文档
- 缓存过期：
  - 直接删除
  - 不保留长期历史

---

## Ketcher 接入方式

### 推荐方案

采用：
- `iframe + modal dialog`

不采用：
- 常驻右侧编辑区
- 让 Ketcher 直接替代 `chemd` 编辑器

### 选择原因

- Ketcher 是纠错工具，不是主工作区
- iframe 可以隔离依赖、样式和生命周期
- 后续升级 Ketcher 版本更容易
- 对当前 Next.js 应用侵入最小

### 前端封装边界

建议封装为：
- `KetcherDialog`
- `KetcherFrame`
- `useKetcherBridge`

它们只负责：
- 载入结构
- 接收编辑结果
- 保存或取消

不负责：
- OCR
- block 定位
- 文本文档回写策略

---

## Python chem-service 运行方式

### MVP 运行方式

采用：
- 仓库内独立目录
- 本机单独 Python 进程
- HTTP 对外提供接口

不采用：
- Node 直接 shell 调 Python
- Next 内嵌 Python 逻辑
- Ketcher 直连 Python 服务

### 原因

- OCR provider 与 RDKit 都更适合隔离在独立服务层
- 本地开发调试简单
- 可平滑升级为独立部署
- 可把模型依赖与主应用隔离

---

## API 设计

### 1. molecule OCR

`POST /api/chem/ocr`

响应草案：

```ts
interface OcrResponse {
  status: "ok" | "partial" | "failed";
  blockId: string;
  action: "update_existing" | "create_new";
  structure: {
    smiles: string;
    molfile?: string;
  };
  confidence?: number;
  warnings: string[];
}
```

### 2. molecule 读取结构缓存

`GET /api/chem/structure?documentId=...&blockId=...`

### 3. molecule Ketcher 保存

`POST /api/chem/structure/save`

### 4. molecule render

`POST /api/chem/render`

### 5. reaction OCR

`POST /api/chem/reaction/ocr`

响应草案：

```ts
interface ReactionOcrResponse {
  status: "ok" | "partial" | "failed";
  blockId: string;
  action: "update_existing" | "create_new";
  reaction: {
    reactants: string[];
    products: string[];
    conditions: string[];
  };
  editorPayload?: Record<string, unknown>;
  confidence?: number;
  warnings: string[];
}
```

### 6. reaction render

`POST /api/chem/reaction/render`

### 7. reaction 保存

`POST /api/chem/reaction/save`

说明：
- reaction 保存后应回写正式 `reaction` block。
- `conditions` 在返回值中可继续以字符串数组形式传输，但落盘时转为 `|` 分隔。

---

## 前端模块建议

```text
apps/web/src/features/
├─ ocr/
│  ├─ components/OcrImportButton.tsx
│  ├─ components/OcrPasteListener.tsx
│  ├─ hooks/useImageOcr.ts
│  └─ types.ts
├─ structure-editor/
│  ├─ components/KetcherDialog.tsx
│  ├─ components/KetcherFrame.tsx
│  ├─ hooks/useKetcherBridge.ts
│  └─ types.ts
├─ chem-preview/
│  ├─ hooks/useRenderedPreview.ts
│  └─ types.ts
├─ reaction-editor/
│  ├─ components/ReactionCard.tsx
│  ├─ components/EditReactionButton.tsx
│  └─ types.ts
└─ editor/
   └─ lib/selected-block.ts
```

说明：
- `document-tree` 可以保留代码，但不属于 v0.1 正式界面。

---

## 页面布局建议

v0.1 页面结构应为：
- 左：`EditorShell`
- 右：`PreviewShell`

其中：
- 编辑器承担 `chemd` 文本输入、OCR 入口和状态提示
- 预览承担正式渲染、JSON / DOCX inspect，以及 molecule / reaction 的修改按钮
- `KetcherDialog` 作为弹窗，不常驻主界面

---

## 错误处理策略

### OCR 失败
- 不改文本
- 显示错误提示
- 允许重试

### OCR 成功但 normalize 失败
- 不静默写回
- 显示错误

### OCR 成功、normalize 成功、render 失败
- 仍然写回正式文档字段
- 预览显示渲染失败提示
- 允许打开 Ketcher 修改

### Ketcher 保存失败
- 不覆盖文档
- 保持弹窗打开
- 显示错误信息

---

## 与现有渲染链的关系

当前仓库已有：
- `packages/compiler`
- `packages/renderer-html`
- `packages/renderer-svg`

本阶段建议：
- 不大改 `parser / resolver / compiler`
- 右侧结构预览主路径切到 RDKit
- 现有 `renderer-svg` 暂时保留为 fallback 或测试桩

不建议第一步就彻底删除现有 renderer。

---

## MVP 范围

### 包含
- molecule OCR
- reaction OCR
- 默认静默写回 `molecule` 与 `reaction` 标准 block
- `reaction.conditions` 字段正式化
- RDKit molecule / reaction 正式预览
- molecule 修改按钮打开 Ketcher
- reaction 修改按钮打开 Ketcher
- 保存后回写正式文档字段
- 编辑态结构 5 分钟临时缓存

### 不包含
- PDF OCR
- 常驻 Ketcher 工作区
- 完整 ELN 级项目系统
- Tree 正式化 UI
- training-export
- 自研 OCR / depiction 内核

---

## 推荐实现顺序

1. `render constraints` 单一来源收口
2. `RDKit normalize/render` service
3. molecule 正式预览切换
4. molecule Ketcher 闭环
5. molecule OCR provider 闭环
6. reaction render contract 正式化
7. `reaction.conditions` 字段落地
8. reaction OCR 静默写回链路
9. reaction Ketcher 闭环

---

## 成功标准

当以下目标全部满足时，v0.1 这条设计可认为成功：

- 用户可编辑 `chemd` 文档
- 用户可上传图片或粘贴截图
- molecule 与 reaction 都能静默写回标准 block
- reaction 支持 `conditions` 字段，并使用 `|` 分隔多条件项
- 右侧预览默认由 RDKit 生成正式分子与反应图
- molecule 与 reaction 卡片都有“修改”按钮
- 点击按钮可弹出 Ketcher
- 保存后可回写文档并刷新预览
- 编辑态结构只做 5 分钟临时缓存，不污染文档

---

## 一句话结论

本设计把 **OCR provider + RDKit + Ketcher** 收敛成两条统一主链：

`molecule/reaction OCR -> RDKit 规范化与正式渲染 -> 静默写回标准 chemd block -> Preview -> Ketcher 纠错 -> 文档回写`

这条链路既保留了文档层的简洁性，又让 molecule 与 reaction 都进入了同一套可识别、可预览、可纠错的 v0.1 产品原型闭环。
