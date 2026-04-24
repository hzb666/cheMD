# cheMD 按包拆分的实施任务清单（代码校正版，develop 分支）

> 适用基线：`hzb666/cheMD` 仓库 `develop` 分支当前代码
> 本文只依据代码路径与测试，不依据 README。
> 核心校正：`:::chemd` 是当前主 surface block；`molecule` / `reaction` 是内部 semantic node type，也是旧 surface block 的遗留名称，不应再作为新文档主路径。
> 2026-04-18 执行决策：取消 parser 对 `:::molecule` / `:::reaction` 的兼容读入；旧文档必须先通过迁移/审计脚本转换为 `:::chemd` + `kind:` 后再编译。
> 2026-04-18 状态更新：本文的 checkbox 区域是历史拆解，不再代表当前完成度。当前实现状态以 `docs/chemd_concrete_design_checklist.md` 和 `.trellis/spec/compiler/backend/language-v03-contracts.md` 为准；已落地 canonical `kind:`, explicit step/event, typedGraph/LNF/runtime/export 主链路，剩余差距主要是 quick-fix 可执行覆盖面与长期 UI/CI 接入。

---

## 1. 代码基线（只看当前实现）

### 1.1 当前 parser 的真实主语法
当前 `packages/parser/src/body/block-parsers/index.ts` 注册的主块只有：

- `chemd`
- `result`
- `analysis`
- `sample`
- `procedure`
- `observation`
- `use`
- `col`

这意味着当前语法中心不是 `:::molecule` / `:::reaction`，而是 `:::chemd`。

### 1.2 `:::chemd` 当前如何变成内部语义节点
`packages/parser/src/body/block-parsers/chemd.ts` 会先读取 `chemd` 块字段，再根据字段形状决定内部语义：

- 如果存在 `reactants/products`（含 `reac/reactant/reactants`、`prod/product/products` 兼容字段），生成 `ReactionNode`
- 否则生成 `MoleculeNode`

也就是说：

- **surface syntax 是 `chemd`**
- **semantic AST kind 仍然是 `molecule` 或 `reaction`**

### 1.3 AST 里现在没有保存“surface block 来源”
`packages/core/src/ast.ts` 中有 `MoleculeNode`、`ReactionNode`、`ProcedureNode` 等语义节点，但没有单独记录：

- 这个节点来自 `:::chemd`
- 还是来自旧语法 `:::molecule` / `:::reaction`
- 还是来自模板展开 / OCR 导入 / 自动迁移

这会影响迁移、LLM 可解释性和诊断精度。

### 1.4 `procedure` 现在还是文本，步骤语义靠 lowering
当前：

- `packages/parser/src/body/block-parsers/procedure.ts` 只解析 `ref + body`
- `packages/typechecker/src/index.ts` 对 `procedure` 调用 `lowerProcedureToSteps()`
- `packages/step-ontology/src/procedure.ts` 用规则把自由文本降成 `charge / purge / cool / heat / quench / add / hold / extract / dry / concentrate / separate_layers / filter / sample / analyze / observe`

所以现阶段“实验逻辑”并不是语法层显式表达，而是**后处理 lowering**。

### 1.5 compile 主链路已经完整
`packages/compiler/src/index.ts` 当前链路已经是：

`parseChemd -> resolveChemd -> typecheckDocument -> buildRunPlan -> preflightRun -> buildLnf -> exportTrainingRecordFromDocument -> renderHtml/renderJson/renderDocxBridge`

这说明 cheMD 已经不是单纯文档编辑器，而是一条完整的语义编译链。

### 1.6 renderer 里仍残留部分语义归一
`packages/renderer-json/src/index.ts` 现在还会在渲染阶段补：

- `normalized_conditions`
- `normalized_tlc`

这部分长期应前移到 typechecker / typed semantic graph / LNF，而不是保留在 renderer。

### 1.7 parser 单测当前就是以 `:::chemd` 为主
`packages/parser/tests/parser.test.ts` 的测试样本直接使用 `:::chemd #rxn-main ...`，并断言解析结果里出现 `reaction` 和 `procedure` 节点。说明当前实现中心已经是 `chemd` 语法，而不是旧块名。

---

## 2. 本轮实施的设计决策

### 2.1 保持 `:::chemd` 为 canonical authoring syntax
新文档、编辑器模板、OCR 导入、保存格式、导出中间态，都继续以 `:::chemd` 作为分子/反应主块。

