# chemd Playground Linear Lite Workbench Design

**目标**

将 `apps/web` 的 playground 从演示型卡片布局重做为浅色、克制、接近 Linear 气质的工作台界面，同时保留 `chemd` 作为化学文档编辑器的专业感与长时间阅读的可用性。

**设计决策**

- 风格选择为“Linear 灵感版”，不直接复刻 Linear 的深色界面。
- 页面采用全宽工作台布局，而不是居中的 landing page。
- 头部改为紧凑产品栏，承担品牌、状态与核心操作的汇总。
- 主体保持三栏：`Editor`、`Preview`、`Inspect`。
- `Inspect` 面板采用摘要 + 分组 + tab，减少长页面滚动。

**视觉系统**

- 背景：冷灰白渐层，去掉当前偏米黄色纸张感。
- 面板：浅灰半透明实体面板，依赖细描边、内阴影与弱投影建立层级。
- 强调色：单一冷调蓝，用于焦点态、激活态、关键按钮与状态标签。
- 字体：现代中性无衬线栈，标题与代码区层级更明确。
- 动效：仅保留面板/按钮 hover、focus、首屏淡入，遵循 `prefers-reduced-motion`。

**组件改造**

- `page.tsx`
  - 新增顶部产品栏与工作台容器。
  - 扩大页面可用宽度，桌面端优先利用横向空间。
  - 汇总文档标题、编译状态、profile 等上下文信息。
- `EditorShell`
  - 头部增加文档摘要与 profile 控件。
  - 文本区改为更接近专业代码编辑器的视觉表面。
- `PreviewShell`
  - 头部精简说明文字，突出标题、元信息与渲染配置。
  - iframe 外层与文档画布分层，明确“应用壳层 / 预览内容”边界。
- `DiagnosticsShell`
  - 顶部显示诊断摘要与 DOCX 导出操作。
  - `Render Options` 保留为参数摘要卡片。
  - `Normalized JSON` 与 `DOCX Bridge Payload` 改为 tab 切换。

**响应式**

- `xl` 桌面保持三栏，比例接近 `1.15 / 1 / 0.9`。
- `lg/md` 降为两列，Inspect 下沉。
- 手机端单列堆叠，头部摘要仍保留。

**验收标准**

- 宽屏下界面明显更像专业工作台，而非 demo 卡片集合。
- 视觉接近 Linear 的克制感，但保留 `chemd` 的浅色科技属性。
- 三栏布局在 1440px 以上屏幕能更充分利用宽度。
- hover、focus、disabled、loading 状态清晰可见。
- `@chemd/web` 的测试、typecheck、build 通过，并补充 UI 截图验证。
