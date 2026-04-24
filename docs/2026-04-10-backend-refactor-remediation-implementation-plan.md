# Chemd Backend Refactor Remediation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有 HTTP contract、结构缓存语义、CAS 解析结果语义和 reaction 渲染语义的前提下，系统性降低 `apps/web` 后端 route/server 与 `services/chem-service` 的复杂度、冗余度和注释债。

**Architecture:** 先把 Next.js route 收口成“parse / call / serialize”薄层，把重复的协议解析、fallback 流程、错误映射下沉到 `apps/web/src/server/chem`。再把 `cas-resolver` 拆成分类、PubChem client、缓存/策略三层，并完成 `chem-service` 迁移，令 `app.py` 只保留 Flask route 与装配。所有复杂协议、fallback、缓存和几何规则在对应模块内补齐简体中文注释，但注释不能替代边界拆分。

**Tech Stack:** Next.js 15 Route Handlers, TypeScript strict, Vitest, ESLint, Flask 3, Python 3.14, Ruff, unittest, RDKit

---

## Scope

- 后端 TypeScript 范围：
  - `apps/web/src/app/api/chem/**`
  - `apps/web/src/app/api/export/**`
  - `apps/web/src/server/chem/**`
- Python service 范围：
  - `services/chem-service/app.py`
  - `services/chem-service/chem_service/**`
- 本计划不包含：
  - 前端 hook / component / preview runtime 的实现改动
  - `packages/*` 的 parser / renderer / resolver 热点
  - 测试文件的大规模重构

## Non-Negotiable Invariants

- 不改以下对外语义：
  - `apps/web` route 的现有响应字段形态
  - `CAS` 解析、`PubChem` fallback 顺序与错误码语义
  - `chem-service /structure` 的缓存 key 与 TTL 语义
  - reaction 渲染的 `data-*` 协议字段
  - OCR placeholder/fallback 的高层行为
- 不允许为了过 lint：
  - 新增只转发参数的空 helper
  - 用 mega options 对象掩盖职责混杂
  - 在 `app.py` 与 `chem_service/*` 长期保留双份正式实现

## Execution Notes

- 本计划以 **当前工作区状态** 为执行基线，不以 `HEAD` 或 clean tree 为前提。
- `apps/web/src/app/api/chem/inventory/route.ts`、`apps/web/src/app/api/export/json/route.ts`、`apps/web/src/server/chem/json-export.ts`、`apps/web/src/server/chem/lab-storage-client.ts` 与 `services/chem-service/chem_service/**` 当前已存在本地未提交实现；执行时按“在现有工作上继续收口”处理，不按“从零创建”假设推进。
- 注释整改必须跟随对应逻辑拆分一起完成；禁止把“补注释”单独作为降低复杂度的替代动作。

## Current Problem Clusters

1. `apps/web/src/app/api/chem/ocr/route.ts`、`render/route.ts`、`save/route.ts`、`reaction/ocr/route.ts`、`export/docx/route.ts` 已明显不是薄 route。
2. `apps/web/src/server/chem/cas-resolver.ts` 把 CAS 分类、PubChem 协议、缓存、并发去重和 fallback 策略堆在一个文件里。
3. `apps/web` route 间存在重复的请求解析、数组校验、CAS hydration、错误映射与响应拼装。
4. `services/chem-service/app.py` 仍保留大量 compatibility shim，和 `chem_service/*` 形成迁移中间态。
5. `services/chem-service/chem_service/reaction_svg_layout.py` 几何逻辑过重，且内部协议仍大量依赖 `dict[str, Any]`、魔法数字和字符串替换。
6. 剩余注释债集中在 block target 选择、lab storage fallback、JSON export 静默回退和 session guard 安全约束。

## Target File Map

### TypeScript Existing Files

- Modify: `apps/web/src/app/api/chem/ocr/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/ocr/route.ts`
- Modify: `apps/web/src/app/api/chem/render/route.ts`
- Modify: `apps/web/src/app/api/chem/save/route.ts`
- Modify: `apps/web/src/app/api/chem/inventory/route.ts`
- Modify: `apps/web/src/app/api/chem/normalize/route.ts`
- Modify: `apps/web/src/app/api/export/docx/route.ts`
- Modify: `apps/web/src/app/api/export/json/route.ts`
- Modify: `apps/web/src/server/chem/cas-resolver.ts`
- Modify: `apps/web/src/server/chem/chem-service-client.ts`
- Modify: `apps/web/src/server/chem/json-export.ts`
- Modify: `apps/web/src/server/chem/lab-storage-client.ts`
- Modify: `apps/web/src/server/chem/session-guard.ts`
- Modify: `apps/web/src/server/chem/structure-store.ts`
- Modify: `apps/web/src/server/chem/dto.ts`

