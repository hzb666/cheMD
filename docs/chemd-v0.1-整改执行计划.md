# chemd v0.1 整改执行计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于本轮代码审查结果，收口 `chemd v0.1` 的安全边界、render 合同、缓存真相源、编辑状态链和文档口径，降低上线风险并提高后续接入真实 provider/editor 的可控性。

**Architecture:** 本计划不扩张产品范围，只修正当前“壳层已通但正式能力未完成”的关键断点。优先收口写接口安全、reaction render 真 seam、OCR 上传合同和缓存一致性；随后补 editor 状态逻辑与测试覆盖；最后统一文档叙事，确保代码、测试和计划保持一致。

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Python Flask, pnpm workspace, Turborepo

---

## 范围说明

### 本计划纳入
- `apps/web` 中 `api/chem`、preview、molecule/reaction editor、OCR hooks
- `services/chem-service` 中 OCR/normalize/render/health 相关接口
- `packages/render-profile` / `packages/renderer-svg` / `packages/compiler` 的 render 合同对齐
- `docs` 中 v0.1 相关文档口径修正

### 本计划不纳入
- 真实第三方 Ketcher 接入实现
- 真实 reaction OCR provider 接入
- 真实 reaction render provider 的完整实现
- `training-export` 功能扩展

---

## 审查基线

本计划对应以下已确认问题：
- 写接口缺认证/授权与会话绑定
- `reaction render` provider seam 仍是假接入
- `render-profile` 对 reaction HTTP 预览链未真正生效
- OCR 上传大小前后合同不一致
- Next.js 与 chem-service 存在两套结构缓存真相源
- reaction editor 草稿/重置/token 逻辑存在状态风险
- 关键主链测试覆盖不足
- v0.1 文档对完成度表述偏乐观，且存在互相矛盾

---

## 执行顺序

1. `P0-1` 写接口安全边界
2. `P0-2` reaction render 真 seam + render-profile 生效
3. `P0-3` OCR 上传大小合同统一
4. `P1-1` 结构缓存真相源统一
5. `P1-2` reaction editor 状态链整改
6. `P1-3` 补关键自动化测试
7. `P2-1` 文档口径统一

---

## Chunk 1: P0 安全与主合同收口

### Task 1: 收口写接口安全边界

**Files:**
- Modify: `apps/web/src/app/api/chem/ocr/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/ocr/route.ts`
- Modify: `apps/web/src/app/api/chem/structure/save/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/save/route.ts`
- Modify: `apps/web/src/features/preview/components/PreviewShell.tsx`
- Modify: `apps/web/src/features/preview/lib/read-preview-edit-message.ts`
- Modify: `services/chem-service/app.py`
- Modify: `docs/chemd-v0.1-功能计划与实现进度.md`
- Modify: `services/chem-service/README.md`
- Test: `apps/web/tests/preview-edit-message.test.ts`
- Test: `apps/web/tests/chem-ocr-route.test.ts`
- Test: `apps/web/tests/reaction-ocr-route.test.ts`
- Test: `apps/web/tests/structure-save.test.ts`
- Test: `apps/web/tests/reaction-save-route.test.ts`
- Test: `services/chem-service/tests/test_app.py`

- [ ] **Step 1: 定义当前安全假设**

输出一条明确结论并写入文档：
- 如果当前仅支持本地单用户 playground，则文档中必须显式声明“未提供多用户安全边界”。
- 如果准备支持共享部署，则本任务必须落地最小鉴权方案。

- [ ] **Step 2: 为 preview message 增加最小来源证明**

实现要求：
- 父页面生成一次性 preview token。
- token 注入 iframe `srcDoc`。
- iframe 发 `postMessage` 时带上 token。
- `readPreviewEditMessage` 校验 token、`event.source` 和 `previewIsFresh`。

- [ ] **Step 3: 为副作用 API 增加最小会话校验**

实现要求：
- 所有写路由统一校验来自当前会话的 token 或明确拒绝无 token 请求。
- 如果暂时不做用户系统，也要把“当前只接受同 session 写入”的假设编码进 route。