### 2.2 不再把旧 `:::molecule` / `:::reaction` 作为主路径
旧块名只保留两种用途：

1. **兼容导入**：老文档还能被读入
2. **迁移修复**：自动转换成 canonical `:::chemd`

### 2.3 用显式 `kind:` 消除当前 `chemd` 的形状推断不透明性
建议把 canonical `chemd` 写法收敛成：

```md
:::chemd #mol_1
kind: molecule
smiles: CCO
name: ethanol
:::

:::chemd #rxn_1
kind: reaction
reactants: @mol_a | @mol_b
products: @mol_c
temperature: 65 C
time: 4 h
:::
```

规则：

- `kind:` 存在时，以 `kind` 为准
- `kind:` 缺失时，兼容当前 shape inference
- 新编辑器模板一律自动写入 `kind:`
- 严格模式下，缺失 `kind:` 产生 warning 或 error

### 2.4 继续保留 semantic AST 的 `molecule` / `reaction`
内部 semantic graph、typed graph、LNF、training export 仍保留 `molecule` / `reaction` 节点类型，不改成 `chemd` 统一节点。

原因：

- 现有 resolver / typechecker / training export / LNF 都已经围绕语义类型组织
- LLM 与下游系统更容易消费稳定的语义类型，而不是 surface block 名称

### 2.5 `procedure` 的长期方向是显式 step，但自由文本 lowering 继续做兼容层
目标不是废掉当前 lowering，而是分两层：

- **新写法**：`procedure` 内支持显式 `step`
- **旧写法**：`procedure.body` 继续由 `step-ontology` 降成步骤

### 2.6 语义归一必须前移，renderer 只负责展示
HTML / JSON / DOCX renderer 只消费 compiler/typechecker/LNF 产出的语义，不再自己推断条件、TLC 或其它归一化字段。

---

## 3. 实施波次

### Wave A：surface syntax 收敛
`@chemd/core` → `@chemd/parser` → `@chemd/diagnostics`

### Wave B：语义与步骤模型收敛
`@chemd/resolver` → `@chemd/typechecker` → `@chemd/step-ontology` → `@chemd/runtime-lab` → `@chemd/runtime-trace` → `@chemd/lnf`

### Wave C：输出总线收敛
`@chemd/compiler` → `@chemd/render-profile` → `@chemd/renderer-json` → `@chemd/renderer-html` → `@chemd/renderer-docx` → `@chemd/exporter-training`

### Wave D：产品与服务收敛
`apps/web` → `services/chem-service` → 根工作区脚本 / 测试 / 迁移工具 / spec 文档

---

## 4. 按包拆分的任务清单

## 4.1 `@chemd/core`

**当前职责**
AST、文档模型、token、共享类型。

**当前问题**
- 语义节点不记录 surface syntax 来源
- `chemd` 推断出的 `molecule/reaction` 没有 `declaredKind` 信息
- `ProcedureNode` 只有 `body?: string`
- 没有统一 provenance / confidence / source span 模型

**目标状态**
- 语义节点保留 `molecule/reaction`
- 同时能知道它来自 canonical `chemd`、legacy surface block、模板展开或迁移
- `procedure` 可同时承载自由文本和显式步骤

**任务清单**
- [ ] P0：为对象节点增加 `syntaxOrigin?: "chemd" | "template_expanded" | "migrated"`
- [ ] P0：为 `molecule/reaction` 增加 `declaredKind?: "molecule" | "reaction"`
- [ ] P0：新增统一 `SourceSpan`、`Provenance`、`Confidence` 类型
- [ ] P1：新增 `ProcedureStepNode`
- [ ] P1：将 `ProcedureNode` 扩展为 `body?: string` + `steps?: ProcedureStepNode[]`
- [ ] P1：为派生字段预留 provenance 容器，例如归一化温度、时间、产率、分析结论
- [ ] P2：给 `ObservationNode` 也补统一 provenance 容器

**重点文件**
- `packages/core/src/ast.ts`
- `packages/core/src/index.ts`

**验收标准**
- 任意一个 `molecule/reaction` 节点都能区分 semantic kind 与 surface origin
- 显式 step 不会破坏当前 `procedure.body` 路径

---

## 4.2 `@chemd/parser`

**当前职责**
frontmatter、block、inline reference 的解析入口。

**当前问题**
- `chemd` 是当前主块，但完全靠字段形状推断内部 kind
- 没有显式 `kind:` 字段
- 旧 `molecule/reaction` surface block 没有规范兼容策略
- `procedure` 仍只支持 `body`

