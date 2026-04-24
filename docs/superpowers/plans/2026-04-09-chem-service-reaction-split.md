# Chem Service Reaction Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `services/chem-service/app.py` 中的 reaction 渲染相关职责拆到独立模块，同时保持现有 HTTP contract、启动方式与主要测试入口不变。

**Architecture:** 保留 `app.py` 作为 Flask 路由与 RDKit 入口薄层，把 reaction 布局、SVG 后处理和 render payload/config 迁到 `chem_service/` 包内。`app.py` 继续暴露同名 helper 入口，降低现有测试与调用方的破坏面。

**Tech Stack:** Python 3.14, Flask 3, RDKit, unittest

---

## Status Snapshot

- 该计划最初只覆盖 reaction split，但当前落地范围已经扩展到 `chem_service/` 包内的 OCR、structure、molecule rendering 模块化。
- 已落地模块：`molecule_ocr.py`、`reaction_ocr.py`、`remote_provider.py`、`structure_store.py`、`structure_handlers.py`、`molecule_rendering.py`、`reaction_layout.py`、`reaction_svg_layout.py`、`reaction_rendering.py`。
- `app.py` 当前角色已经收口为 composition root + compatibility shim；仍保留的核心职责是 provider 选择、`/healthz` readiness 组装、路由保护/CORS，以及 reaction RDKit render 入口。

## Chunk 1: Reaction Module Split

### Task 1: 建立 reaction 子模块骨架

**Files:**
- Create: `services/chem-service/chem_service/__init__.py`
- Create: `services/chem-service/chem_service/reaction_layout.py`
- Create: `services/chem-service/chem_service/reaction_svg_layout.py`
- Create: `services/chem-service/chem_service/reaction_rendering.py`

- [ ] 新建 `chem_service` 包与 reaction 相关模块文件
- [ ] 按职责分配常量、布局辅助函数、SVG 几何辅助函数、reaction render payload/config 辅助函数

### Task 2: 收口 `app.py` 中的 reaction 逻辑

**Files:**
- Modify: `services/chem-service/app.py`

- [ ] 从 `app.py` 删除已迁移的 reaction helper 实现
- [ ] 引入新模块中的 helper
- [ ] 保留现有 route 与 RDKit reaction render 入口名，避免大范围改测试
- [ ] 清理迁移后不再需要的 import

### Task 3: 验证兼容性

**Files:**
- Modify: `services/chem-service/tests/test_app.py`（仅在必要时）

- [ ] 跑 `services/chem-service` 定向测试
- [ ] 若测试因模块边界调整而失败，仅做最小测试适配
- [ ] 确认 `/reaction/render`、fallback SVG、RDKit SVG 后处理相关断言仍成立
