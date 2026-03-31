# Ketcher + MolScribe + RDKit 集成设计

## 背景

当前 `chemd` 仓库已经具备以下基础能力：

- `chemd` 文本编辑
- parser / resolver / render-profile 编译链
- HTML / JSON / DOCX bridge 输出
- Web playground 预览界面

但当前结构渲染主要依赖自研 SVG 逻辑，效果有限，同时仓库还缺少：

- 图片识别化学结构式
- 结构人工纠错编辑器
- 更成熟的结构渲染与规范化能力

本设计的目标是把以下三个能力统一接入当前仓库：

- `MolScribe`：化学结构式 OCR
- `RDKit`：结构规范化、校验、渲染
- `Ketcher`：人工纠错编辑器

---

## 产品目标

第一阶段产品目标不是做完整 ELN，也不是做通用 IDE，而是把当前 playground 演进为一个更像“化学文档工作台”的产品原型。

产品核心体验：

1. 用户在中间编辑 `chemd` 文本
2. 用户上传手机照片、电脑图片，或粘贴截图
3. 系统自动识别化学结构
4. 系统默认静默写回当前 `molecule` block 的 `smiles`
5. 右侧立即显示更高质量的结构预览
6. 如果用户觉得结构或视觉姿态不理想，可以点击一个小图标弹出 `Ketcher`
7. 用户修改后保存，系统重新规范化并回写文档

---

## 最终产品形态

第一阶段 UI 目标是三栏工作台：

- 左栏：文档树 / 实验树
- 中栏：`chemd` 编辑器
- 右栏：预览与 inspect 工作台

其中：

- `Ketcher` 不作为常驻区域，不占主工作区
- `Ketcher` 只作为纠错弹窗出现
- OCR 成功后默认不打断用户

这意味着该产品不是 Obsidian 插件式的“笔记增强”，而是一个结构式、OCR、预览、导出联动的专用化学文档工作台。

---

## 关键产品决策

### 1. OCR 是主入口

图片识别进入主流程：

- 手机照片
- 电脑图片
- 剪贴板截图

PDF 识别不进入第一阶段。

### 2. 默认静默写回文本

识别成功后：

- 默认不弹编辑器
- 默认直接把结果写回文档
- 用户通过预览即时看到效果

### 3. Ketcher 是纠错工具

`Ketcher` 的定位不是主编辑器，而是：

- 人工确认工具
- 结构纠错工具
- 视觉姿态修正工具

只有用户主动点击结构卡片上的小图标时才弹出。

### 4. 文档层只保存 smiles

`chemd` 文档中的 `molecule` block 只保存：

- `smiles`

不把 `molfile` 持久写进文档，原因：

- 保持文档可读
- 保持 diff 友好
- 避免污染 `chemd` DSL

### 5. molfile 只作为短期编辑真相

服务端临时保存：

- `molfile`

它只用于：

- 保留 OCR 或 Ketcher 的结构编辑状态
- 后续重新打开 Ketcher 时恢复更接近原图的布局

---

## 系统角色划分

### MolScribe

职责：

- 图片转结构

输入：

- 图片

输出：

- `smiles`
- `molfile`
- `confidence`
- `warnings`

不负责：

- 文档回写
- 最终渲染
- 最终结构真值判断

### RDKit

职责：

- 结构解析
- 规范化
- 校验
- SVG 渲染

输入：

- `smiles`
- `molfile`

输出：

- `canonicalSmiles`
- `normalizedMolfile`
- `svg`
- `warnings`

RDKit 是以下能力的唯一真相来源：

- 结构规范化
- 最终 smiles 回写
- 预览渲染

### Ketcher

职责：

- 人工结构编辑

输入：

- 优先 `molfile`
- 其次 `smiles`

输出：

- 编辑后的 `molfile`

不负责：

- OCR
- 文档树
- 主流程自动写回

---

## 总体架构

推荐采用：

- `apps/web`：主应用、文档编辑、UI 状态、API route
- `services/chem-service`：独立 Python 服务

### 高层结构