**目标状态**
- `:::chemd` 保持 canonical
- 新文档可以显式声明 `kind:`
- 旧 `:::molecule` / `:::reaction` 不再被 parser 兼容读入；必须先用迁移脚本转换
- `procedure` 支持显式 `step`

**任务清单**
- [ ] P0：在 `packages/parser/src/body/block-parsers/chemd.ts` 的 `CHEMD_FIELDS` 中加入 `kind`
- [ ] P0：实现 `kind:` 优先于 shape inference
- [ ] P0：当 `kind: reaction` 但没有反应字段，或 `kind: molecule` 却出现 `reactants/products` 时输出冲突诊断
- [ ] P0：为缺失 `kind:` 的 `chemd` 块保留当前兼容推断逻辑
- [ ] P1：增加 legacy `molecule` / `reaction` compatibility parser，统一输出同一套 `MoleculeNode/ReactionNode`，并打上 `syntaxOrigin`
- [ ] P1：migration/audit 脚本识别旧 surface block，并在编译前完成转换
- [ ] P1：扩展 `procedure.ts`，允许显式嵌套 `step`
- [ ] P1：显式 step 缺失时继续保留 `body` 文本路径
- [ ] P1：补充 parser golden tests：canonical `chemd(molecule)`、canonical `chemd(reaction)`、chemd+kind、chemd 无 kind、legacy molecule、legacy reaction、procedure prose、procedure steps
- [ ] P2：增加 parser strict mode：可选择对缺失 `kind:` 直接报 warning/error
- [ ] P2：提供 surface migration helper：旧块名自动改写成 `:::chemd + kind:`

**重点文件**
- `packages/parser/src/body/block-parsers/index.ts`
- `packages/parser/src/body/block-parsers/chemd.ts`
- `packages/parser/src/body/block-parsers/procedure.ts`
- `packages/parser/tests/parser.test.ts`

**验收标准**
- 新文档主路径仍然是 `:::chemd`
- `kind:` 写了就不再靠字段推断
- 老 `:::molecule` / `:::reaction` 不直接导入；审计/迁移脚本负责转换到 canonical `chemd`

---

## 4.3 `@chemd/diagnostics`

**当前职责**
诊断码、band、quick fix、v0.3 诊断结构。

**当前问题**
- 目前没有针对 `chemd` kind 推断、legacy surface block、显式 step 的完整诊断族
- quick fix 还没有覆盖 surface migration

**目标状态**
- diagnostics 既能服务语法校验，也能服务迁移与编辑器自动修复

**任务清单**
- [ ] P0：不再通过 parser 产出 legacy 兼容诊断；保留 unsupported block 警告与独立迁移工具
- [ ] P0：新增 `W_CHEMD_KIND_AMBIGUOUS`
- [ ] P0：新增 `E_CHEMD_KIND_CONFLICT`
- [ ] P0：新增显式 step 相关错误：`E_STEP_INVALID_FAMILY`、`E_STEP_MISSING_FIELD`、`E_STEP_INVALID_REFERENCE`
- [ ] P1：新增 quick fix：`convert_legacy_block_to_chemd`
- [ ] P1：新增 quick fix：`insert_chemd_kind`
- [ ] P1：新增 quick fix：`insert_step_skeleton`
- [ ] P1：新增 quick fix：`split_procedure_to_steps`
- [ ] P1：新增 quick fix：`insert_missing_id`
- [ ] P2：为 diagnostics 增加更清晰的 UI metadata（标题、说明、操作建议）

**建议 quick fix 类型扩展**
- [ ] `convert_legacy_block`
- [ ] `insert_chemd_kind`
- [ ] `insert_step_skeleton`
- [ ] `split_procedure_to_steps`
- [ ] `insert_missing_id`

**重点文件**
- `packages/diagnostics/src/index.ts`

**验收标准**
- 旧 surface block、缺失 `kind:`、显式 step 错误都能给结构化修复建议
- Web 端能直接消费诊断码和 quick fix 类型

---

## 4.4 `@chemd/resolver`

**当前职责**
reference 解析、template expansion、default id、required field 校验、primary_* 校验。

**当前问题**
- 没有保留 surface syntax / template expansion provenance
- 还没有 step 级引用解析
- template 参数没有类型体系

**目标状态**
- resolver 负责“结构与引用层”的真相，不负责 NLP lowering

