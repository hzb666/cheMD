# chemd 复杂度治理计划（2026-04-10）

> 面向 `apps/web`、`packages/*`、`services/chem-service` 的 lint / complexity 专项治理文档。
> 本文档参考 `LabStorageManager` 的复杂度治理文档结构，但按 `chemd` 当前 monorepo、编译主链、preview runtime 与 chem-service 边界重写。

## 0. 重构前置规则

以下规则适用于本文件后续所有复杂度治理工作，目的是避免“为了过 lint 而搬运复杂度”，最终把逻辑从函数体转移到更大的 options 对象、中转层或重复实现中。

### 0.1 不为过 lint 新增无价值中间层

开始重构前，先回答以下问题：

- 这次拆分是否真的降低了认知复杂度
- 被拆出去的逻辑是否形成清晰边界，而不是只把同一段判断移到别处
- 若删除这个新层，调用方是否会更清楚

若答案主要是否定的，则默认不新增新层。

### 0.2 `compiler` 保持薄编排，不替其他层背复杂度

`packages/compiler/src/index.ts` 当前只有 `76` 行，职责清晰。后续重构禁止出现以下做法：

- 把 `parser` 的 frontmatter/body 复杂逻辑转移到 `compiler`
- 把 `renderer-html` 的 block/inline 渲染细节转移到 `compiler`
- 把 web preview hydration、chem-service fallback 或 route 兜底逻辑塞进 `compiler`

`compiler` 只负责串联 `parse -> resolve -> render-profile -> renderers`。

### 0.3 优先抽离“纯逻辑 / 协议转换 / 规则判断”

优先抽离的内容：

- parser 中的 YAML 清洗、schema 赋值、diagnostic 构造
- renderer 中的 inline token 解析、markdown block 渲染、object block 渲染
- Next.js route 中的请求校验、CAS hydration、响应组装
- preview runtime 中的消息解析、inventory lookup、HTML hydration、DOM patch
- chem-service 中的 provider adapter、reaction layout、SVG 几何处理、structure cache

谨慎抽离的内容：

- 只包一层 JSX 的壳组件
- 只负责转发参数的 route helper
- 只为减少行数而出现的一次性 mega interface / mega config

### 0.4 包边界优先于应用边界

`chemd` 的主线仍然是：

```text
packages/core
  -> packages/parser
  -> packages/resolver
  -> packages/render-profile
  -> packages/renderer-*
  -> packages/compiler
  -> apps/web / services/chem-service
```

因此默认顺序是：

1. 先修 package 层热点
2. 再处理 web 集成层
3. 最后清理测试与文档跟进

不要反过来在 `apps/web` 里堆更多补丁去绕过 package 层复杂度。

### 0.5 Route / Hook / Bridge 的准入规则

`apps/web` 中三类文件的职责要收紧：

- route handler：只负责 `auth / parse / call / serialize`
- hook/controller：只负责状态编排、副作用触发、事件接线
- bridge/hydration：只负责消息协议和 DOM patch，不再顺带承接缓存、网络回退和业务判断

若一个文件同时承担了“协议解析 + 网络调用 + fallback 规则 + UI 状态 + DOM 操作”，就应该继续拆。

### 0.6 Python service 禁止长期双轨实现

`services/chem-service` 当前已经出现“模块已拆出，但 `app.py` 中仍保留旧实现”的迁移中间态。后续重构必须遵循：

- 一旦 `chem_service/*` 成为正式实现，`app.py` 只保留 route 和装配
- 不允许同一组常量 / helper 在 `app.py` 与 `chem_service/*` 双份存在
- 不允许靠复制函数来“降低单文件复杂度”

### 0.7 注释规范与注释债

当前代码的一个现实问题是：很多复杂逻辑几乎没有注释，尤其是以下几类文件：

- parser 的 frontmatter / body 解析
- `renderer-html` 的 inline token 与 markdown 渲染
- web preview 的 bridge / hydration / message protocol
- chem-service 的 reaction layout / SVG geometry / cache 处理

这不符合当前仓库规范。后续复杂度治理必须把“补充必要注释”视为正式整改项，而不是可选美化项。

注释编写规则如下：

- 注释优先解释为什么这样做，其次才是做了什么；但正文直接写结论，不写“为什么这样做：”这类标签
- 只给非直观的协议约束、边界条件、fallback 策略、几何计算、兼容性分支写注释
- 能靠更好的命名说清的，不用注释代替命名
- 注释默认使用简体中文，保持短句、高信息密度
- 不允许保留注释掉的旧实现、长期失效的 TODO/FIXME、和代码实际行为不一致的说明
- 不允许出现“为什么这样做：”“之所以”“这里是为了”“这个函数是用来”这类标签化、自问自答、教学腔或无信息增量的词

必须补注释的场景：

- `postMessage` 协议字段和安全约束
- preview hydration / DOM patch 的替换规则
- parser 中的 frontmatter 清洗、行号映射、diagnostic 归因
- reaction SVG 几何、箭头定位、加号识别、裁剪/扩展规则
- CAS / provider / render fallback 的判定分支

不建议补注释的场景：

- 注释只是复述函数名、变量名、类型名
- 为了显得完整，给每个小 helper 都加模板化说明
- 用大段注释掩盖糟糕边界、过大函数或过深嵌套

判断是否写对的标准：

- 删掉注释后，复杂逻辑是否明显更难理解
- 保留注释后，维护者是否能更快定位协议、约束和异常路径
- 注释是否确实减少了阅读成本，而不是制造噪音

### 0.8 测试重构规则

测试文件的治理目标不是把一个长 `describe` 拆成更多样板，而是：