### TypeScript Planned New Files

- Create: `apps/web/src/server/chem/request-parsers.ts`
  - 收口 `json/form-data` 解析、字符串数组校验、可选字段 trim、统一 bad request message。
- Create: `apps/web/src/server/chem/route-responses.ts`
  - 收口 `NextResponse.json` 的错误 envelope、busy/retry、fallback/placeholder 响应。
- Create: `apps/web/src/server/chem/ocr-workflow.ts`
  - 收口 reaction-first / molecule-fallback 的 OCR 工作流。
- Create: `apps/web/src/server/chem/reaction-target.ts`
  - 收口 `blockId / fallbackBlockId / moleculeBlockId / reactionBlockId` 选择规则。
- Create: `apps/web/src/server/chem/pubchem-client.ts`
  - 收口 URL 构造、fetch、payload 解析、timeout。
- Create: `apps/web/src/server/chem/cas-classifier.ts`
  - 收口 checksum、CAS 格式分类。
- Create: `apps/web/src/server/chem/cas-resolution-cache.ts`
  - 收口 cache / inflight promise / metadata lookup strategy。
- Create: `apps/web/src/server/chem/inventory-service.ts`
  - 收口 inventory item 组装、显示名 fallback、请求级去重。
- Create: `apps/web/src/server/chem/docx-export-service.ts`
  - 收口 DOCX 并发槽位、临时文件清理与导出执行。
- Create: `apps/web/src/server/chem/render-save-service.ts`
  - 收口 molecule/reaction render/save 的共有编排、hydration 与响应组装。
- Create: `apps/web/src/server/chem/chem-service-error.ts`
  - 统一 `chem-service` 下游错误的 typed surface。

### Python Existing Files

- Modify: `services/chem-service/app.py`
- Modify: `services/chem-service/chem_service/reaction_layout.py`
- Modify: `services/chem-service/chem_service/molecule_rendering.py`
- Modify: `services/chem-service/chem_service/reaction_rendering.py`
- Modify: `services/chem-service/chem_service/reaction_svg_layout.py`
- Modify: `services/chem-service/chem_service/remote_provider.py`
- Modify: `services/chem-service/chem_service/structure_store.py`
- Modify: `services/chem-service/chem_service/structure_handlers.py`
- Modify: `services/chem-service/chem_service/molecule_ocr.py`
- Modify: `services/chem-service/chem_service/reaction_ocr.py`
- Modify: `services/chem-service/README.md`

### Python Planned New Files

- Create: `services/chem-service/chem_service/provider_registry.py`
  - 收口 molecule/reaction provider 配置、health 判定与 dispatch。
- Create: `services/chem-service/chem_service/reaction_models.py`
  - 定义 reaction layout/render config/annotation geometry 的 dataclass。
- Create: `services/chem-service/chem_service/reaction_svg_arrow.py`
  - 收口箭头识别、箭头重绘路径。
- Create: `services/chem-service/chem_service/reaction_svg_spacing.py`
  - 收口加号识别、反应物扩距、产物平移。
- Create: `services/chem-service/chem_service/reaction_svg_bounds.py`
  - 收口水平边界采集、tight crop、宽度扩展。
- Create: `services/chem-service/chem_service/structure_models.py`
  - 定义结构写入请求对象，替代 `_save_cache` 的长参数列表。

## Chunk 1: Lock Contracts And Baseline

### Task 1: 固定本轮整改边界与不变量

**Files:**
- Modify: `docs/2026-04-10-chemd-lint-complexity-refactor-plan.md`
- Modify: `docs/2026-04-10-backend-refactor-remediation-implementation-plan.md`

- [x] 把本计划视为后端整改执行来源，后续每完成一个 chunk 都同步更新状态。
- [x] 在文档里明确记录：不改 HTTP 响应字段、`CAS` 语义、`/structure` 缓存语义、reaction `data-*` 协议。
- [x] 给后续执行者标注：注释整改必须跟随对应逻辑拆分一起做，不能单独“刷注释”。

### Task 2: 记录当前验证基线

**Files:**
- Modify: `docs/2026-04-10-backend-refactor-remediation-implementation-plan.md`

- [x] 记录当前 TypeScript 局部 lint 告警：
  - `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`