**任务清单**
- [ ] P0：保持当前模板展开上限与循环检测不变
- [ ] P0：required field 继续按 semantic kind 校验，不按 surface block 名称校验
- [ ] P0：把 `syntaxOrigin`、`declaredKind` 在 clone/expand/default-id 流程中完整保留
- [ ] P1：引入 template 参数类型声明与校验
- [ ] P1：为模板展开后的节点写 provenance：来源模板、来源 use、展开链路
- [ ] P1：为显式 step 引入引用解析：`inputs / outputs / vessel / sample / analysis`
- [ ] P1：在 default ID 分配中补 step ID 规则
- [ ] P2：补 cross-object consistency 校验：例如 result 对 reaction/product 的引用一致性
- [ ] P2：为 strict mode 提供“legacy syntax 禁止通过”的 resolver 级策略

**重点文件**
- `packages/resolver/src/index.ts`

**验收标准**
- 解析后的节点不会丢失 source origin
- template 展开和 default-id 分配后，step / object 引用仍然可追踪

---

## 4.5 `@chemd/typechecker`

**当前职责**
将语义节点转成 typed semantic graph，并触发 procedure / observation lowering。

**当前问题**
- `procedure` 和 `observation` 仍然依赖 lowering
- normalized reaction conditions / TLC 还残留在 renderer-json
- typed graph 对 surface origin 与 derived provenance 记录不足

**目标状态**
- typed graph 成为所有归一化语义的唯一来源
- 显式 step 优先，自由文本 lowering 兜底

**任务清单**
- [ ] P0：将 `syntaxOrigin`、`declaredKind` 带入 typed nodes
- [ ] P0：把 `renderer-json` 中的 `normalized_conditions` 迁移到 typed layer
- [ ] P0：把 `renderer-json` 中的 `normalized_tlc` 迁移到 typed layer
- [ ] P1：若 `procedure.steps` 存在，则直接构建 stepGraph；若不存在，再调用 `lowerProcedureToSteps()`
- [ ] P1：typed graph 中增加 derived field provenance / confidence
- [ ] P1：补 reaction/result/analysis/sample 的跨对象一致性检查
- [ ] P1：补 quantity、单位、百分比的更强 typed model
- [ ] P2：增加 strict report：哪些步骤是显式的，哪些是 lowered 的

**重点文件**
- `packages/typechecker/src/index.ts`
- `packages/typechecker/src/types.ts`
- `packages/typechecker/src/nodes/*`

**验收标准**
- HTML/JSON/DOCX/LNF 不再自己发明条件归一
- 显式 step 与 lowered step 能在 typed graph 中区分来源

---

## 4.6 `@chemd/step-ontology`

**当前职责**
把自由文本 procedure / observation 降成 canonical steps / events。

**当前问题**
- 当前它承担了大量“本该在显式语法层表达”的责任
- 规则、置信度、source span 还不够精细

**目标状态**
- 它成为兼容层和增强层，而不是唯一逻辑来源

**任务清单**
- [ ] P0：保留现有自由文本 lowering 路径，保证旧文档可用
- [ ] P0：区分 `explicit_step` 与 `lowered_step` 的 source 类型
- [ ] P1：增强 numbered list / bilingual sentence lowering
- [ ] P1：为 lowered step 增加更细 source span / sentence span
- [ ] P1：增强 family 提取：补设备、气氛、相分离、取样、分析参数
- [ ] P1：让低置信度步骤继续落到 `observe`，但附带更清晰诊断事实
- [ ] P2：抽离可配置词典与规则集，便于实验室定制

**重点文件**
- `packages/step-ontology/src/procedure.ts`
- `packages/step-ontology/src/observation.ts`
- `packages/step-ontology/src/types.ts`

**验收标准**
- 新文档可以不用 lowering 也表达步骤
- 旧文档继续通过 lowering 获得稳定 stepGraph

---

## 4.7 `@chemd/runtime-lab`

**当前职责**
将 stepGraph 变为 runPlan，并做 capability preflight。

**当前问题**
- 现在只消费线性 steps，依赖关系和 artifact 语义还比较轻
- 对 explicit step / lowered step 没有差异化消费

**目标状态**
- runtime-lab 只消费 canonical step graph，不关心 surface syntax
- 但要能保留步骤来源和手动确认需求