- [ ] **Step 4: 为 chem-service 增加最小访问边界**

实现要求：
- 新增服务间访问密钥或显式的内部模式开关。
- 对 `/ocr`、`/normalize`、`/render`、`/reaction/ocr`、`/reaction/render` 做统一校验。
- 文档写明该服务默认不应暴露到公网。

- [ ] **Step 5: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- preview-edit-message.test.ts chem-ocr-route.test.ts reaction-ocr-route.test.ts structure-save.test.ts reaction-save-route.test.ts`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
Expected: PASS

---

### Task 2: 让 reaction render seam 真正承载合同

**Files:**
- Modify: `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts`
- Modify: `apps/web/src/app/api/chem/reaction/render/route.ts`
- Modify: `apps/web/src/server/chem/chem-service-client.ts`
- Modify: `services/chem-service/app.py`
- Modify: `packages/render-profile/src/index.ts`
- Modify: `packages/compiler/src/index.ts`
- Modify: `docs/chemd-v0.1-功能计划与实现进度.md`
- Modify: `docs/chemd-v0.1-architecture.zh-CN.md`
- Test: `apps/web/tests/reaction-render-route.test.ts`
- Test: `services/chem-service/tests/test_app.py`
- Test: `packages/render-profile/tests/render-profile.test.ts`

- [ ] **Step 1: 先锁定失败测试**

补测试覆盖以下行为：
- reaction hydration 请求确实带上 `renderOptions`
- route 把 `renderOptions` 传给 chem-service
- chem-service fallback 至少消费 `reaction.arrowLength`
- chem-service fallback 至少消费 `reaction.showConditionsBelowArrow`

- [ ] **Step 2: 让前端实际传递 profile/renderOptions**

实现要求：
- `useRenderedPreview` 不能只传 `reactants/products/conditions`
- reaction render 请求必须带当前编译结果中用于 depiction 的 render payload 或 renderOptions

- [ ] **Step 3: 让 chem-service fallback honor 最小 reaction render 约束**

实现要求：
- 使用 `reaction.arrowLength`
- 使用 `reaction.componentGap` / `reaction.plusGap`
- 使用 `reaction.showConditionsBelowArrow`
- 若 provider 未接入，也不能完全忽略配置

- [ ] **Step 4: 明确 provider seam 语义**

实现要求：
- 要么真的按 `_REACTION_RENDER_PROVIDER` 分发
- 要么删掉误导性的 provider 名称与 “unknown provider” 告警
- 不能继续保留“看似支持 provider，实际永远 fallback”的状态

- [ ] **Step 5: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- reaction-render-route.test.ts rendered-preview-helpers.test.ts preview-shell.test.tsx`
- `pnpm --filter @chemd/render-profile test`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
Expected: PASS

---

### Task 3: 统一 OCR 上传大小合同

**Files:**
- Modify: `apps/web/src/app/api/chem/ocr/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/ocr/route.ts`
- Modify: `apps/web/src/features/ocr/hooks/useImageOcr.ts`
- Modify: `apps/web/src/features/reaction-ocr/hooks/useReactionOcr.ts`
- Modify: `services/chem-service/app.py`
- Modify: `services/chem-service/README.md`
- Test: `apps/web/tests/chem-ocr-route.test.ts`
- Test: `apps/web/tests/reaction-ocr-route.test.ts`
- Test: `services/chem-service/tests/test_app.py`

- [ ] **Step 1: 明确单一限制口径**

在代码和文档中确定唯一标准：
- 直接按原始文件大小限制
- 或按 base64 膨胀后的估算大小限制

- [ ] **Step 2: 在 Web route 侧提前拒绝超限请求**

实现要求：
- molecule 与 reaction OCR 两条 route 共用一致规则
- 错误信息对用户可理解，不暴露内部实现细节

- [ ] **Step 3: 保持 chem-service 限制与 Web 层一致**

实现要求：
- 默认值一致
- README 说明清楚

