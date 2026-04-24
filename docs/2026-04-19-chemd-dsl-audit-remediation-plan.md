# cheMD DSL 审计修复计划

> 日期：2026-04-19
> 来源：当前工作区只读审计结果
> 范围：DSL 核心契约、renderer/export、Web/chem-service 集成、测试与门禁

## 目标

把当前 cheMD 从“v0.3 内部语义管线基本完成”推进到“仓库级可验证完成”。

本计划优先修复影响语言正确性、跨层一致性和验证门禁的问题。大文件拆分、宽泛重构、UI 大改暂不进入本轮，避免修复过程扩大为架构重写。

## 非目标

- 不做 `resolver/src/index.ts`、`services/chem-service/app.py`、renderer 大文件拆分。
- 不重做 Web 编辑器信息架构。
- 不引入新的 DSL 大语法能力。
- 不一次性升级所有历史文档。
- 不变更已有 public API，除非该 API 当前表达错误语义。

## 成功标准

- 无效 `kind:` 不再被静默推断为有效 molecule/reaction。
- `cas` 不再污染 `smiles` 语义。
- legacy surface 诊断、quick fix、迁移统计口径一致。
- JSON/HTML/DOCX 对 `col` 和核心结构块行为一致。
- training export 能消费 canonical LNF 与 typedGraph，并具备 semantic fact links、retrieval chunks、prediction instances 输出。
- Web 不再把 kind-less `:::chemd` 当作完全正常的 canonical 编辑目标。
- 一键验证能覆盖 package tests、legacy surface 脚本测试、dev-demo 脚本测试、typecheck、Python tests 和 ruff。

## 阶段 0：建立修复基线

| 任务 | 范围 | Done Criteria | 验证 |
|------|------|---------------|------|
| 记录当前审计计划 | `docs/` | 本计划入库，后续修复按阶段执行 | 人工审阅 |
| 明确暂缓拆分策略 | 全仓库 | 后续 PR 不因文件超 300 行主动拆大文件 | 审查 diff |
| 确认当前验证阻塞 | JS 测试环境 | 记录 `pnpm test` 在当前执行环境的 turbo/vitest 阻塞 | 审计报告已记录 |

## 阶段 1：DSL 核心契约修复

目标：先修语言真相，不让错误输入产出看似正确的语义节点。

| 任务 | 范围 | Done Criteria | 验证 |
|------|------|---------------|------|
| 修复无效 `kind:` fallback | `packages/parser` | `kind: invalid` 只产生诊断，不再按 shape inference 生成正常语义节点 | `@chemd/parser` tests |
| 补 bad-case 测试 | `packages/parser/tests` | 覆盖 invalid kind、kind conflict、strict missing kind | `@chemd/parser` tests |
| 修复 `cas` 字段语义 | `packages/core`, `packages/parser`, `packages/typechecker`, exporter 如需 | `cas` 作为独立字段或被显式拒绝，不再 fallback 到 `smiles` | parser/typechecker/exporter tests |
| 统一 legacy 诊断码口径 | `parser`, `diagnostics`, `lnf`, `compiler quick-fix` | legacy block 能被统计到 migration，并能关联 convert quick fix 或脚本建议 | parser/diagnostics/lnf/compiler tests |
| 收口诊断扩展类型 | `core`/`diagnostics`/`compiler` | `quickFixes`、`facts` 等结构化字段有明确公共类型，不靠局部交叉类型传递 | typecheck |

阶段 1 不处理：

- template-expanded / migrated origin 的完整 provenance 链路。
- resolver 大文件拆分。
- step family 常量全面抽象。

## 阶段 2：Renderer 与 Export 一致性修复

目标：让渲染和训练出口不丢语义，不制造新的语义。