```text
apps/web
├─ 文档树
├─ chemd 编辑器
├─ OCR 入口
├─ 预览 / inspect
└─ Ketcher 弹窗

apps/web API routes
├─ /api/chem/ocr
├─ /api/chem/render
├─ /api/chem/normalize
└─ /api/chem/structure/save

services/chem-service
├─ MolScribe OCR
├─ RDKit normalize
└─ RDKit render
```

### 设计原则

- 前端不直接调用 MolScribe
- 前端不直接调用 RDKit
- Ketcher 不直接调用 Python 服务
- `apps/web` 只调用自己的 `/api/chem/*`

这样后续可平滑从“同机 Python 服务”升级到“独立服务部署”。

---

## 前端交互流程

### 主流程：OCR -> 静默写回 -> 预览

1. 用户上传图片或粘贴截图
2. 前端请求 `/api/chem/ocr`
3. route 调用 MolScribe
4. route 再调用 RDKit normalize
5. 前端获得规范化结果
6. 前端定位当前选中的 `molecule` block
7. 若存在目标块，则更新该块的 `smiles`
8. 若不存在目标块，则新建一个 `:::molecule`
9. 前端显示轻提示：已更新结构块
10. 右侧预览更新为 RDKit SVG

### 次流程：用户点击小图标 -> Ketcher 纠错

1. 用户点击结构卡片上的“编辑结构”小图标
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

---

## 文档存储与临时结构存储

### 文档存储原则

文档里的 `molecule` block 使用稳定 id：

```text
:::molecule #mol-001
smiles: CCO
:::
```

该 `id` 是文档层与临时结构缓存之间的关联键。

### 临时结构缓存原则

MVP 不接数据库。

使用：

- 服务端内存级缓存

并采用：

- `创建或最后修改后 5 分钟过期`

### 缓存记录模型

```ts
interface StructureRecord {
  documentId: string;
  blockId: string;
  kind: "molecule";
  smiles: string;
  molfile?: string;
  source: "ocr" | "ketcher" | "manual";
  confidence?: number;
  updatedAt: string;
  expiresAt: string;
}
```

### 行为规则

- OCR 成功：
  - 回写 `smiles`
  - 缓存 `molfile`
- Ketcher 打开：
  - 先取缓存 `molfile`
  - 没有则回退到 `smiles`
- Ketcher 保存：
  - 更新缓存 `molfile`
  - 重新生成并回写 `smiles`
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
- 深度 React 直接集成作为主编辑面板

### 选择原因

- Ketcher 只是纠错工具，不是主工作区
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
- 文本文档回写

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

- MolScribe 和 RDKit 都适合 Python 运行时
- 本地开发调试简单
- 可平滑升级为独立部署
- 可把模型依赖与主应用隔离

### 目录建议

```text
services/chem-service/
├─ app.py
├─ requirements.txt
├─ routes/
│  ├─ ocr.py
│  ├─ normalize.py
│  └─ render.py
├─ services/
│  ├─ molscribe_service.py
│  ├─ rdkit_normalize_service.py
│  └─ rdkit_render_service.py
└─ models/
```

---

## API 设计

### 1. OCR

`POST /api/chem/ocr`

职责：

- 上传图片
- 调用 MolScribe
- 调用 RDKit normalize
- 返回统一识别结果

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

### 2. 读取结构缓存

`GET /api/chem/structure?documentId=...&blockId=...`

响应草案：

```ts
interface StructureResponse {
  found: boolean;
  structure?: {
    smiles: string;
    molfile?: string;
    source: "ocr" | "ketcher" | "manual";
    expiresAt: string;
  };
}
```

### 3. Ketcher 保存

`POST /api/chem/structure/save`

请求草案：

```ts
interface SaveStructureRequest {
  documentId: string;
  blockId: string;
  molfile?: string;
  smiles?: string;
}
```

响应草案：

```ts
interface SaveStructureResponse {
  blockId: string;
  smiles: string;
  molfile?: string;
  warnings: string[];
}
```

### 4. 结构渲染

`POST /api/chem/render`

请求草案：