- [ ] **Step 4: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- chem-ocr-route.test.ts reaction-ocr-route.test.ts`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
Expected: PASS

---

## Chunk 2: P1 状态与缓存真相源收口

### Task 4: 统一结构缓存真相源

**Files:**
- Modify: `apps/web/src/server/chem/structure-store.ts`
- Modify: `apps/web/src/server/chem/chem-service-client.ts`
- Modify: `apps/web/src/app/api/chem/structure/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/structure/route.ts`
- Modify: `apps/web/src/app/api/chem/structure/save/route.ts`
- Modify: `apps/web/src/app/api/chem/reaction/save/route.ts`
- Modify: `services/chem-service/app.py`
- Modify: `docs/chemd-v0.1-architecture.zh-CN.md`
- Test: `apps/web/tests/chem-structure-route.test.ts`
- Test: `apps/web/tests/reaction-structure-route.test.ts`
- Test: `apps/web/tests/structure-store.test.ts`
- Test: `services/chem-service/tests/test_app.py`

- [ ] **Step 1: 选定唯一缓存真相源**

二选一：
- 统一走 Next.js 进程内 store
- 统一走 chem-service `/structure`

推荐：
- 统一走 chem-service，Web 层只做代理与 session 归一化

- [ ] **Step 2: 修改读取路径**

实现要求：
- molecule/reaction 的 structure GET 都从同一真相源读
- 本地 fallback 行为需要明确

- [ ] **Step 3: 修改保存路径**

实现要求：
- structure save / reaction save / OCR 写回都写入同一真相源
- 键空间规则统一

- [ ] **Step 4: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- chem-structure-route.test.ts reaction-structure-route.test.ts structure-store.test.ts`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
Expected: PASS

---

### Task 5: 整改 reaction editor 的草稿/重置/token 逻辑

**Files:**
- Modify: `apps/web/src/features/reaction-editor/lib/reaction-draft-store.ts`
- Modify: `apps/web/src/features/reaction-editor/lib/load-reaction-draft.ts`
- Modify: `apps/web/src/features/reaction-editor/lib/reaction-ketcher-shell.ts`
- Modify: `apps/web/src/features/reaction-editor/adapters/reaction-ketcher-shell-adapter.tsx`
- Modify: `apps/web/src/features/reaction-editor/components/ReactionDialog.tsx`
- Test: `apps/web/tests/reaction-dialog.test.tsx`
- Test: `apps/web/tests/reaction-ketcher-shell.test.ts`
- Test: `apps/web/tests/reaction-ketcher-shell-adapter.test.tsx`
- Create: `apps/web/tests/load-reaction-draft.test.ts`
- Create: `apps/web/tests/reaction-draft-store.test.ts`

- [ ] **Step 1: 为草稿过期判定写失败测试**

覆盖：
- 预览重新编译但 block 内容未被用户正式保存
- 本地草稿不应被误删
- `sourceReactionKey` 与当前 fallback 不一致时的处理规则

- [ ] **Step 2: 为 syncToken 更新规则写失败测试**

覆盖：
- editor 内容变化后 token 应随之变化
- resetKey 应能区分旧 editorState 与新内容

- [ ] **Step 3: 修正本地草稿语义**

实现要求：
- `sourceReactionKey` 仅作为基线签名，不直接把“未保存编辑”误判为过期
- 自动保存可使用单独字段表达“当前编辑态签名”

- [ ] **Step 4: 修正 host shell token 语义**

实现要求：
- `syncToken` 应从当前 `editorValue` 派生
- 不得永久固定为初始化时的签名

- [ ] **Step 5: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- reaction-dialog.test.tsx reaction-ketcher-shell.test.ts reaction-ketcher-shell-adapter.test.tsx load-reaction-draft.test.ts reaction-draft-store.test.ts`
Expected: PASS

---

### Task 6: 修正 molecule save 后的 UI/存储一致性

**Files:**
- Modify: `apps/web/src/features/structure-editor/lib/structure-save.ts`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/tests/structure-save.test.ts`
- Test: `apps/web/tests/page.test.tsx`

- [ ] **Step 1: 为 `molfile` 缺失回退行为写失败测试**