| 任务 | 范围 | Done Criteria | 验证 |
|------|------|---------------|------|
| 修复 DOCX `col` 丢内容 | `packages/renderer-docx` | DOCX 递归渲染 `col.children`，不再静默返回空 | renderer-docx tests |
| 明确 JSON `col` 策略 | `packages/renderer-json` | JSON 要么保留 `col` wrapper，要么显式记录扁平化策略，测试锁定行为 | renderer-json tests |
| 建跨 renderer fixture | `renderer-html/json/docx` tests | 同一包含 `col`、reaction、procedure、analysis 的 fixture 覆盖三种输出 | 相关 package tests |
| exporter 消费更多 typedGraph | `packages/exporter-training` | result/sample/molecule 的 normalized values 进入 semantic layer；`normalized_outcome_hints` 不再固定空 | exporter tests |
| 接入 canonical LNF 到 training export | `compiler`, `exporter-training` | training payload 保留 `stepSources`、`migration`、typedGraph/workflow/runtime 摘要 | compiler/exporter tests |
| retrieval/prediction 最小实现 | `exporter-training` | `retrieval_chunks`、`prediction_instances` 对基础文档非空，eligibility 可达 | exporter tests |

阶段 2 不处理：

- HTML/DOCX 共享 view model 大重构。
- 完整 training schema 大版本迁移。
- renderer 大文件拆分。

## 阶段 3：Web 与 chem-service 边界修复

目标：让产品层与 canonical DSL 合约一致，并补关键安全/稳定边界。

| 任务 | 范围 | Done Criteria | 验证 |
|------|------|---------------|------|
| 收紧 Web kind-less 行为 | `apps/web` | target selection 不再把 kind-less block 当完全正常 canonical 目标，至少提示迁移/quick fix | web tests |
| JSON export 使用 strict 或审计模式 | `apps/web/src/server/chem/json-export.ts` | export 能报告 missing kind，不默默当 canonical 通过 | web tests |
| 统一 reaction 空侧语义 | `apps/web`, `services/chem-service` | render/save/cache 对 empty reactants/products 口径一致，placeholder 显式建模 | web tests + Python tests |
| JSON export 请求边界 | `apps/web/api/export/json` | 增加 content-type、content-length/body size 限制，与 DOCX 口径接近 | web route tests |
| chem-service fetch timeout | `apps/web/src/server/chem/chem-service-client.ts` | server 代理调用有统一超时/abort 行为 | web server tests |
| SVG 注入链风险收敛 | preview/hydration | 明确 sanitize 或只允许可信 SVG 来源；至少补测试覆盖危险 payload 不越界 | web tests |

阶段 3 不处理：

- 重新设计 preview iframe bridge。
- 大规模 DTO 重构。
- Web 页面视觉调整。

## 阶段 4：验证门禁与文档收尾

目标：让完成度声明有可重复验证证据。

| 任务 | 范围 | Done Criteria | 验证 |
|------|------|---------------|------|
| 修正 `.gitignore` | root | 不再默认忽略 `tests`、`*.test.ts(x)`、`docs`、必要 `.trellis/spec` 资产 | `git status` 可见新增测试/文档 |
| 纳入脚本测试 | root scripts/CI | `legacy-surface-tools.test.mjs` 和 `dev-demo.test.mjs` 进入一键门禁 | `node --test` + CI 配置审查 |
| 建 DSL golden corpus | fixtures/tests | 覆盖 canonical, legacy migration, explicit/lowered steps, renderer/export/runtime | root/package tests |
| 收敛 Python CI 口径 | `services/chem-service`, CI | Poetry/requirements/Python 版本策略一致 | CI 配置审查 + Python tests |
| 删除陈旧 alias | `tsconfig.base.json` | 不存在的 `@chemd/renderer-svg` 不再误导解析 | typecheck |
| 更新 README / checklist | `README*`, `docs` | 文档准确说明 explicit step/event、quick fix 未完成项、当前完成边界 | 人工审阅 |

## 推荐执行顺序

1. 阶段 1：先修 parser/core 语义正确性。
2. 阶段 2：修 renderer/export，因为依赖阶段 1 的语义稳定性。
3. 阶段 3：修 Web/服务边界，让产品层消费稳定合约。
4. 阶段 4：补门禁和文档，最后再声明完成度。

## 当前执行状态