- 提取 fixture builder / sample source / assertion helper
- 按行为簇拆文件，而不是按“把 case 平分到多个 test 文件”
- 保持断言离场景足够近，不做看不见行为的大型黑盒 helper

### 0.9 本次重构是否成功的标准

不以“函数变短”作为唯一标准，而以下列结果判断：

- lint 问题总数下降
- 热点文件更少
- `compiler`、route、hook、service 边界更清晰
- chem-service 重复实现减少
- 关键协议、解析链、几何计算和 fallback 分支补上必要注释
- AST、diagnostic code、render profile 语义、preview 消息协议、结构缓存语义保持不变

### 0.10 后端整改执行来源

- `docs/2026-04-10-backend-refactor-remediation-implementation-plan.md` 是本轮 `apps/web` 后端 route / server 与 `services/chem-service` 收口整改的直接执行来源。
- 该子计划默认不改变 HTTP 响应字段、`CAS` / `PubChem` fallback 语义、`/structure` 缓存 key/TTL 语义，以及 reaction `data-*` 协议。
- 后端相关注释债必须跟随对应逻辑拆分一起完成；不接受只补注释、不拆边界的“假治理”。

## 1. 文档目标

本文档用于指导 2026 年 4 月 10 日起的 `chemd` 复杂度治理工作。目标不是“机械消告警”，而是在**不改变核心行为**的前提下，系统性降低以下问题：

- 函数 / 文件过长
- 圈复杂度、语句数、参数数量过高
- route / hook / runtime / service 职责混杂
- 复杂协议、解析和几何逻辑缺少解释性注释
- 测试文件把多个行为簇堆进单一入口
- Python service 迁移中间态造成的重复实现和双真相源

本文档同时作为以下事项的统一基线：

- 当前复杂度基线
- 热点文件优先级
- 分阶段治理范围
- 每批次验收标准
- 风险控制策略

## 2. 本轮基线

### 2.1 基线说明

- 统计时间：`2026-04-10`
- 统计对象：当前工作区状态，不是仅 `HEAD`
- 说明：仓库当前 `git status` 非 clean，因此以下数字反映的是**当前本地代码现状**

### 2.2 TypeScript / ESLint 基线

执行命令：

```bash
pnpm lint
```

执行结果：

- 总问题数：`74`
- 严重级别：`73 error + 1 warning`
- 生产代码问题：`58`
- 测试代码问题：`16`
- 规则分布：
  - `complexity`: `27`
  - `max-lines-per-function`: `21`
  - `max-statements`: `17`
  - `max-params`: `5`
  - `max-depth`: `2`
  - `max-nested-callbacks`: `1`
  - `@typescript-eslint/no-unused-vars`: `1`

生产代码目录分布：

- `apps/web`: `26`
- `packages/parser`: `18`
- `packages/renderer-html`: `6`
- `packages/resolver`: `3`
- `packages/core`: `1`
- `packages/render-profile`: `1`
- `packages/renderer-docx`: `1`
- `packages/exporter-training`: `1`
- 其他：`1`

补充说明：

- `eslint.config.mjs` 当前已对 `services/**` 做 ignore
- 这意味着 TypeScript 复杂度基线与 Python service 基线是分离的，不能把 `pnpm lint` 当作全仓复杂度真相源

### 2.3 Python service 默认 Ruff 基线

执行命令：

```bash
pnpm lint:py
```

执行结果：

- 总问题数：`26`
- 规则分布：
  - `E501`: `23`
  - `F811`: `2`
  - `I001`: `1`

文件分布：

- `services/chem-service/app.py`: `12`
- `services/chem-service/chem_service/reaction_svg_layout.py`: `9`
- `services/chem-service/chem_service/reaction_rendering.py`: `5`

结论：

- 默认 Ruff 主要暴露的是长行、重复定义和 import 排序
- 这能看出迁移中间态，但不足以完整反映复杂度问题

### 2.4 Python service 补充复杂度基线

执行命令：

```bash
ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915
```

执行结果：

- 总问题数：`26`
- 规则分布：
  - `PLR0913`: `13`
  - `C901`: `8`
  - `PLR0911`: `3`
  - `PLR0912`: `2`

文件分布：

- `services/chem-service/app.py`: `16`
- `services/chem-service/chem_service/reaction_svg_layout.py`: `7`
- `services/chem-service/chem_service/reaction_rendering.py`: `2`
- `services/chem-service/chem_service/reaction_layout.py`: `1`

#### 2.4.1 最新状态（2026-04-10，Chunk 5 完成后）

