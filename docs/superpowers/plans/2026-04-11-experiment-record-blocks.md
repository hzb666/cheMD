# Experiment Record Blocks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `chemd` 增加 `procedure / observation / analysis(tlc)` 语法，并把 body block 解析从集中式 switch 拆成块级 parser。

**Architecture:** 保留 `parseChildren()` 作为 body 解析骨架，新增 block registry 与块级 parser 文件，避免把新语法继续堆进单个 `parseStructuredBlock`。`procedure` 与 `observation` 走“少字段 + 正文 body”模型，`analysis` 保持结构化字段并扩展 TLC 语法与默认值，再通过现有 compiler JSON / HTML / DOCX / training exporter 主链输出。

**Tech Stack:** TypeScript, Vitest, pnpm workspace, `@chemd/core`, `@chemd/parser`, `@chemd/renderer-*`, `@chemd/exporter-training`

---

## Chunk 1: Parser Contracts And TDD Baseline

### Task 1: Add failing parser tests for new blocks

**Files:**
- Modify: `packages/parser/tests/parser.test.ts`

- [ ] 添加 `procedure` 正文块测试
- [ ] 添加 `observation` 正文块测试
- [ ] 添加 `analysis(type=tlc)`、`p1/p2`、默认值与 `;;` 分隔测试
- [ ] 运行 `pnpm --filter @chemd/parser test`
- [ ] 确认新增测试先失败，且失败原因对应缺少语法支持

### Task 2: Extend AST and parser registry

**Files:**
- Modify: `packages/core/src/ast.ts`
- Modify: `packages/parser/src/body/parse-children.ts`
- Modify: `packages/parser/src/body/parse-body-shared.ts`
- Modify: `packages/parser/src/body/parse-structured-block.ts`
- Create: `packages/parser/src/body/block-parsers/types.ts`
- Create: `packages/parser/src/body/block-parsers/common.ts`
- Create: `packages/parser/src/body/block-parsers/chemd.ts`
- Create: `packages/parser/src/body/block-parsers/result.ts`
- Create: `packages/parser/src/body/block-parsers/sample.ts`
- Create: `packages/parser/src/body/block-parsers/analysis.ts`
- Create: `packages/parser/src/body/block-parsers/procedure.ts`
- Create: `packages/parser/src/body/block-parsers/observation.ts`
- Create: `packages/parser/src/body/block-parsers/index.ts`

- [ ] 为 `procedure`、`observation` 增加 AST 节点与 union
- [ ] 抽出 block parser registry，仅保留通用分发骨架
- [ ] 支持正文式 block body 提取
- [ ] 支持结构化字段 `;;` 分隔
- [ ] 为 TLC analysis 注入 `plate / visualization` 默认值
- [ ] 运行 `pnpm --filter @chemd/parser test`

## Chunk 2: Renderer And JSON Surface

### Task 3: Add renderer coverage for new nodes

**Files:**
- Modify: `packages/renderer-html/src/block-render.ts`
- Modify: `packages/renderer-html/tests/renderer-html.test.ts`
- Modify: `packages/renderer-docx/src/index.ts`
- Modify: `packages/renderer-docx/tests/renderer-docx.test.ts`
- Modify: `packages/renderer-json/src/index.ts`

- [ ] 为 HTML 渲染新增 `procedure`、`observation`
- [ ] 为 DOCX bridge markdown 新增 `procedure`、`observation`
- [ ] 保持 renderer-json 继续输出当前文档快照样式
- [ ] 运行 `pnpm --filter @chemd/renderer-html test`
- [ ] 运行 `pnpm --filter @chemd/renderer-docx test`

## Chunk 3: Exporter Compatibility And Docs

### Task 4: Keep exporter/source layer compatible

**Files:**
- Modify: `packages/exporter-training/src/types.ts`
- Modify: `packages/exporter-training/src/source-layer.ts`
- Modify: `packages/exporter-training/tests/exporter-record.test.ts`

- [ ] 让 source layer 接受 `procedure / observation` 原始节点类型
- [ ] 确认 training exporter 仍稳定忽略未纳入 semantic layer 的新节点
- [ ] 运行 `pnpm --filter @chemd/exporter-training test`

### Task 5: Update docs and verification notes

**Files:**
- Modify: `docs/2026-04-10-chemd-lint-complexity-refactor-plan.md`
- Modify: `docs/chemd-v0.1-spec.zh-CN.md`

- [ ] 记录 parser block registry 拆分已落地
- [ ] 补充 `procedure / observation / analysis(tlc)` 语法说明
- [ ] 运行 `pnpm --filter @chemd/parser test`
- [ ] 运行 `pnpm --filter @chemd/renderer-html test`
- [ ] 运行 `pnpm --filter @chemd/renderer-docx test`
- [ ] 运行 `pnpm --filter @chemd/exporter-training test`