**任务清单**
- [ ] P0：保持当前 capability preflight 逻辑可用
- [ ] P0：在 runtime step 中显式保留 source provenance
- [ ] P1：支持显式 step 的 `dependsOn / outputs / artifacts`
- [ ] P1：丰富 capability map，使 analyze/filter/purify 等与参数联动
- [ ] P1：为显式 step 与 lowered step 提供不同的确认策略
- [ ] P2：支持 run plan 的非线性依赖和分支可视化

**重点文件**
- `packages/runtime-lab/src/index.ts`

**验收标准**
- 不管步骤来自显式语法还是 lowering，runtime-lab 都能稳定构建 run plan
- 缺能力时诊断仍可指回原 source node

---

## 4.8 `@chemd/runtime-trace`

**当前职责**
运行事件定义与 replay。

**当前问题**
- trace 事件还比较薄，只记录事件类型、runId、stepId、payload
- 对 artifact / observation / analysis / manual override 的结构化约束不够强

**目标状态**
- runtime trace 可用于回放、审计、LLM 解释和人机协作记录

**任务清单**
- [ ] P0：将 trace event 与 canonical stepId 严格对齐
- [ ] P1：为 `observation_recorded`、`analysis_recorded`、`manual_override` 增加结构化 payload schema
- [ ] P1：加入 artifact 追踪字段与关联 step
- [ ] P1：replay 时结合 runPlan 校验 step 顺序与完成状态
- [ ] P2：增加 diagnostics trace，记录运行期新增警告/错误

**重点文件**
- `packages/runtime-trace/src/index.ts`

**验收标准**
- 回放结果不仅知道完成/失败，还知道失败与人工干预发生在哪个步骤、对应哪类对象

---

## 4.9 `@chemd/lnf`

**当前职责**
将 document / typedGraph / stepGraph / runPlan / runtime preflight 序列化成 `chemd-lnf/v0.5` canonical LNF。

**当前问题**
- v0.3/v0.4 仍作为迁移 builder 存在；产品与 playground 主输出应消费 canonical LNF，避免双版本并列造成理解成本

**目标状态**
主输出使用 `chemd-lnf/v0.5`：
- 保留 v0.3 的 compact reaction/result/step/observation 业务视图
- 保留 v0.4 的 typedGraph、workflow diagnostics、source split、runtime summary 与 migration summary
- 通过 step/source id 索引避免重复复制完整 step/event 对象

**任务清单**
- [x] P0：设计并实现 `chemd-lnf/v0.5` canonical schema
- [x] P0：保留 v0.3/v0.4 bridge/export
- [x] P1：加入 `syntax_origin` / `declared_kind`
- [x] P1：加入 typedGraph 与 normalized typed fields
- [x] P1：加入 procedure steps 的 provenance / confidence / source
- [x] P1：加入 runPlan 与 runtime preflight 摘要
- [x] P2：加入 migration-state 摘要，用于运营与清洗

**重点文件**
- `packages/lnf/src/types.ts`
- `packages/lnf/src/builders.ts`
- `packages/lnf/src/index.ts`

**验收标准**
- LNF 能同时让 LLM 看懂“对象 + 步骤 + 来源 + 置信度”
- 下游不用再从 renderer 输出里反推语义

---

## 4.10 `@chemd/compiler`

**当前职责**
总线：解析、解析后处理、类型化、运行计划、导出、渲染的统一入口。

**当前问题**
- 虽然总线已经完整，但还缺少 surface strictness、legacy policy、步骤模式等编译选项

**目标状态**
- compiler 继续是唯一总线
- surface policy 和 strict policy 由 compiler 统一控制

**任务清单**
- [ ] P0：保持现有 compile 主链路不拆散
- [ ] P0：新增 compile options：`strictChemdKind`、`procedureMode`
- [ ] P1：把 renderer 里残留的语义归一前移后，compiler 统一下发 typed/LNF 结果
- [ ] P1：编译结果中显式返回 migration diagnostics summary
- [ ] P2：加入 compile profile，用于编辑器实时预览与 CI 严格校验分离

**重点文件**
- `packages/compiler/src/index.ts`

**验收标准**
- `compileChemd()` 成为唯一可信的“文档真相出口”
- UI 与导出链路不再自己定义 surface policy

---

## 4.11 `@chemd/render-profile`

**当前职责**
渲染配置与 profile 解析。

**当前问题**
- 它不该承担语义推断，但后续容易被误用成“展示层修语义”的地方

**目标状态**
- render-profile 只管展示策略，不管 semantic inference