- 执行命令：`ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
- 结果：已降到 `All checks passed!`
- 变化：
  - `services/chem-service/app.py` 已退出复杂度热点清单
  - `F811` 已清零，基础 `ruff check services/chem-service` 为 `All checks passed!`
  - `services/chem-service/chem_service/reaction_layout.py` 已退出复杂度热点清单
  - `services/chem-service/chem_service/reaction_rendering.py` 已退出复杂度热点清单
  - `services/chem-service/chem_service/molecule_ocr.py` 已改为显式 provider request model
  - `services/chem-service/chem_service/reaction_ocr.py` 已改为显式 provider request model
  - `services/chem-service/chem_service/reaction_svg_layout.py` 已收口为 orchestrator，并拆分到 `reaction_svg_arrow.py` / `reaction_svg_spacing.py` / `reaction_svg_bounds.py`
- 当前复杂度热点文件分布：无

补充验证（2026-04-10，Chunk 6 完成后）：

- `pnpm --filter @chemd/web test`：`37 files, 129 tests passed`
- `pnpm --filter @chemd/web typecheck`：`exit 0`
- `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`：`exit 0`
- `cd services/chem-service && poetry run python -m unittest discover -s tests -v`：`46 tests passed`

### 2.7 当前执行基线（2026-04-17）

本节是本轮继续治理的实际执行来源，优先级高于 2026-04-10 的历史基线。

当前工作区状态：

- 分支：`develop`
- `git status`：clean（开始治理前）
- 统计时间：`2026-04-17`

TypeScript / React lint：

```bash
pnpm lint
```

执行结果：

- 总问题数：`28`
- 严重级别：`28 error + 0 warning`
- 生产代码问题：`23`
- 测试代码问题：`5`
- 规则分布：
  - `complexity`: `11`
  - `max-lines-per-function`: `10`
  - `max-statements`: `5`
  - `max-nested-callbacks`: `1`
  - `react-hooks/globals`: `1`

目录分布：

- `apps/web`: `22`
  - 生产代码：`17`
  - 测试代码：`5`
- `packages/exporter-training`: `1`
- `packages/parser`: `2`
- `packages/render-profile`: `1`
- `packages/renderer-docx`: `2`

当前剩余 TypeScript 热点：

- `apps/web/src/app/page.tsx`
- `apps/web/src/features/chem-editor/components/EmbeddedChemEditorHost.tsx`
- `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts`
- `apps/web/src/features/chem-editor/lib/chem-editor-export.ts`
- `apps/web/src/features/chem-editor/lib/load-chemd-draft.ts`
- `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts`
- `apps/web/src/features/chem-preview/lib/preview-bridge.ts`
- `apps/web/src/features/chem-preview/lib/preview-hydration.ts`
- `apps/web/src/features/ocr/hooks/useImageOcr.ts`
- `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts`
- `apps/web/src/features/preview/hooks/usePreviewShellController.ts`
- `apps/web/src/features/reaction-editor/lib/update-reaction-block.ts`
- `apps/web/tests/chem-inventory-route.test.ts`
- `apps/web/tests/chem-ocr-route.test.ts`
- `apps/web/tests/rendered-preview-helpers.test.ts`
- `apps/web/tests/replace-chem-block.test.ts`
- `apps/web/tests/use-chem-ocr-actions.test.tsx`
- `packages/exporter-training/src/semantic-layer.ts`
- `packages/parser/src/inline/tokenize-markdown-links.ts`
- `packages/render-profile/src/index.ts`
- `packages/renderer-docx/src/index.ts`

Python Ruff：

```bash
pnpm lint:py
```

结果：`All checks passed!`

Python 复杂度补充门禁：

```bash
cd services/chem-service
poetry run ruff check app.py chem_service --select C90,PLR0911,PLR0912,PLR0913,PLR0915
```

结果：`All checks passed!`

当前结论：

- Python service 当前不是剩余治理对象；后续只做防回归验证。
- 当前治理目标收敛为 `pnpm lint` 的 28 个 TypeScript / React error。
- 本轮不得为消除 lint 改变 AST、render profile、route 响应、preview message 或 chem-service 语义。
- 优先处理纯函数和 package 层小热点，再处理 web hook / component 大函数，最后治理测试文件。

### 2.5 体量热点

当前源码中最值得关注的大文件：

- `services/chem-service/app.py`: `2460` 行
- `packages/renderer-html/src/index.ts`: `1070` 行
- `packages/parser/tests/parser.test.ts`: `1038` 行
- `packages/parser/src/frontmatter/parse-frontmatter.ts`: `776` 行
- `packages/render-profile/src/index.ts`: `718` 行
- `packages/parser/src/body/parse-body.ts`: `648` 行
- `packages/resolver/src/index.ts`: `602` 行
- `apps/web/src/server/chem/cas-resolver.ts`: `513` 行
- `apps/web/src/features/preview/styles/preview-document.ts`: `503` 行

并不是所有大文件都已经触发 lint，但它们是明确的潜在热点。

### 2.6 基线结论

当前复杂度问题不是平均分布，而是集中在四个区块：

1. `packages/parser` 的 frontmatter / body 解析链
2. `packages/renderer-html` 的 markdown + inline + block 渲染链
3. `apps/web` 的 preview / OCR / API route / iframe bridge 链
4. `services/chem-service` 的 reaction 渲染与结构缓存链

这和 `docs/chemd-v0.1-architecture.zh-CN.md` 中“parser / renderer-html 继续拆分仍有价值”的判断是一致的；区别在于，到了 `2026-04-10`，它们已经不是“长期优化项”，而是当前 lint 热点。

## 3. 热点清单与优先级

### 3.1 P0：最高优先级

#### 1. `packages/parser/src/frontmatter/parse-frontmatter.ts`

- 文件体量：`776` 行
- lint 问题数：`11`
- 代表问题：
  - `parseFrontmatter`：`285` 行、`104` statements、复杂度 `75`
  - `assignFrontmatterValue`：`195` 行、`57` statements、参数 `8`
  - 出现 `max-depth`
- 结构问题：
  - 同一文件同时承接前置清洗、YAML 解析、plain value 转换、schema 赋值、diagnostic 定位
  - `render_overrides` 的路径校验与通用 frontmatter 赋值耦合过深

#### 2. `packages/renderer-html/src/index.ts`

- 文件体量：`1070` 行
- lint 问题数：`6`
- 代表问题：
  - `renderMarkdownNode`：`197` 行、`112` statements、复杂度 `22`
  - `renderInlineTextWithRanges`：复杂度 `23`
  - `locateTokenRanges`：语句数过高
- 结构问题：
  - inline token、markdown block、表格/列表、对象块渲染全部堆在同一入口
  - 逃逸、链接清洗、range 定位与 block render 共享一个文件，修改回归面过大

#### 3. `apps/web` preview / OCR / route 集群

重点文件：

- `apps/web/src/app/api/chem/ocr/route.ts`
- `apps/web/src/app/api/chem/render/route.ts`
- `apps/web/src/app/api/chem/save/route.ts`
- `apps/web/src/app/api/export/docx/route.ts`
- `apps/web/src/features/preview/hooks/usePreviewShellController.ts`
- `apps/web/src/features/chem-preview/lib/preview-hydration.ts`
- `apps/web/src/features/chem-preview/lib/preview-bridge.ts`
- `apps/web/src/features/ocr/hooks/useImageOcr.ts`

共同症状：

- route 里混合请求校验、fallback、CAS hydration、持久化、响应拼装
- hook 里混合消息监听、inventory cache、iframe 通信、编辑接线
- preview hydration 里混合 HTML 解析、草稿回填、render 请求、字符串替换
- OCR hook 里混合上传、payload 解释、source patch、UI 状态

#### 4. `services/chem-service` reaction 渲染链

重点文件：

- `services/chem-service/app.py`
- `services/chem-service/chem_service/reaction_svg_layout.py`
- `services/chem-service/chem_service/reaction_rendering.py`
- `services/chem-service/chem_service/reaction_layout.py`

共同症状：

- `app.py` 仍高达 `2460` 行
- 默认 Ruff 已出现 `F811`，说明抽离和保留并存
- 复杂度规则显示 reaction layout / svg geometry 的核心复杂函数仍然很重
- `PLR0913` 密集出现，说明参数组织仍未完成结构化

### 3.2 P1：高优先级

#### TypeScript 生产代码

1. `packages/parser/src/body/parse-body.ts`
- `648` 行，`5` 个 lint 问题
- `parseStructuredBlock`、`parseChildren` 已具备继续拆成 block parser registry 的价值

2. `packages/resolver/src/index.ts`
- `602` 行，`3` 个 `max-params`
- `resolveNode / expandUseNode / resolveReference` 的上下文参数需要收口

3. `apps/web/src/features/chem-editor/components/EmbeddedChemEditorHost.tsx`
- `296` 行
- 编辑器初始化、runtime 加载、值同步、change binding 耦合

4. `apps/web/src/app/page.tsx`
- `188` 行
- 主页面已经开始承担多条链路接线，应继续收口为更薄的组合层

5. `packages/renderer-docx/src/index.ts`
- `205` 行
- 当前问题不算多，但 markdown bridge 与 payload 生成仍在同文件

#### Python 结构风险

1. `services/chem-service/chem_service/reaction_svg_layout.py`
- `801` 行，复杂度问题 `7`
- 即使已经抽模块，仍然是单模块巨石

2. `services/chem-service/app.py`
- 不只是“大”，而且包含 provider、RDKit、reaction SVG、cache、Flask route 五类职责

### 3.3 P2：中优先级 / 清尾

#### 测试文件

- `packages/parser/tests/parser.test.ts`
- `packages/renderer-html/tests/renderer-html.test.ts`
- `apps/web/tests/chem-ocr-route.test.ts`
- `apps/web/tests/chem-render-route.test.ts`
- `apps/web/tests/preview-edit-message.test.ts`
- `apps/web/tests/rendered-preview-helpers.test.ts`

当前测试问题以 `max-lines-per-function` 为主，说明主要矛盾是“单文件承载过多行为簇”，不是断言精度本身。

#### 潜在大文件

- `packages/render-profile/src/index.ts`
- `apps/web/src/server/chem/cas-resolver.ts`
- `apps/web/src/features/preview/styles/preview-document.ts`

这些文件当前不是本轮第一优先级，但如果继续扩功能，很容易进入下一轮 P1。

## 4. 治理策略

### 4.1 Parser 治理策略

#### `parse-frontmatter.ts`

建议拆成以下责任层：

- `frontmatter-sanitizer.ts`
  - 处理 block scalar、非法行、预清洗
- `frontmatter-yaml.ts`
  - 处理 `yaml` document 到 plain object / node span 的转换
- `frontmatter-assigners.ts`
  - 处理 `meta`、`render_selection`、`render_overrides` 赋值
- `frontmatter-diagnostics.ts`
  - 统一 diagnostic 构造和行号映射

禁止的做法：

- 用一个更大的 `assignFrontmatterValue(options)` 替代当前函数
- 把 `render_overrides` 特殊逻辑藏进 `compiler` 或 `core`

#### `parse-body.ts`

建议拆成：

- block start / block close 识别
- structured block field 解析
- `col` 专项解析
- children walker / recursion orchestration

最终让 `parseBody()` 只保留“分发 + 汇总 diagnostics”。

2026-04-11 更新：

- `packages/parser/src/body/parse-structured-block.ts` 已收口为轻量分发层
- 新增 `packages/parser/src/body/block-parsers/*`，按 block 拆出 `chemd / result / sample / analysis / procedure / observation`
- `parse-body-shared.ts` 当前只保留通用 token、field 与 block line helper
- 这轮新增 `procedure / observation / analysis(tlc)` 时，没有把复杂度转移到 `compiler` 或 `apps/web`

### 4.2 Renderer 治理策略

#### `renderer-html`

建议按四块拆分：

1. `inline/`
- token range 定位
- inline styles / link sanitize

2. `markdown/`
- heading / list / task / table / paragraph

3. `blocks/`
- molecule / reaction / result / sample / template / col

4. `render-html.ts`
- `renderNode`、`renderHtml` 编排

目标不是把一个 `index.ts` 变成很多空 wrapper，而是让“inline -> markdown -> block -> document”边界清楚。

### 4.3 `apps/web` 治理策略

#### route handler

把 `ocr / render / save / export docx` 统一收口到：

- request parser / validator
- domain service 调用
- response builder

当前 route 之间已经出现明显重复模式，适合抽公共 helper，而不是各自继续长大。

#### preview runtime

建议拆成：

- `preview-message-protocol`
- `inventory-lookup-client`
- `preview-dom-hydration`
- `preview-bridge-script`

重点是把以下边界拉开：

- iframe 消息协议
- inventory lookup 缓存
- HTML 内 chemical section 提取与替换
- 编辑事件与 hover 事件的 DOM 绑定

#### OCR / 编辑链

`useImageOcr`、`useRenderedPreview`、`EmbeddedChemEditorHost` 应按以下方向拆：

- 上传/请求
- payload 转 draft/source patch
- runtime init / editor sync
- UI state

### 4.4 `services/chem-service` 治理策略

chem-service 当前最需要的是**完成迁移，而不是再开新层**。

建议顺序：

1. 先确定唯一真相源
- `reaction_layout.py`
- `reaction_rendering.py`
- `reaction_svg_layout.py`
- `structure_store.py`（建议新增）
- `provider_adapters.py`（建议新增）

2. 再把 `app.py` 收口成：
- Flask app 初始化
- route handler
- service 装配
- internal route guard / CORS

3. 最后处理参数收口
- 用 dataclass / typed config 替换 `PLR0913`
- 用更小的几何 helper 替换 `C901`

### 4.5 测试治理策略

测试按“行为簇”拆，不按“平均分行数”拆。

推荐模式：

- parser：frontmatter / body / inline token / diagnostics 分文件
- renderer：inline / markdown / block render / full document render 分文件
- web：route contract / preview message / hydration helper / editor host 分文件
- Python：reaction layout / svg layout / provider mapping / structure cache 分文件

## 5. 分阶段治理计划

### Phase 0.1：2026-04-17 剩余 lint 清零批次

本阶段只治理 2026-04-17 当前 `pnpm lint` 暴露的 28 个 error，不扩大为全仓大文件重构。

执行原则：

- 每批只处理一组责任边界相近的文件。
- 每批结束后必须运行定向 lint / test / typecheck，完成自审并更新本文档进度。
- 不用“巨大 options 对象”“中转万能 helper”掩盖复杂度。
- 不改变公共 API、HTTP 响应字段、preview message 协议和 AST 结构。
- 测试文件按行为簇提取 helper，不做机械平均拆分。

批次计划：

1. Package 小热点批次：
   - `packages/parser/src/inline/tokenize-markdown-links.ts`
   - `packages/renderer-docx/src/index.ts`
   - `packages/render-profile/src/index.ts`
   - `packages/exporter-training/src/semantic-layer.ts`
2. Web 纯 helper / request flow 批次：
   - `apps/web/src/features/reaction-editor/lib/update-reaction-block.ts`
   - `apps/web/src/features/chem-editor/lib/chem-editor-export.ts`
   - `apps/web/src/features/chem-editor/lib/load-chemd-draft.ts`
   - `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts`
   - `apps/web/src/features/ocr/hooks/useImageOcr.ts`
3. Preview runtime / bridge 批次：
   - `apps/web/src/features/chem-preview/lib/preview-hydration.ts`
   - `apps/web/src/features/chem-preview/lib/preview-bridge.ts`
   - `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts`
   - `apps/web/src/features/preview/hooks/usePreviewShellController.ts`
4. Web component / page / controller 批次：
   - `apps/web/src/features/chem-editor/components/EmbeddedChemEditorHost.tsx`
   - `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts`
   - `apps/web/src/app/page.tsx`
5. 测试清尾批次：
   - `apps/web/tests/chem-inventory-route.test.ts`
   - `apps/web/tests/chem-ocr-route.test.ts`
   - `apps/web/tests/rendered-preview-helpers.test.ts`
   - `apps/web/tests/replace-chem-block.test.ts`
   - `apps/web/tests/use-chem-ocr-actions.test.tsx`

阶段验收：

```bash
pnpm lint
pnpm lint:py
cd services/chem-service
poetry run ruff check app.py chem_service --select C90,PLR0911,PLR0912,PLR0913,PLR0915
```

最终收尾还需要按改动面运行对应 package / web 的测试与 typecheck。

执行进度（2026-04-17，Package 小热点批次完成）：

- 已治理：
  - `packages/parser/src/inline/tokenize-markdown-links.ts`
  - `packages/renderer-docx/src/index.ts`
  - `packages/render-profile/src/index.ts`
  - `packages/exporter-training/src/semantic-layer.ts`
- 注释同步：
  - Markdown link href 嵌套括号与跨行终止规则已补自然注释。
  - RDKit adapter 字段映射写回 canonical render options 的校验约束已补自然注释。
  - Reaction participant `@id` 依赖 molecule 索引先生成的语义层顺序已补自然注释。
- 验证结果：
  - `pnpm exec eslint packages/parser/src/inline/tokenize-markdown-links.ts packages/renderer-docx/src/index.ts packages/render-profile/src/index.ts packages/exporter-training/src/semantic-layer.ts --ext .ts,.tsx`：`exit 0`
  - `pnpm --filter @chemd/parser test`：`1 test passed`
  - `pnpm --filter @chemd/renderer-docx test`：`1 test passed`
  - `pnpm --filter @chemd/render-profile test`：`1 test passed`
  - `pnpm --filter @chemd/exporter-training test`：`1 test passed`
  - `pnpm --filter @chemd/parser typecheck`：`exit 0`
  - `pnpm --filter @chemd/renderer-docx typecheck`：`exit 0`
  - `pnpm --filter @chemd/render-profile typecheck`：`exit 0`
  - `pnpm --filter @chemd/exporter-training typecheck`：`exit 0`
  - `git diff --check`：`exit 0`，仅有 autocrlf 工作区提示
  - `pnpm lint`：剩余 `22 errors`，均位于 `apps/web`
- 审查结论：
  - 未改公共导出 API、AST、render profile 字段或训练记录 schema。
  - 未引入跨 package 中间层；拆分仅围绕原文件内部纯逻辑。
  - 注释只说明协议/顺序约束，没有记录重构动作。

执行进度（2026-04-17，Web 纯 helper / request flow 批次完成）：

- 已治理：
  - `apps/web/src/features/reaction-editor/lib/update-reaction-block.ts`
  - `apps/web/src/features/chem-editor/lib/chem-editor-export.ts`
  - `apps/web/src/features/chem-editor/lib/load-chemd-draft.ts`
  - `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts`
  - `apps/web/src/features/ocr/hooks/useImageOcr.ts`
- 注释同步：
  - Reaction block 更新只覆盖编辑器托管字段、保留 metadata 的规则已补自然注释。
  - RXN counts 保护 ionic fragment 点号的解析约束已补自然注释。
  - 缓存 molecule draft 缺少 molfile 时的 hydrate 规则已补自然注释。
  - 保存接口回传标准化 payload 后才能 patch source 的约束已补自然注释。
  - OCR fallback block id 必须由服务端和客户端共用的协议约束已补自然注释。
- 验证结果：
  - `pnpm --filter @chemd/web exec eslint src/features/reaction-editor/lib/update-reaction-block.ts src/features/chem-editor/lib/chem-editor-export.ts src/features/chem-editor/lib/load-chemd-draft.ts src/features/chem-editor/hooks/useChemdEditFlow.ts src/features/ocr/hooks/useImageOcr.ts`：`exit 0`
  - `pnpm --filter @chemd/web test -- tests/reaction-editor-utils.test.ts tests/chem-editor-export.test.ts tests/load-chemd-draft.test.ts`：`3 files, 13 tests passed`
  - `pnpm --filter @chemd/web typecheck`：`exit 0`
  - `git diff --check`：`exit 0`，仅有 autocrlf 工作区提示
  - `pnpm lint`：剩余 `15 errors`
- 审查结论：
  - 未改 route 响应字段、OCR route 合约、draft cache URL 或 session header 行为。
  - Source patch 仍沿用原有 `replaceChemBlock` / `updateReactionBlock` / insert helper。
  - 注释解释协议与数据归一化边界，没有记录重构动作。

执行进度（2026-04-17，Preview hydration 子批次完成）：

- 已治理：
  - `apps/web/src/features/chem-preview/lib/preview-hydration.ts`
  - `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts`
- 注释同步：
  - Preview hydration 优先使用编辑器缓存 draft 的同步规则已补自然注释。
  - Reaction cache 必须同时具备 reactants/products 才能写回 preview 的规则已补自然注释。
- 验证结果：
  - `pnpm --filter @chemd/web exec eslint src/features/chem-preview/lib/preview-hydration.ts src/features/chem-preview/hooks/useRenderedPreview.ts`：`exit 0`
  - `pnpm --filter @chemd/web test -- tests/rendered-preview-helpers.test.ts tests/rendered-preview-molecule.test.ts tests/rendered-preview-reaction.test.ts tests/rendered-preview.test.tsx`：`4 files, 16 tests passed`
  - `pnpm --filter @chemd/web typecheck`：`exit 0`
  - `git diff --check`：`exit 0`，仅有 autocrlf 工作区提示
  - `pnpm lint`：剩余 `11 errors`
- 审查结论：
  - 未改 `/api/chem/render` 请求字段、fallback HTML 结构或 preview section `data-*` 字段。
  - Hydration 仍按 molecule / reaction 两条链路并行执行，只把缓存读取和 payload 归一化局部化。
  - 注释只说明缓存同步与半截 reaction draft 的防护边界。

执行进度（2026-04-17，Preview bridge / controller 子批次完成）：

- 已治理：
  - `apps/web/src/features/chem-preview/lib/preview-bridge.ts`
  - `apps/web/src/features/preview/hooks/usePreviewShellController.ts`
- 注释同步：
  - iframe bridge 只接受 parent origin 与 preview token 同时匹配的 `postMessage` 已补自然注释。
  - iframe `srcDoc` reload 期间 `contentWindow` 可能短暂不可用的状态同步边界已补自然注释。
- 验证结果：
  - `pnpm --filter @chemd/web exec eslint src/features/chem-preview/lib/preview-bridge.ts src/features/preview/hooks/usePreviewShellController.ts`：`exit 0`
  - `pnpm --filter @chemd/web test -- tests/preview-shell.test.tsx tests/chem-inventory-route.test.ts tests/rendered-preview-helpers.test.ts`：`3 files, 17 tests passed`
  - `pnpm --filter @chemd/web typecheck`：`exit 0`
  - `git diff --check`：`exit 0`，仅有 autocrlf 工作区提示
  - `pnpm lint`：剩余 `8 errors`
- 审查结论：
  - Preview bridge 运行时脚本只拆成片段常量，未改 DOM selector、message type、payload 字段或 hover 延迟。
  - Inventory lookup cache / pending promise 语义保持不变。
  - Hook 仍只负责 message listener 接线和返回 preview shell 状态。

执行进度（2026-04-17，Web component / page / controller 批次完成）：

- 已治理：
  - `apps/web/src/app/page.tsx`
  - `apps/web/src/features/chem-editor/components/EmbeddedChemEditorHost.tsx`
  - `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts`
- 验证结果：
  - `pnpm --filter @chemd/web exec eslint src/app/page.tsx src/features/chem-editor/components/EmbeddedChemEditorHost.tsx src/features/playground/hooks/usePlaygroundDocumentController.ts`：`exit 0`
  - `pnpm --filter @chemd/web test -- tests/embedded-chem-editor-host-init.test.ts tests/preview-shell.test.tsx tests/editor-surface.test.tsx`：`3 files, 4 tests passed`
  - `pnpm --filter @chemd/web typecheck`：`exit 0`
  - `git diff --check`：`exit 0`，仅有 autocrlf 工作区提示
  - `pnpm lint`：剩余 `5 errors`，均位于 `apps/web/tests`
- 审查结论：
  - `page.tsx` 只抽出 header 和 editor toolbar 组合层，未改 hook 接线和用户流程。
  - `EmbeddedChemEditorHost` 只抽出 Ketcher runtime 加载和渲染壳，初始化、change handler cleanup 与 bridge ready 回调保持原语义。
  - Playground controller 只把 compile commit 从 nested callback 中移出，scheduler / JSON export 行为保持不变。

执行进度（2026-04-17，测试清尾与最终门禁完成）：

- 已治理：
  - `apps/web/tests/chem-inventory-route.test.ts`
  - `apps/web/tests/chem-ocr-route.test.ts`
  - `apps/web/tests/rendered-preview-helpers.test.ts`
  - `apps/web/tests/replace-chem-block.test.ts`
  - `apps/web/tests/use-chem-ocr-actions.test.tsx`
- 验证结果：
  - `pnpm --filter @chemd/web exec eslint tests/chem-inventory-route.test.ts tests/chem-ocr-route.test.ts tests/rendered-preview-helpers.test.ts tests/replace-chem-block.test.ts tests/use-chem-ocr-actions.test.tsx`：`exit 0`
  - `pnpm --filter @chemd/web test -- tests/chem-inventory-route.test.ts tests/chem-ocr-route.test.ts tests/rendered-preview-helpers.test.ts tests/replace-chem-block.test.ts tests/use-chem-ocr-actions.test.tsx`：`5 files, 34 tests passed`
  - `pnpm --filter @chemd/web typecheck`：`exit 0`
  - `pnpm lint`：`exit 0`
  - `pnpm lint:py`：`All checks passed!`
  - `cd services/chem-service && poetry run ruff check app.py chem_service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`：`All checks passed!`
  - `pnpm typecheck`：`16 successful, 16 total`
  - `pnpm test`：`16 successful, 16 total`；其中 `@chemd/web` 为 `31 files, 106 tests passed`
- 审查结论：
  - 测试按行为簇拆分 `describe`，未改变 mock、请求构造或断言语义。
  - Hook 测试移除 render 阶段外部变量赋值，保留原有 server render 验证方式。
  - 本轮 2026-04-17 TypeScript lint 从 `28 errors` 降到 `0`；Python Ruff 与补充复杂度门禁保持 `0`。

执行进度（2026-04-17，审查后回归风险修复完成）：

- 已修复：
  - `apps/web/src/features/chem-preview/lib/preview-hydration.ts`：reaction draft cache 恢复为按字段是否为数组判定，保留空数组语义。
  - `apps/web/src/features/preview/hooks/usePreviewShellController.ts`：inventory hover 异步回写改为发送时读取当前 iframe，避免 srcDoc remount 后写到旧 frame。
  - `apps/web/src/features/ocr/hooks/useImageOcr.ts`：reaction OCR payload 恢复 products 可选链保护，避免畸形响应暴露内部 TypeError。
- 新增回归测试：
  - `apps/web/tests/rendered-preview-helpers.test.ts`：覆盖 cached reaction draft 一侧为空数组时仍采用缓存 draft。
  - `apps/web/tests/preview-shell-controller.test.ts`：覆盖 inventory pending 期间 iframe ref 切换时 ready 状态投递到当前 frame。
- 验证结果：
  - `pnpm --filter @chemd/web exec eslint src/features/chem-preview/lib/preview-hydration.ts src/features/preview/hooks/usePreviewShellController.ts src/features/ocr/hooks/useImageOcr.ts tests/rendered-preview-helpers.test.ts tests/preview-shell-controller.test.ts`：`exit 0`
  - `pnpm --filter @chemd/web test -- tests/rendered-preview-helpers.test.ts tests/preview-shell-controller.test.ts tests/use-chem-ocr-actions.test.tsx`：`3 files, 17 tests passed`
  - `pnpm --filter @chemd/web typecheck`：`exit 0`
  - `pnpm lint`：`exit 0`
  - `pnpm test`：`16 successful, 16 total`；其中 `@chemd/web` 为 `32 files, 108 tests passed`
  - `pnpm typecheck`：`16 successful, 16 total`
- 审查结论：
  - 以上修复只恢复审查中发现的边界语义，不扩大功能范围。
  - 新增测试覆盖原审查问题的可复现场景，避免后续复杂度治理再次改动这些行为。

### Phase 0：建立稳定门禁

目标：

- 固定当前基线
- 补齐 Python 复杂度门禁
- 统一每批次的验证方式

动作：

- 保留本文档作为复杂度治理总计划
- 为 Python 增加单独复杂度命令，例如：

```bash
ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915
```

- 后续每一批都同步更新本文件状态

验收：

- TypeScript 与 Python 都有明确复杂度统计口径
- 后续治理不再只看 `pnpm lint`

### Phase 1：Parser 与 HTML renderer

目标：

- 先拆 package 层最高热点
- 降低 web 层继续叠逻辑的压力

范围：

- `packages/parser/src/frontmatter/parse-frontmatter.ts`
- `packages/parser/src/body/parse-body.ts`
- `packages/renderer-html/src/index.ts`
- `packages/resolver/src/index.ts`

阶段验收：

- `parse-frontmatter.ts` 不再是全仓第一热点
- `renderer-html/src/index.ts` 拆出 inline / markdown / block 边界
- `resolver/src/index.ts` 的 `max-params` 明显下降
- 运行：

```bash
pnpm --filter @chemd/parser test
pnpm --filter @chemd/renderer-html test
pnpm --filter @chemd/resolver test
pnpm lint
```

### Phase 2：`apps/web` preview / OCR / route 收口

目标：

- 压缩 route 与 runtime 的职责混杂
- 形成稳定的 preview / OCR 组织模式

范围：

- `apps/web/src/app/api/chem/ocr/route.ts`
- `apps/web/src/app/api/chem/render/route.ts`
- `apps/web/src/app/api/chem/save/route.ts`
- `apps/web/src/app/api/export/docx/route.ts`
- `apps/web/src/features/preview/hooks/usePreviewShellController.ts`
- `apps/web/src/features/chem-preview/lib/preview-hydration.ts`
- `apps/web/src/features/chem-preview/lib/preview-bridge.ts`
- `apps/web/src/features/ocr/hooks/useImageOcr.ts`
- `apps/web/src/features/chem-editor/components/EmbeddedChemEditorHost.tsx`
- `apps/web/src/app/page.tsx`

阶段验收：

- route 主要只剩校验、调度、序列化
- preview 消息协议与 inventory lookup 不再写在同一个巨大 hook 内
- OCR hook 不再同时承担请求、payload 解释与 source patch 全流程
- 运行：

```bash
pnpm --filter @chemd/web test
pnpm lint
pnpm typecheck
```

### Phase 3：chem-service 迁移完成

目标：

- 消除 `app.py` 与 `chem_service/*` 双轨实现
- 让 reaction layout / rendering / svg geometry 成为明确模块

范围：

- `services/chem-service/app.py`
- `services/chem-service/chem_service/reaction_layout.py`
- `services/chem-service/chem_service/reaction_rendering.py`
- `services/chem-service/chem_service/reaction_svg_layout.py`
- 建议新增：
  - `services/chem-service/chem_service/provider_adapters.py`
  - `services/chem-service/chem_service/structure_store.py`

阶段验收：

- `F811` 消失
- `app.py` 不再是 reaction 相关几何与渲染主实现
- `PLR0913` 显著下降
- 运行：

```bash
pnpm lint:py
ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915
```

阶段状态（2026-04-10，Chunk 5 完成后）：

- `app.py` 已收口为 route / guard / CORS / request assembly，reaction RDKit 正式实现已下沉到 `chem_service/reaction_rendering.py`
- `structure_handlers.py` 已改为显式 context + request model，`kind` / `conditions` / `confidence` 不再静默降级
- `reaction_layout.py` / `reaction_rendering.py` / `reaction_svg_layout.py` 已改为 typed model + 多模块拆分
- 新增：
  - `services/chem-service/chem_service/reaction_models.py`
  - `services/chem-service/chem_service/reaction_svg_arrow.py`
  - `services/chem-service/chem_service/reaction_svg_spacing.py`
  - `services/chem-service/chem_service/reaction_svg_bounds.py`
- 验证结果：
  - `ruff check services/chem-service`：`All checks passed!`
  - `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`：`All checks passed!`
  - `cd services/chem-service && poetry run python -m unittest tests.test_reaction_rendering tests.test_reaction_ocr tests.test_routes`：`27 tests passed`
  - `cd services/chem-service && poetry run python -m unittest discover -s tests -v`：`46 tests passed`
- 剩余未完成项：
  - 复杂度热点已清零；Chunk 6 的 TS 注释债与全链路验证也已完成。

### Phase 4：测试与潜在大文件清尾

目标：

- 清理测试长文件
- 处理下一批潜在热点，防止回潮

范围：

- `packages/parser/tests/parser.test.ts`
- `packages/renderer-html/tests/renderer-html.test.ts`
- `apps/web/tests/*preview*`
- `apps/web/tests/*route*`
- `packages/render-profile/src/index.ts`
- `apps/web/src/server/chem/cas-resolver.ts`

阶段验收：

- 测试文件按行为簇拆分
- `render-profile` 与 `cas-resolver` 不再继续膨胀
- 全量运行：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm lint:py
ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915
```

## 6. 风险控制

### 6.1 不能改的行为边界

后续复杂度治理默认不改以下语义：

- `parseChemd()` 产出的 AST 结构
- 现有 diagnostic code 与严重级别语义
- render profile 的字段含义与约束规则
- `compileChemd()` 输出结构
- web route 的响应字段形态
- preview iframe 的 `postMessage` 协议
- chem-service `/structure` 的缓存语义

### 6.2 高风险改动信号

出现以下信号时，应暂停“轻量拆分”，改为专项设计：

- 需要改 shared type / shared contract
- 需要改 API 响应结构或 diagnostic code
- 需要同时修改 package 层和 web/runtime 的多段链路
- 需要在 `app.py` 与 `chem_service/*` 同时保留两套实现

## 7. 建议的首批执行顺序

如果只开第一轮治理，建议不要平均用力，按以下顺序推进：

1. `packages/parser/src/frontmatter/parse-frontmatter.ts`
2. `packages/renderer-html/src/index.ts`
3. `apps/web` preview / OCR / route 集群
4. `services/chem-service` reaction 迁移完成

原因：

- 这四块同时是当前 lint 热点、架构热点和后续功能继续堆积的主通道
- `compiler` 当前已经足够薄，不应优先动
- `render-profile` 和 `cas-resolver` 虽大，但暂时更适合作为第二轮收口对象

## 8. 当前结论

`chemd` 当前的复杂度问题并不分散，而是集中在 parser、HTML renderer、web preview/OCR/runtime，以及 chem-service reaction 渲染链。最重要的结论不是“要全仓平均重构”，而是：

**先把 package 层热点和 chem-service 迁移中间态收口，再处理 web 集成层，最后清理测试与潜在大文件。**