- [x] 记录当前 Python 复杂度基线：
  - `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
- [x] 记录当前 Python 基础规范基线：
  - `ruff check services/chem-service`
- [x] 记录本轮必须守住的回归测试清单：
  - `apps/web/tests/chem-ocr-route.test.ts`
  - `apps/web/tests/reaction-ocr-route.test.ts`
  - `apps/web/tests/chem-render-route.test.ts`
  - `apps/web/tests/chem-save-route.test.ts`
  - `apps/web/tests/chem-inventory-route.test.ts`
  - `apps/web/tests/cas-resolver.test.ts`
  - `apps/web/tests/lab-storage-client.test.ts`
  - `apps/web/tests/json-export.test.ts`
  - `apps/web/tests/session-token.test.ts`
  - `apps/web/tests/structure-store.test.ts`
  - `apps/web/tests/docx-route.test.ts`
  - `services/chem-service/tests/test_app.py`
  - `services/chem-service/tests/test_molecule_rendering.py`
  - `services/chem-service/tests/test_routes.py`
  - `services/chem-service/tests/test_reaction_rendering.py`
  - `services/chem-service/tests/test_reaction_ocr.py`
  - `services/chem-service/tests/test_structure.py`

#### Captured Baseline (2026-04-10, current workspace)

- TypeScript 局部 lint：
  - 命令：`pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`
  - 结果：`9 error`
  - 文件分布：
    - `apps/web/src/app/api/chem/ocr/route.ts`: `max-statements`, `complexity`
    - `apps/web/src/app/api/chem/reaction/ocr/route.ts`: `complexity`
    - `apps/web/src/app/api/chem/render/route.ts`: `max-statements`, `complexity`
    - `apps/web/src/app/api/chem/save/route.ts`: `max-statements`, `complexity`
    - `apps/web/src/app/api/export/docx/route.ts`: `max-statements`, `complexity`
- Python 复杂度基线：
  - 命令：`ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
  - 结果：`17 error`
  - 主要分布：
    - `services/chem-service/app.py`: `6`
    - `services/chem-service/chem_service/reaction_svg_layout.py`: `3`
    - `services/chem-service/chem_service/reaction_rendering.py`: `2`
    - `services/chem-service/chem_service/molecule_ocr.py`: `1`
    - `services/chem-service/chem_service/reaction_layout.py`: `1`
    - `services/chem-service/chem_service/reaction_ocr.py`: `1`
    - `services/chem-service/chem_service/remote_provider.py`: `1`
    - `services/chem-service/chem_service/structure_handlers.py`: `1`
    - `services/chem-service/chem_service/structure_store.py`: `1`
- Python 基础 Ruff 基线：
  - 命令：`ruff check services/chem-service`
  - 结果：`All checks passed!`
- 执行注意：
  - `poetry run ...` 相关 `unittest` 命令必须在 `services/chem-service` 目录下执行；直接在仓库根目录运行会因为找不到 `pyproject.toml` 失败。

## Chunk 2: Tighten Next Route Boundaries

### Task 3: 建立共享请求解析与响应构建层

**Files:**
- Create: `apps/web/src/server/chem/request-parsers.ts`
- Create: `apps/web/src/server/chem/route-responses.ts`
- Create: `apps/web/src/server/chem/chem-service-error.ts`
- Modify: `apps/web/src/server/chem/dto.ts`

- [ ] 在 `request-parsers.ts` 中收口以下公共解析逻辑：
- [x] 在 `request-parsers.ts` 中收口以下公共解析逻辑：
  - `request.json().catch(() => null)` 的统一封装
  - `FormData` 文件项读取
  - `string[]`、`optional string[]`、非空字符串、可选字符串 trim
  - request body 为 object / 非 array 的统一校验
- [x] 在 `route-responses.ts` 中收口以下公共响应逻辑：
  - `400 / 413 / 415 / 422 / 502 / 503` 错误 envelope
  - `Retry-After` busy 响应
  - molecule loading placeholder 响应
  - OCR failed / placeholder failed 响应
- [x] 在 `chem-service-error.ts` 中定义 route 可识别的 typed error：
  - `status`
  - `message`
  - `code`
  - 仅在下游确实提供时保留附加语义
- [x] 修改 `dto.ts`，为新 helper 暴露稳定的请求/响应类型，不要把 route 层继续绑在匿名对象上。

### Task 4: 拆分 render/save 两条高度重复的 route

**Files:**
- Modify: `apps/web/src/app/api/chem/render/route.ts`
- Modify: `apps/web/src/app/api/chem/save/route.ts`
- Create: `apps/web/src/server/chem/reaction-target.ts`（如 render/save 共用 block 选择）
- Create: `apps/web/src/server/chem/render-save-service.ts`