**任务清单**
- [ ] P0：明确 render-profile 只接收 typed / normalized 语义
- [ ] P1：为显式 step 与 lowered step 提供不同的展示 profile 开关（例如显示置信度、显示原句）
- [ ] P1：为 legacy syntax 诊断提供展示开关，不在 profile 中改语义
- [ ] P2：补 profile 循环、无效字段、默认值测试

**重点文件**
- `packages/render-profile/src/index.ts`

**验收标准**
- render-profile 不新增任何语义分类逻辑

---

## 4.12 `@chemd/renderer-json`

**当前职责**
输出 JSON 视图。

**当前问题**
- 当前仍在 renderer 阶段补 `normalized_conditions` 与 `normalized_tlc`
- JSON 中没有显式表明 surface origin / declared kind

**目标状态**
- JSON 只是序列化 typed / normalized 语义
- 能同时给 LLM 看 surface 与 semantic 的映射关系

**任务清单**
- [ ] P0：移除 renderer 中对 reaction conditions / TLC 的即时分类逻辑
- [ ] P0：改为读取 typechecker/LNF 提供的 normalized 字段
- [ ] P1：在 JSON 中输出 `syntax_origin`、`declared_kind`、`source_block_type`
- [ ] P1：对 explicit step / lowered step 分开编码
- [ ] P1：保留 token/reference 序列化，但与 source span/provenance 对齐
- [ ] P2：为 JSON 输出补稳定快照测试

**重点文件**
- `packages/renderer-json/src/index.ts`

**验收标准**
- JSON 输出不再偷偷补语义
- LLM 读取 JSON 时能直接知道对象来自 canonical chemd 还是 legacy 迁移

---

## 4.13 `@chemd/renderer-html`

**当前职责**
HTML 预览输出。

**当前问题**
- 后续需要把显式步骤、legacy/migration 状态、置信度展示清楚

**目标状态**
- HTML 是 compiler 语义的直观投影，不做额外推断

**任务清单**
- [ ] P0：保持 renderer-html 不做 semantic inference
- [ ] P1：为 `chemd` 节点显示 semantic kind 与 surface origin
- [ ] P1：显式 step 用结构化 UI 渲染；自由文本 lowered step 可以折叠显示原句与置信度
- [ ] P1：内联显示 legacy / ambiguous / conflict 诊断
- [ ] P2：为 provenance 提供 hover / appendix 展示

**重点文件**
- `packages/renderer-html/src/*`

**验收标准**
- 用户在 HTML 预览中能看出：这是 canonical chemd、这是 legacy 导入、这是 lowered 步骤

---

## 4.14 `@chemd/renderer-docx`

**当前职责**
DOCX bridge 输出。

**当前问题**
- 显式步骤、legacy 迁移状态、来源信息还未形成统一策略

**目标状态**
- DOCX 和 HTML 保持相同语义，不另造字段

**任务清单**
- [ ] P0：保持 DOCX 只消费 compiler/typed 结果
- [ ] P1：procedure 若有显式 steps，则导出为结构化步骤序列
- [ ] P1：保留 lowered procedure 的来源说明与必要脚注
- [ ] P1：legacy syntax 迁移诊断可以选择性附在附录或批注中
- [ ] P2：为 provenance / confidence 增加可选附录输出

**重点文件**
- `packages/renderer-docx/src/*`

**验收标准**
- 同一文档在 HTML / DOCX 中的对象、步骤、诊断含义一致

---

## 4.15 `@chemd/exporter-training`

**当前职责**
把文档导出为 training/RAG/prediction 友好的多层记录。

**当前问题**
- sample / analysis / result 的 ref 语义仍较轻，尚未升级为完整 sample lineage / evidence graph
- artifact 仍主要存在于内部 step/runtime 语义或 `analysis.data` 字符串中，尚未成为表层 DSL 一等块
- field-level source map 还未覆盖所有导出事实字段

**目标状态**
- training export 能告诉模型：原文是什么、语义是什么、哪些字段是归一得到的、哪些步骤是推断得到的
- training export 能告诉模型：reaction/result/analysis/sample/markdown 之间如何关联