- 阶段 1 已完成：无效 `kind:` 不再静默 fallback，`cas` 已独立贯通到 AST/typechecker/export，legacy surface 诊断带结构化 facts/quick fixes。
- 阶段 2 已完成：DOCX 不再丢 `col.children`，JSON 显式记录 `col` 扁平化策略，training export 接入 canonical LNF v0.5、typed normalized values、semantic fact links、retrieval chunks 和 prediction instances；v0.3/v0.4 LNF 保留为迁移兼容字段。
- 2026-04-20 补充：training export 已基于现有 `reaction/result/analysis/sample/markdown` 字段生成真实 `semantic_layer.links`，并补齐 `document_summary`、`analysis_notes`、`sample_notes` retrieval chunks。该路线服务本地实验记录理解，不引入 GitHub/PR/协作机器人。
- 阶段 3 已完成：Web target selection 改为显式 `kind`，JSON export 使用 strict chemd kind 并补请求边界，chem-service fetch 增加 timeout，preview SVG hydration 增加危险 payload 防护。
- 阶段 4 部分完成：`.gitignore` 已放开 docs/tests 和 `.trellis/spec`，脚本测试已纳入根 `test`，失效 `@chemd/renderer-svg` alias 已删除。
- finish-work 补充完成：跨层契约已同步到 `.trellis/spec/compiler/backend/language-v03-contracts.md` 与 `.trellis/spec/web/frontend/type-safety.md`，包含 signatures、payload fields、error matrix、Good/Base/Bad cases 和 required tests。
- 阶段 4 暂缓项：DSL golden corpus、Python CI 口径收敛、README/checklist 系统更新未展开，避免扩大为文档与 CI 重构。

当前验证证据：

- `pnpm typecheck`：通过，17/17 packages。
- `pnpm test`：通过，17/17 packages + `test:scripts` 11/11。
- `pnpm build`：通过，17/17 packages；仍有既有 Next ESLint plugin warning 与 Turbo no-output warning。
- `pnpm lint`：通过。
- `git diff --check`：无空白错误；仅有 Windows LF/CRLF 提示。

## 每阶段验收命令

阶段 1：

```bash
pnpm --filter @chemd/parser test
pnpm --filter @chemd/typechecker test
pnpm --filter @chemd/compiler test
pnpm --filter @chemd/lnf test
node node_modules\turbo\bin\turbo run typecheck
```

阶段 2：

```bash
pnpm --filter @chemd/renderer-json test
pnpm --filter @chemd/renderer-html test
pnpm --filter @chemd/renderer-docx test
pnpm --filter @chemd/exporter-training test
pnpm --filter @chemd/compiler test
node node_modules\turbo\bin\turbo run typecheck
```

阶段 3：

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/web typecheck
poetry run python -m unittest discover -s tests -v
poetry run ruff check app.py chem_service tests
```

阶段 4：

```bash
node --test scripts\legacy-surface-tools.test.mjs
node --test scripts\dev-demo.test.mjs
pnpm test
pnpm typecheck
poetry run python -m unittest discover -s services/chem-service/tests -v
```

如果当前环境仍出现 turbo/vitest `spawn EPERM` 或 pnpm shim 解析问题，应记录为环境阻塞，并用可执行的直接命令补充局部验证。

## 风险与处理

| 风险 | 影响 | 处理 |
|------|------|------|
| `cas` 独立字段会影响多个 schema | 中 | 先做最小字段贯通，不扩大为完整 identifier 系统 |
| legacy 诊断码变更会影响现有测试 | 中 | 保留兼容诊断或做映射，不一次性删除旧码 |
| strict Web 行为影响旧文档编辑 | 中 | 先 warning/quick-fix，再决定是否 hard fail |
| exporter v0.4 接入牵动训练 schema | 中 | 先以 optional 字段接入，不破坏 v0.1 payload |
| `.gitignore` 放开后暴露大量未跟踪文件 | 高 | 分步调整，只放开项目应入库的 tests/docs/spec |

## 暂缓技术债

以下问题确认存在，但本轮只记录，不主动修：

- `resolver/src/index.ts`、`app.py`、renderer 大文件拆分。
- HTML/DOCX 共享格式化中间层。
- step family/list field 常量全面抽象。
- Web DTO mapper 大规模重构。
- preview bridge 架构重写。