- [x] 抽出 molecule/reaction 请求解析 helper，统一数组校验与可选字段 trim 规则。
- [x] 抽出 `resolveChemicalNotation` / `resolveChemicalNotationList` 的调用编排，避免 route 中直接写 hydration 分支。
- [x] 抽出 reaction 响应拼装逻辑，统一：
  - `reaction`
  - `normalized_conditions`
  - CAS 解析错误直通
  - 非 CAS 错误如何保留 `status`
- [x] 抽出 molecule 响应拼装逻辑，统一：
  - 成功态
  - `chem-service` 不可用时的 loading placeholder
  - `warnings` 语义
- [x] 让 `render/route.ts` 与 `save/route.ts` 最终只保留：
  - auth / request parse
  - 调 domain helper
  - serialize response

### Task 5: 拆分 OCR 与 reaction OCR 路由

**Files:**
- Modify: `apps/web/src/app/api/chem/ocr/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/ocr/route.ts`
- Create: `apps/web/src/server/chem/ocr-workflow.ts`
- Create: `apps/web/src/server/chem/reaction-target.ts`

- [x] 在 `ocr-workflow.ts` 中收口以下流程：
  - `File -> base64`
  - 图片 mime/type/size 校验
  - reaction-first / molecule-fallback 工作流
  - placeholder 判定
  - saveStructureRecord 写入条件
  - fallback warning 拼接策略
- [x] 在 `reaction-target.ts` 中显式建模 block target 规则：
  - `blockId`
  - `fallbackBlockId`
  - `moleculeBlockId`
  - `reactionBlockId`
  - `update_existing / create_new`
- [x] 为 block target 规则补中文注释，明确“谁优先、何时回退、何时创建新 block”。
- [x] 让 `reaction/ocr/route.ts` 与 `ocr/route.ts` 共享图片校验与 placeholder 判定，不再复制。

### Task 6: 收口 inventory / normalize / export routes

**Files:**
- Modify: `apps/web/src/app/api/chem/inventory/route.ts`
- Modify: `apps/web/src/app/api/chem/normalize/route.ts`
- Modify: `apps/web/src/app/api/export/json/route.ts`
- Modify: `apps/web/src/app/api/export/docx/route.ts`
- Create: `apps/web/src/server/chem/inventory-service.ts`
- Create: `apps/web/src/server/chem/docx-export-service.ts`

- [x] 把 inventory route 中的显示名 fallback、PubChem metadata 拼装、请求级去重下沉到 `inventory-service.ts`。
- [x] 让 normalize route 使用共享 parser/response helper，不再手写匿名 body 校验。
- [x] 把 JSON export 中的 CAS 静默回退与 `normalized_conditions` 补写规则明确下沉到 `json-export.ts` 内部 helper。
- [x] 把 DOCX route 中的并发槽位、临时文件清理、stream 清理下沉到 `docx-export-service.ts`。
- [x] 为 `docx-export-service.ts` 和 `json-export.ts` 补协议注释，说明 fallback 与资源清理约束。

### Task 7: 验证 Chunk 2

**Files:**
- Test: `apps/web/tests/chem-ocr-route.test.ts`
- Test: `apps/web/tests/reaction-ocr-route.test.ts`
- Test: `apps/web/tests/chem-render-route.test.ts`
- Test: `apps/web/tests/chem-save-route.test.ts`
- Test: `apps/web/tests/chem-inventory-route.test.ts`
- Test: `apps/web/tests/json-export.test.ts`
- Test: `apps/web/tests/docx-route.test.ts`

- [x] 先跑定向 web 测试：
  - `pnpm --filter @chemd/web test -- chem-ocr-route.test.ts reaction-ocr-route.test.ts chem-render-route.test.ts chem-save-route.test.ts chem-inventory-route.test.ts json-export.test.ts docx-route.test.ts`
- [x] 再跑局部 lint：
  - `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`
- [x] 再跑 web typecheck：
  - `pnpm --filter @chemd/web typecheck`
- [x] 若 route 复杂度仍超阈值，继续拆 helper，不允许用注释掩盖复杂度。

#### Chunk 2 Verification (2026-04-10)

- `pnpm --filter @chemd/web test -- chem-ocr-route.test.ts reaction-ocr-route.test.ts chem-render-route.test.ts chem-save-route.test.ts chem-inventory-route.test.ts json-export.test.ts docx-route.test.ts`
  - 结果：`7 files, 29 tests passed`
- `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`
  - 结果：`exit 0`
- `pnpm --filter @chemd/web typecheck`
  - 结果：`exit 0`

## Chunk 3: Decompose CAS Resolver Into Stable Layers

### Task 8: 抽出 CAS 分类与 PubChem client

