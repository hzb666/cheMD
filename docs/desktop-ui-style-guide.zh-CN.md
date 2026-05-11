# Chemd Desktop UI 风格指南

状态：设计约束草案
更新时间：2026-05-12
适用范围：`apps/desktop`、桌面 IDE UI、Graph/RAG/Agent panels、Ketcher shell

---

## 1. 目标

Chemd Desktop 虽然使用 Vite + Tauri，而不是 Next.js runtime，但视觉语言必须继承现有 Web Playground。

目标效果：

- 用户一眼能识别这是 Chemd Playground 的生产版。
- UI 保持专业、克制、适合长时间阅读。
- Graph、RAG、Agent 是工作台能力，不是营销页、聊天产品或 BI 大屏。
- Monaco 提升编辑能力，但不改变整体产品气质。

---

## 2. 继承来源

优先迁移或复用：

- `apps/web/src/app/globals.css`
- `apps/web/src/features/playground/styles/playground.css`
- `apps/web/src/features/preview/styles/preview-document.ts`
- `apps/web/src/components/ui/*`
- `apps/web/src/components/theme-provider.tsx`
- `apps/web/src/components/theme-toggle.tsx`
- `apps/web/src/components/copy-icon-button.tsx`
- `apps/web/src/features/preview/components/*`
- `apps/web/src/features/chem-editor/components/*`
- `vision/logo-*`

需要重写但保持风格：

- `EditorSurface` -> Monaco wrapper。
- `EditorShell` -> Desktop editor pane。
- `PreviewShell` -> Desktop inspect pane。
- `PlaygroundHeader` -> Desktop top bar。
- API-driven hooks -> Tauri command / worker / desktop service hooks。

---

## 3. 桌面布局

```text
Top Bar
  -> logo / workspace
  -> compile status
  -> database status
  -> chem-service status
  -> provider readiness
  -> theme / settings

Main
  -> Activity Rail
  -> Sidebar
  -> Editor
  -> Preview / Inspect
  -> Bottom Panel
```

### 3.1 Top Bar

Top Bar 保持 Web Playground 的低高度状态栏风格。

内容：

- Chemd logo。
- 当前 workspace 名称。
- 当前文件名或 dirty state。
- Compile badge。
- PostgreSQL badge。
- `chem-service` badge。
- OCR provider readiness badge。
- Theme toggle。

规则：

- badge 文案短。
- hover/focus 展开详细说明。
- 不放大标题。
- 不做 hero 或营销式头图。

### 3.2 Activity Rail

Activity Rail 使用图标优先：

- Files。
- Search/RAG。
- Graph。
- Agent Runs。
- Settings。

规则：

- 使用 lucide icons。
- 图标按钮必须有 tooltip。
- 当前 section 用 subtle background 或 left indicator 表示。
- 不使用大块彩色导航。

### 3.3 Editor Pane

Editor Pane 使用 Monaco。

规则：

- 保持 Web Editor 的 mono 字体和紧凑 line height。
- Diagnostics gutter 不使用高饱和色块。
- Quick fix 使用轻量 popover。
- Editor toolbar 保持 32px 左右控件高度。

### 3.4 Preview / Inspect Pane

Preview 继承 Web preview document style。

Tabs：

- Preview。
- Diagnostics。
- JSON。
- DOCX。
- Semantic。
- Runtime。
- LNF。
- RAG。
- Training。
- Graph Evidence。

规则：

- tabs 使用当前 Playground tab trigger 风格。
- Code output 使用 mono pre。
- Preview iframe 或 sandbox 区域必须主题同步。

### 3.5 Bottom Panel

Bottom Panel 用于短期任务状态：

- Problems。
- Output。
- Sidecar Logs。
- Agent Timeline。
- Tasks。

规则：

- 默认可折叠。
- 不抢占 Editor/Preview 主空间。
- logs 使用 mono。
- Agent timeline 使用紧凑事件列表。

---

## 4. Graph UI

Graph 是实验关系查看器，不是装饰性图。

要求：

- 节点默认紧凑。
- edge 按类型区分，但避免高饱和颜色过多。
- 选中节点后右侧显示 evidence。
- edge label 默认隐藏，hover 或 selection 时显示。
- graph cluster 可以折叠。
- 节点点击能跳转源码。

Graph palette：

- route edge：primary。
- family edge：teal/emerald。
- condition edge：amber。
- evidence edge：slate/muted。
- warning/conflict：rose。

---

## 5. RAG UI

RAG 是可追溯检索面板。

结果卡片必须包含：

- chunk summary。
- score。
- citation。
- source file。
- entity/block id。
- jump action。

规则：

- 不做聊天式大气泡作为主界面。
- 查询框保持工具输入样式。
- filters 放 sidebar。
- citation 是第一等信息，不放到折叠深处。

---

## 6. Agent UI

Agent UI 是 workflow timeline。

必须展示：

- goal。
- tool calls。
- retrieved RAG context。
- graph evidence。
- patch proposal。
- validation result。
- approval state。

规则：

- Agent 不以“万能助手聊天窗口”为主视觉。
- patch proposal 必须有 diff view。
- Apply 按钮只在用户确认上下文中出现。
- blocked/failed 状态必须说明原因。

---

## 7. 视觉规则

- 使用现有 Chemd token：`background`、`foreground`、`border`、`muted`、`accent`、`primary`。
- 8px 或更小 radius，除非沿用现有组件。
- 避免大面积单一蓝紫渐变。
- 避免装饰性 orb、bokeh、无意义背景图。
- 信息密度优先，不做 landing page。
- 工具按钮优先用 icon + tooltip。
- 文本按钮仅用于明确命令。
- 长文本必须 truncate 或 wrap，不能撑破 toolbar。
- 卡片不嵌套卡片。

---

## 8. 验收清单

- [ ] Desktop 首屏看起来像 Chemd Playground 的生产版。
- [ ] Preview 文档样式与 Web 一致。
- [ ] Toolbar、badge、tab、dialog、Ketcher shell 风格一致。
- [ ] Monaco 嵌入后仍保持 Chemd 工作台风格。
- [ ] Graph/RAG/Agent 面板不抢主视觉。
- [ ] Light/dark theme 与 Web token 对齐。
- [ ] 所有 icon-only buttons 有 tooltip。
- [ ] Desktop screenshot 与 Web screenshot 可做并排风格审查。