**任务清单**
- [x] P0：source layer 记录 `source_block_type`、`syntax_origin`
- [x] P0：semantic layer 使用 typechecker/LNF 产出的 normalized typed fields
- [x] P0：semantic layer 生成 reaction/result/analysis/sample/markdown 的 fact links
- [x] P0：retrieval chunks 覆盖 document summary、analysis notes、sample notes
- [x] P1：learning layer 区分 explicit step pairs 与 lowered step pairs
- [x] P1：quality layer 增加 legacy syntax / missing kind / low-confidence lowering 的扣分逻辑
- [x] P1：procedure-to-steps 与 observation-to-events pair 写明 provenance
- [ ] P1：把 observation events 纳入 retrieval chunks 或 evidence summary
- [ ] P1：为 sample lineage 增加更明确的关系类型和 DSL 字段
- [ ] P1：为 artifact/evidence 设计最小表层 DSL 或 structured `analysis.data` 约束
- [ ] P2：加入 migration-state、strictness-state 等训练过滤元数据

**重点文件**
- `packages/exporter-training/src/export-record.ts`
- `packages/exporter-training/src/types.ts`
- `packages/exporter-training/src/semantic-layer.ts`
- `packages/exporter-training/src/learning-layer.ts`

**验收标准**
- training export 可以直接作为 LLM 数据层，不用再去猜 surface 与 semantic 的关系
- `semantic_layer.links` 能回答“这个结果、分析、样品分别指向什么实验事实”

---

## 4.16 `apps/web`

**当前职责**
编辑器、预览、化学编辑器、OCR、DOCX 导出、文档树、诊断展示。

**当前问题**
- UI 容易把内部 semantic kind 和 surface block 名称混淆
- 新旧语法迁移缺少明确交互
- procedure 还没有显式 step authoring 体验

**目标状态**
- Web 编辑主路径明确使用 canonical `:::chemd`
- “新建分子/新建反应”只是 `chemd` 的预设模板，不是新 surface block

**任务清单**
- [ ] P0：新增 canonical `chemd` 模板：`分子（chemd）`、`反应（chemd）`
- [ ] P0：编辑器插入模板默认带 `kind:`
- [ ] P0：打开 legacy `molecule/reaction` 文档时显示迁移 banner
- [ ] P1：一键迁移为 `:::chemd + kind:`
- [ ] P1：UI 中把“semantic kind”与“surface block type”分开展示
- [ ] P1：增加显式 step 编辑体验
- [ ] P1：诊断面板支持新 quick fixes：插入 kind、转换 legacy block、生成 step skeleton
- [ ] P1：OCR 导入结果在写回文档前，统一映射到 canonical `chemd` 字段表单
- [ ] P2：在预览中显示 lowered step 的原句与置信度
- [ ] P2：增加 legacy 使用率、missing kind、lowering 占比的运营指标

**重点目录**
- `apps/web/src/features/editor`
- `apps/web/src/features/document-tree`
- `apps/web/src/features/diagnostics`
- `apps/web/src/features/ocr`
- `apps/web/src/features/reaction-editor`
- `apps/web/src/app/api/chem/*`

**验收标准**
- 新用户主路径只需要知道 `:::chemd`
- 老文档能被看见、被警告、被一键迁移

---

## 4.17 `services/chem-service`

**当前职责**
化学侧能力服务：OCR、normalize、render、reaction render / OCR、结构缓存等，由 `apps/web` 调用。

**当前问题**
- 服务返回值还不一定与 canonical `chemd` surface schema 完全对齐
- OCR / normalize / render 的 provenance、confidence、placeholder 状态需要统一暴露

**目标状态**
- 所有 molecule/reaction 服务结果都可以直接映射为 canonical `:::chemd` 字段
- 服务只做化学能力，不定义文档语义

**任务清单**
- [ ] P0：统一 molecule/reaction OCR、normalize、render 返回 DTO
- [ ] P0：DTO 增加 `kind`、`confidence`、`provider`、`candidates`、`placeholder`、`normalized`
- [ ] P0：reaction OCR 返回统一映射为 `reactants/products/conditions` 结构，便于写回 `:::chemd kind: reaction`
- [ ] P1：molecule OCR / normalize 返回统一映射为 `smiles/name/formula/...`，便于写回 `:::chemd kind: molecule`
- [ ] P1：结构缓存增加 provider / fingerprint / normalized metadata
- [ ] P1：失败响应必须显式标注“失败/占位/候选不足”，不能伪装成成功语义
- [ ] P2：为 Web 端暴露更细粒度的审核信息，支持人工确认再落库

**重点目录**
- `services/chem-service/app.py`
- `services/chem-service/chem_service/*`
- `services/chem-service/tests/*`

**验收标准**
- chem-service 不需要知道 `:::molecule` / `:::reaction` 旧块名
- Web 端拿到的数据能直接填充 canonical `chemd` 模板