**Files:**
- Create: `apps/web/src/server/chem/cas-classifier.ts`
- Create: `apps/web/src/server/chem/pubchem-client.ts`
- Modify: `apps/web/src/server/chem/cas-resolver.ts`

- [x] 在 `cas-classifier.ts` 中收口：
  - `CAS_NUMBER_PATTERN`
  - `CAS_LIKE_PATTERN`
  - checksum 计算
  - `classifyCasNumber`
- [x] 在 `pubchem-client.ts` 中收口：
  - URL builder
  - timeout signal
  - payload fetch
  - payload parser：SMILES、synonyms、CID
- [x] 给 `pubchem-client.ts` 补中文注释，明确：
  - 为什么要区分直查和 CID fallback
  - 为什么 `404` 与其他失败语义不同

### Task 9: 抽出缓存与 resolution strategy

**Files:**
- Create: `apps/web/src/server/chem/cas-resolution-cache.ts`
- Modify: `apps/web/src/server/chem/cas-resolver.ts`

- [x] 在 `cas-resolution-cache.ts` 中收口：
  - `lookupCache`
  - `inflightLookupCache`
  - notation metadata cache
  - inflight metadata cache
- [x] 在 resolver 中保留统一入口，但把以下逻辑拆掉：
  - cache/inflight 模式
  - metadata fallback 顺序
  - PubChem 结果到 domain 语义的转换
- [x] 明确把非 CAS、无效 CAS、CAS 未命中、PubChem 失败四种分支保留为独立语义，不允许在拆分时揉成一个错误码。

### Task 10: 清理 resolver 入口并补注释

**Files:**
- Modify: `apps/web/src/server/chem/cas-resolver.ts`

- [x] 把 `cas-resolver.ts` 收口成薄 facade：
  - re-export 分类结果
  - re-export公开查询函数
  - 仅保留最小的 domain-level orchestration
- [x] 为以下规则补注释：
  - cache 与 inflight promise 并存的原因
  - metadata fallback 顺序为何固定
  - inventory 展示为何对 invalid CAS 返回空 metadata 而不是抛错

### Task 11: 验证 Chunk 3

**Files:**
- Test: `apps/web/tests/cas-resolver.test.ts`
- Test: `apps/web/tests/chem-inventory-route.test.ts`
- Test: `apps/web/tests/json-export.test.ts`

- [x] 跑定向测试：
  - `pnpm --filter @chemd/web test -- cas-resolver.test.ts chem-inventory-route.test.ts json-export.test.ts`
- [x] 跑局部 lint：
  - `pnpm exec eslint apps/web/src/server/chem apps/web/src/app/api/chem apps/web/src/app/api/export --ext .ts,.tsx`
- [x] 确认 `cas-resolver.ts` 文件长度和复杂度显著下降，再进入下一 chunk。

#### Chunk 3 Verification (2026-04-10)

- `pnpm --filter @chemd/web test -- cas-resolver.test.ts chem-inventory-route.test.ts json-export.test.ts`
  - 结果：`3 files, 13 tests passed`
- `pnpm exec eslint apps/web/src/server/chem apps/web/src/app/api/chem apps/web/src/app/api/export --ext .ts,.tsx`
  - 结果：`exit 0`
- `pnpm --filter @chemd/web typecheck`
  - 结果：`exit 0`

## Chunk 4: Finish Chem-Service Migration

### Task 12: 用 provider registry 消除重复 dispatch

**Files:**
- Create: `services/chem-service/chem_service/provider_registry.py`
- Modify: `services/chem-service/app.py`
- Modify: `services/chem-service/chem_service/molecule_ocr.py`
- Modify: `services/chem-service/chem_service/reaction_ocr.py`

- [x] 把 molecule/reaction provider 配置读法收口成 registry 或 dataclass。
- [x] 把 `healthz()` 的 provider readiness 判定改成复用 registry，不再重复 if/elif 链。
- [x] 把 `app.py` 中 `_run_molecule_ocr_with_*` / `_run_reaction_ocr_with_*` 的重复配置分发下沉。
- [x] 保留 route contract，不改变 `/healthz` 的高层字段语义。

#### Chunk 4 Interim Status (2026-04-10)

- `ruff check services/chem-service`
  - 结果：`All checks passed!`