```ts
interface RenderRequest {
  kind: "molecule";
  smiles?: string;
  molfile?: string;
  renderOptions?: Record<string, unknown>;
}
```

响应草案：

```ts
interface RenderResponse {
  svg: string;
  warnings: string[];
}
```

MVP 先只支持：

- `kind: "molecule"`

不先做 reaction。

---

## 前端模块建议

### features 目录

```text
apps/web/src/features/
├─ document-tree/
│  ├─ components/DocumentTreePanel.tsx
│  └─ lib/mock-tree.ts
├─ ocr/
│  ├─ components/OcrImportButton.tsx
│  ├─ components/OcrPasteListener.tsx
│  ├─ hooks/useImageOcr.ts
│  ├─ lib/select-target-molecule.ts
│  ├─ lib/insert-molecule-block.ts
│  ├─ lib/update-molecule-block.ts
│  ├─ lib/ensure-block-id.ts
│  └─ types.ts
├─ structure-editor/
│  ├─ components/KetcherDialog.tsx
│  ├─ components/KetcherFrame.tsx
│  ├─ hooks/useKetcherBridge.ts
│  └─ types.ts
├─ chem-preview/
│  ├─ hooks/useRenderedPreview.ts
│  ├─ lib/build-render-payload.ts
│  ├─ lib/map-preview-response.ts
│  └─ types.ts
└─ editor/
   └─ lib/selected-block.ts
```

### server 目录

```text
apps/web/src/server/chem/
├─ chem-service-client.ts
├─ molscribe-client.ts
├─ rdkit-client.ts
├─ structure-store.ts
├─ dto.ts
└─ mappers/
   ├─ map-ocr-response.ts
   ├─ map-render-response.ts
   └─ map-normalize-response.ts
```

---

## 页面布局建议

MVP 页面结构建议为：

- 左：`DocumentTreePanel`
- 中：`EditorShell`
- 右：`PreviewShell`

具体增强如下：

### 左栏

- 文档树
- 可选 block outline

### 中栏

- `chemd` 编辑器
- OCR 上传按钮
- 粘贴截图支持
- 当前选中 `molecule` block 提示

### 右栏

- 预览 tab
- inspect tab
- 结构卡片上的小图标：
  - 编辑结构

### 弹窗

- `KetcherDialog`

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

- 仍然写回 `smiles`
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
- 现有自研 `renderer-svg` 暂时保留为 fallback 或测试桩

不建议第一步就彻底删除现有 renderer。

---

## MVP 范围

### 包含

- 图片上传 OCR
- 截图粘贴 OCR
- 默认静默写回 `molecule.smiles`
- RDKit 结构预览
- molecule 卡片小图标打开 Ketcher
- Ketcher 保存后回写 smiles
- `molfile` 5 分钟临时缓存

### 不包含

- PDF OCR
- reaction OCR
- reaction 编辑
- 数据库存储
- OCR 多候选选择器
- 常驻 Ketcher 工作区
- 完整 ELN 级项目系统

---

## 推荐实现顺序

1. `structure-store`
2. `RDKit normalize/render route`
3. `右侧预览接 RDKit`
4. `OCR route + useImageOcr`
5. `selected-block + smiles 回写`
6. `KetcherDialog + save route`
7. `左侧文档树 MVP`

---

## 成功标准

当以下目标全部满足时，MVP 可认为成功：

- 用户可上传图片或粘贴截图
- OCR 结果能默认写回当前 `molecule` block
- 没有目标 block 时能新建 `molecule` block
- 右侧结构预览由 RDKit 生成
- 每个结构卡片有“编辑结构”小图标
- 点击图标可弹出 Ketcher
- Ketcher 修改后可回写 smiles
- molfile 只做 5 分钟临时缓存，不污染文档

---

## 一句话结论

本设计把 `MolScribe + RDKit + Ketcher` 收敛成一条清晰链路：

`OCR 识别 -> RDKit 规范化 -> 静默写回 smiles -> RDKit 预览 -> 用户必要时通过 Ketcher 纠错`

这条链路既保留了文档层的简洁性，又为结构式识别、人工纠错和更高质量渲染建立了稳定边界。