---

## 4.18 根工作区 / 脚本 / CI / 规范文档

**当前职责**
workspace 脚本、测试组织、迁移、开发规范。

**当前问题**
- 目前缺少“旧 surface block -> canonical chemd”的专门迁移工具
- 缺少围绕新 canonical surface policy 的 golden corpus 与 CI 约束

**目标状态**
- root 层负责把 surface policy 固化到测试、脚本和规范中

**任务清单**
- [ ] P0：新增 `scripts/migrate-legacy-surface-to-chemd.*`
- [ ] P0：新增 `scripts/audit-legacy-surface-usage.*`
- [ ] P0：建立 golden corpus：canonical chemd、legacy molecule/reaction、explicit steps、lowered steps
- [ ] P1：CI 中加入 compile snapshot 测试，覆盖 parser → compiler → LNF → JSON → HTML/DOCX bridge
- [ ] P1：新增代码规范文档：surface policy（canonical `chemd`、legacy migration、kind requirement）
- [ ] P1：加入 strict compile job，用于阻止新代码继续产生 surface ambiguity
- [ ] P2：加入数据质量报表：legacy 占比、missing kind 占比、lowering 占比、低置信度步骤占比

**重点文件/目录**
- 根 `package.json`
- `pnpm-workspace.yaml`
- `vitest.workspace.ts`
- `scripts/*`
- `docs/spec/*`

**验收标准**
- CI 能拦住新引入的 surface 语法漂移
- 老文档迁移有自动化脚本，不靠人工全文替换

---

## 5. 优先级落地顺序

### 第一阶段：先把 `:::chemd` 这条主路径做稳
- [ ] `@chemd/core`：补 `syntaxOrigin`、`declaredKind`
- [ ] `@chemd/parser`：给 `chemd` 加 `kind:`，保留 shape inference 兼容
- [ ] `@chemd/diagnostics`：补 legacy / ambiguous / conflict 诊断与 quick fix
- [ ] `apps/web`：插入模板统一产出 `:::chemd + kind:`
- [ ] 根脚本：旧 `molecule/reaction` → `chemd` 迁移工具

### 第二阶段：把 procedure 从“文本推断”升级为“显式优先”
- [ ] `@chemd/core`：StepNode
- [ ] `@chemd/parser`：显式 `step`
- [ ] `@chemd/typechecker`：显式 step 优先、lowering 兜底
- [ ] `@chemd/step-ontology`：退到兼容层
- [ ] `apps/web`：显式 step authoring UI

### 第三阶段：把归一化真相前移到 typed/LNF
- [ ] `@chemd/typechecker`：normalized conditions / tlc 前移
- [ ] `@chemd/lnf`：v0.4
- [ ] `@chemd/renderer-json`：停止 renderer 注入语义
- [ ] `@chemd/exporter-training`：source/provenance/quality 升级

### 第四阶段：把运行与服务链路打通
- [ ] `@chemd/runtime-lab`
- [ ] `@chemd/runtime-trace`
- [ ] `services/chem-service`
- [ ] `apps/web` OCR / preview / export 全链路对齐

---

## 6. 完成定义（Definition of Done）

当以下条件都满足时，可以认为这轮 surface/semantic 收敛完成：

1. 新文档主路径统一使用 `:::chemd`
2. 新生成的 `chemd` 模板默认都带 `kind:`
3. 老 `:::molecule` / `:::reaction` 文档不能直接编译为 semantic node，必须先自动迁移到 canonical `chemd`
4. AST / typed graph / LNF / training export 都保留 semantic kind 与 surface origin
5. `procedure` 支持显式 `step`，自由文本 lowering 成为兼容层
6. renderer 不再做新的语义推断
7. Web、compiler、chem-service 都围绕同一套 canonical surface schema 和 typed semantic schema 工作

---

## 7. 最终落地建议

这一轮最关键的不是把 `molecule/reaction` 重新升回主语法，而是：

- **承认 `:::chemd` 已经是当前 canonical surface block**
- **给 `chemd` 加显式 `kind:`，解决目前纯 shape inference 的不透明问题**
- **把旧 `molecule/reaction` 收口到兼容与迁移层**
- **把显式步骤、typed normalization、provenance 逐步补齐**

这样能最大化复用你当前 develop 分支已经跑通的 parser / resolver / typechecker / compiler / runtime / export 链路，也最符合当前代码真实走向。