- `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
  - 结果：从 `17 error` 降到 `13 error`
- `cd services/chem-service && poetry run python -m unittest tests.test_routes tests.test_reaction_ocr tests.test_structure tests.test_molecule_rendering`
  - 结果：`30 tests passed`

### Task 13: 把 app.py 收口为 route + assembly

**Files:**
- Modify: `services/chem-service/app.py`
- Modify: `services/chem-service/chem_service/remote_provider.py`
- Modify: `services/chem-service/chem_service/structure_handlers.py`
- Modify: `services/chem-service/chem_service/structure_store.py`

- [x] 删掉 `app.py` 中不再需要的 compatibility wrapper。
- [x] 把 `request` 相关适配、`jsonify` 适配、CORS、before_request guard 保留在 `app.py`。
- [x] 把非 route helper 的正式实现全部落回 `chem_service/*`。
- [x] 仅在测试确有必要时，保留极少数稳定 seam；若保留，必须在代码注释中说明 seam 的边界和退场条件。

### Task 14: 收口结构写入与请求对象

**Files:**
- Create: `services/chem-service/chem_service/structure_models.py`
- Modify: `services/chem-service/chem_service/structure_store.py`
- Modify: `services/chem-service/chem_service/structure_handlers.py`
- Modify: `services/chem-service/app.py`

- [x] 用 dataclass 或 typed object 替代 `_save_cache` 的长参数列表。
- [x] 把 reaction / molecule 写入请求对象统一成显式模型。
- [x] 统一 `conditions`、`kind`、`confidence` 的校验语义，不再出现静默降级。
- [x] 让 `structure_handlers.py` 不再逐个搬运所有字段。

### Task 15: 收窄异常处理与回退语义

**Files:**
- Modify: `services/chem-service/app.py`
- Modify: `services/chem-service/chem_service/molecule_rendering.py`
- Modify: `services/chem-service/chem_service/reaction_rendering.py`
- Modify: `services/chem-service/chem_service/remote_provider.py`

- [x] 把 `except Exception: return None` 改成更窄的异常捕获或统一 error->warning 转换。
- [x] 明确区分：
  - provider 配置缺失
  - RDKit 不可用
  - payload 非法
  - 渲染失败
- [x] 对 route 仍返回 fallback 的场景，保留当前行为，但把原因留在 warning 或日志可诊断 surface。

### Task 16: 验证 Chunk 4

**Files:**
- Test: `services/chem-service/tests/test_routes.py`
- Test: `services/chem-service/tests/test_reaction_ocr.py`
- Test: `services/chem-service/tests/test_structure.py`
- Test: `services/chem-service/tests/test_app.py`
- Test: `services/chem-service/tests/test_molecule_rendering.py`

- [x] 跑定向单测：
  - `cd services/chem-service && poetry run python -m unittest tests/test_routes.py`
  - `cd services/chem-service && poetry run python -m unittest tests/test_reaction_ocr.py`
  - `cd services/chem-service && poetry run python -m unittest tests/test_structure.py`
  - `cd services/chem-service && poetry run python -m unittest tests/test_app.py`
  - `cd services/chem-service && poetry run python -m unittest tests/test_molecule_rendering.py`
- [x] 跑全量 chem-service 单测：
  - `cd services/chem-service && poetry run python -m unittest discover -s tests -v`
- [x] 跑基础 Ruff：
  - `ruff check services/chem-service`
- [x] 跑复杂度 Ruff：
  - `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`

#### Chunk 4 Verification (2026-04-10)

- `ruff check services/chem-service`
  - 结果：`All checks passed!`
- `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
  - 结果：从 `13 error` 进一步降到 `8 error`
  - 剩余热点：
    - `services/chem-service/chem_service/molecule_ocr.py`: `1`
    - `services/chem-service/chem_service/reaction_layout.py`: `1`
    - `services/chem-service/chem_service/reaction_ocr.py`: `1`
    - `services/chem-service/chem_service/reaction_rendering.py`: `2`
    - `services/chem-service/chem_service/reaction_svg_layout.py`: `3`
- `cd services/chem-service && poetry run python -m unittest tests.test_routes tests.test_reaction_ocr tests.test_structure tests.test_app tests.test_molecule_rendering`
  - 结果：`33 tests passed`
- `cd services/chem-service && poetry run python -m unittest discover -s tests -v`
  - 结果：`46 tests passed`
- 本阶段完成结果：
  - `app.py` 已收口为 route、guard、CORS、最小 request 适配和稳定测试 seam。
  - `/structure` 对 `kind`、`conditions`、`confidence` 不再静默降级，并新增回归测试覆盖。
  - 剩余复杂度热点已全部收敛到 Chunk 5 的 reaction geometry / typed model 范围。

## Chunk 5: Split Reaction Geometry And Typed Models

### Task 17: 为 reaction 布局与 SVG 几何建立显式模型

**Files:**
- Create: `services/chem-service/chem_service/reaction_models.py`
- Modify: `services/chem-service/chem_service/reaction_layout.py`
- Modify: `services/chem-service/chem_service/reaction_rendering.py`
- Modify: `services/chem-service/chem_service/reaction_svg_layout.py`

- [x] 用 dataclass 替代 `dict[str, Any]` 布局协议：
  - annotation lines
  - canvas size
  - arrow geometry
  - rendered arrow length
  - products x / content y
- [x] 让 `reaction_rendering.py` 与 `app.py` 通过 typed model 读取布局结果，不再靠字符串 key。
- [x] 把硬编码阈值收口到常量或模型字段，禁止把关键几何阈值继续散在公式里。

#### Chunk 5 Initial Status (2026-04-10)

- 新增 `services/chem-service/chem_service/reaction_models.py`
  - `ReactionRenderConfig`
  - `ReactionCanvasLayout`
  - `ReactionRenderInput`
- `reaction_layout.py` 已改为返回 typed layout model，不再向 `reaction_rendering.py` 暴露匿名 `dict[str, Any]`
- `reaction_rendering.py` 已改为通过 typed model 读取：
  - annotation lines
  - canvas size
  - rendered arrow length
  - arrow 起点 / 中点
  - products x / content y
- `reaction_rendering.py` 的 fallback/payload 入口已改为显式 typed input/config，不再靠长参数列表传递 reaction render 配置
- 验证：
  - `ruff check services/chem-service`
    - 结果：`All checks passed!`
  - `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
    - 结果：从 `8 error` 进一步降到 `5 error`
  - `cd services/chem-service && poetry run python -m unittest tests.test_reaction_rendering tests.test_routes`
    - 结果：`22 tests passed`
  - `cd services/chem-service && poetry run python -m unittest discover -s tests -v`
    - 结果：`46 tests passed`

### Task 18: 拆分 reaction_svg_layout 总控函数

**Files:**
- Create: `services/chem-service/chem_service/reaction_svg_arrow.py`
- Create: `services/chem-service/chem_service/reaction_svg_spacing.py`
- Create: `services/chem-service/chem_service/reaction_svg_bounds.py`
- Modify: `services/chem-service/chem_service/reaction_svg_layout.py`

- [x] 抽出箭头识别与重绘：
  - `_find_reaction_arrow_shaft`
  - `_find_reaction_arrow_head`
  - `_render_reaction_arrow_paths`
- [x] 抽出加号识别与扩距：
  - `_collect_reaction_plus_candidates`
  - `_match_reaction_plus_candidates`
  - `_expand_reactant_spacing`
  - `_translate_product_side_paths`
- [x] 抽出边界收紧与画布扩展：
  - `_collect_svg_horizontal_bounds`
  - `_tighten_reaction_svg_horizontal_bounds`
  - `_expand_svg_width`
- [x] 让 `reaction_svg_layout.py` 只保留 orchestrator 和跨模块 glue code。

### Task 19: 补齐几何与协议注释

**Files:**
- Modify: `services/chem-service/chem_service/reaction_layout.py`
- Modify: `services/chem-service/chem_service/reaction_svg_layout.py`
- Modify: `services/chem-service/chem_service/reaction_svg_arrow.py`
- Modify: `services/chem-service/chem_service/reaction_svg_spacing.py`
- Modify: `services/chem-service/chem_service/reaction_svg_bounds.py`

- [x] 对以下场景补注释：
  - 条件上下分层规则
  - 箭头最短长度为何必须容纳文字块
  - 加号只在箭头左侧识别的原因
  - 水平裁剪为何不改高度
  - `data-*` 协议字段的读取方与约束
- [x] 删除任何“教学腔”或复述命名的注释。

### Task 20: 验证 Chunk 5

**Files:**
- Test: `services/chem-service/tests/test_reaction_rendering.py`
- Test: `services/chem-service/tests/test_routes.py`

- [x] 跑 reaction 渲染定向测试：
  - `cd services/chem-service && poetry run python -m unittest tests/test_reaction_rendering.py`
- [x] 跑路由回归：
  - `cd services/chem-service && poetry run python -m unittest tests/test_routes.py`
- [x] 跑 Ruff：
  - `ruff check services/chem-service`
  - `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`

#### Chunk 5 Verification (2026-04-10)

- 新增 `services/chem-service/chem_service/reaction_svg_arrow.py`
- 新增 `services/chem-service/chem_service/reaction_svg_spacing.py`
- 新增 `services/chem-service/chem_service/reaction_svg_bounds.py`
- `reaction_svg_layout.py` 已收口为 orchestrator，箭头 / 扩距 / bounds helper 分别下沉到独立模块。
- `molecule_ocr.py` / `reaction_ocr.py` 的 provider request 已改为显式 request model。
- `ruff check services/chem-service`
  - 结果：`All checks passed!`
- `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
  - 结果：`All checks passed!`
- `cd services/chem-service && poetry run python -m unittest tests.test_reaction_rendering tests.test_reaction_ocr tests.test_routes`
  - 结果：`27 tests passed`
- `cd services/chem-service && poetry run python -m unittest discover -s tests -v`
  - 结果：`46 tests passed`

## Chunk 6: Finish Remaining Comment Debt And Final Verification

### Task 21: 补完剩余高价值注释债

**Files:**
- Modify: `apps/web/src/server/chem/lab-storage-client.ts`
- Modify: `apps/web/src/server/chem/json-export.ts`
- Modify: `apps/web/src/server/chem/session-guard.ts`
- Modify: `apps/web/src/app/api/chem/ocr/route.ts`

- [x] 为 `lab-storage-client.ts` 补注释：
  - session cache 语义
  - `401` 重试语义
  - `>=500` fallback 到 `list + total` 的原因
- [x] 为 `json-export.ts` 补注释：
  - CAS 解析失败为何静默回退原值
  - 导出时为何补 `normalized_conditions`
- [x] 为 `session-guard.ts` 补注释：
  - header/cookie 双向匹配的安全约束
- [x] 为 `ocr/route.ts` 补注释：
  - 多 blockId 协议的优先级与回退原因

### Task 22: 全链路验证与文档回写

**Files:**
- Modify: `docs/2026-04-10-chemd-lint-complexity-refactor-plan.md`
- Modify: `docs/2026-04-10-backend-refactor-remediation-implementation-plan.md`

- [x] 跑 web 目标测试：
  - `pnpm --filter @chemd/web test`
- [x] 跑 web 类型与 lint：
  - `pnpm --filter @chemd/web typecheck`
  - `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`
- [x] 跑 Python 全量验证：
  - `ruff check services/chem-service`
  - `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
  - `cd services/chem-service && poetry run python -m unittest discover -s tests -v`
- [x] 若基线下降，回写 `docs/2026-04-10-chemd-lint-complexity-refactor-plan.md` 的状态与剩余热点。
- [x] 若某条高风险 contract 被迫调整，暂停执行并单独写专项设计，不允许在本计划内静默越界。

#### Chunk 6 Final Verification (2026-04-10)

- 注释债完成：
  - `apps/web/src/server/chem/lab-storage-client.ts`
  - `apps/web/src/server/chem/json-export.ts`
  - `apps/web/src/server/chem/session-guard.ts`
  - `apps/web/src/app/api/chem/ocr/route.ts`
- `pnpm --filter @chemd/web test`
  - 结果：`37 files, 129 tests passed`
- `pnpm --filter @chemd/web typecheck`
  - 结果：`exit 0`
- `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx`
  - 结果：`exit 0`
- `ruff check services/chem-service`
  - 结果：`All checks passed!`
- `ruff check services/chem-service --select C90,PLR0911,PLR0912,PLR0913,PLR0915`
  - 结果：`All checks passed!`
- `cd services/chem-service && poetry run python -m unittest discover -s tests -v`
  - 结果：`46 tests passed`
- 结果汇总：
  - TypeScript route/server 注释债已补齐
  - chem-service 复杂度热点已清零
  - 本轮未触碰 HTTP response 字段、CAS/PubChem fallback 顺序、`/structure` cache 语义、reaction `data-*` 协议

## Suggested Execution Order

1. Chunk 1：先锁定基线和不变量。
2. Chunk 2：先拆 Next route 边界，直接减少 TS lint 热点和重复协议转换。
3. Chunk 3：再拆 `cas-resolver`，避免多个 route 继续叠加在旧大文件之上。
4. Chunk 4：完成 `chem-service` 迁移，压缩 `app.py` 的双轨兼容面。
5. Chunk 5：最后拆 reaction 几何核心，避免边界未稳就提前细拆 SVG 逻辑。
6. Chunk 6：补齐剩余注释债并做全链路回归。

## Completion Criteria

- `apps/web` 目标 route 文件回到“parse / call / serialize”薄层。
- `cas-resolver.ts` 不再是 500+ 行的综合热点。
- `services/chem-service/app.py` 只保留 Flask route、装配、guard、CORS 和最小 request 适配。
- reaction layout / render / SVG 几何不再通过 `dict[str, Any]` 交换核心结构。
- 剩余注释集中解释协议、fallback、缓存和几何边界，不再有英文迁移说明式注释。
- 定向验证与全量验证都能给出明确证据；若某条无法执行，必须记录原因，不得宣称完成。