覆盖：
- 服务端返回 `smiles` 但未返回 `molfile`
- 前端不得继续保留旧 `molfile`

- [ ] **Step 2: 修正 `resolveSavedStructureDraft`**

实现要求：
- 服务端未返回 `molfile` 时，用服务器结果作为真相

- [ ] **Step 3: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- structure-save.test.ts page.test.tsx`
Expected: PASS

---

## Chunk 3: P1 测试补齐与 P2 文档收口

### Task 7: 为 preview/edit bridge 和 API 合同补齐自动化测试

**Files:**
- Modify: `apps/web/tests/preview-edit-message.test.ts`
- Modify: `apps/web/tests/reaction-render-route.test.ts`
- Modify: `services/chem-service/tests/test_app.py`
- Create: `apps/web/tests/rendered-preview-reaction.test.ts`

- [ ] **Step 1: 为 preview bridge 写缺失测试**

覆盖：
- token 校验
- molecule/reaction message parsing
- preview stale 时拒绝编辑消息

- [ ] **Step 2: 为 reaction renderOptions 合同写缺失测试**

覆盖：
- request 带 `renderOptions`
- route 正确透传
- fallback 至少 honor 一部分 reaction options

- [ ] **Step 3: 为 chem-service 补 renderOptions 与 provider seam 测试**

覆盖：
- `_REACTION_RENDER_PROVIDER` 的行为
- `renderOptions` 的接受和使用

- [ ] **Step 4: 运行定向测试**

Run:
- `pnpm --filter @chemd/web test -- preview-edit-message.test.ts reaction-render-route.test.ts rendered-preview-reaction.test.ts`
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
Expected: PASS

---

### Task 8: 统一 v0.1 文档口径

**Files:**
- Modify: `docs/chemd-v0.1-功能计划与实现进度.md`
- Modify: `docs/chemd-v0.1-spec.zh-CN.md`
- Modify: `docs/chemd-v0.1-architecture.zh-CN.md`
- Modify: `docs/chemd-v0.1-refactor-roadmap.zh-CN.md`
- Modify: `docs/chemd-v0.1-training-export-plan.md`

- [ ] **Step 1: 统一状态分层**

所有文档统一区分：
- 壳层/API 已接通
- fallback/contract 已接通
- 正式 provider/editor 未完成

- [ ] **Step 2: 修正文档过时内容**

必须更新：
- parser/frontmatter 现状
- reaction Web/API 壳层现状
- Ketcher 仍为 shell，而非正式闭环
- `training-export` 已移出 v0.1 主范围

- [ ] **Step 3: 为每份文档增加更新时间**

确保后续审查可快速判断新旧程度。

- [ ] **Step 4: 运行最小验证**

Run:
- `rg -n "Ketcher 闭环|training-export|目标态|placeholder|fallback" docs`
Expected: 文档口径一致，不再互相冲突

---

## 最终收尾验证

- [ ] **Step 1: 运行前端全量测试**

Run:
- `pnpm --filter @chemd/web test`
Expected: PASS

- [ ] **Step 2: 运行全仓测试**

Run:
- `pnpm test`
Expected: PASS

- [ ] **Step 3: 运行全仓类型检查**

Run:
- `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: 运行 chem-service Python 测试**

Run:
- `python -m unittest discover -s services/chem-service/tests -p "test_*.py"`
Expected: PASS

---

## 完成标准

满足以下条件才可认为本轮整改完成：
- 写接口和 preview message 至少具备最小可信来源校验
- reaction render 不再是假 seam
- reaction HTTP 预览链开始真正消费 render-profile 的 reaction 约束
- OCR 上传大小合同在 Web 和 chem-service 两端一致
- 结构缓存只保留一套真相源
- reaction editor 草稿/重置/token 行为有测试保护
- v0.1 文档不再混淆“壳层完成”和“正式能力完成”

---

## 当前建议

执行时优先完成 Chunk 1。  
若 Chunk 1 未完成，不建议继续推进真实 provider 或真实第三方 editor 接入，因为当前基础合同仍不稳。
