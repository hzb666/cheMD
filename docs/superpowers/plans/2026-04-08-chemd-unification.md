# Chemd Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify chemical blocks, editing flow, and HTTP APIs around a single `chemd` model with explicit `molecule` / `reaction` JSON output.

**Architecture:** Parse only `:::chemd` blocks, infer node type from fields, and preserve explicit `type` in JSON/API payloads. In `apps/web`, replace separate molecule/reaction edit flows and routes with one draft/save/render pipeline that lets Ketcher determine the final type while document writeback always serializes `:::chemd`.

**Tech Stack:** TypeScript, Next.js 15, Vitest, pnpm workspace, Ketcher

---

## Chunk 1: Parser And Block Serialization

### Task 1: Parse `:::chemd` into molecule/reaction nodes

**Files:**
- Modify: `packages/parser/src/body/parse-body.ts`
- Test: `packages/parser/tests/parser.test.ts`

- [ ] Add `chemd` as the only chemical block type entry point
- [ ] Infer `reaction` when `reac` or `prod` is present; otherwise infer `molecule`
- [ ] Accept `smiles` / `cas` for molecule input and `reac` / `prod` / `conditions` for reaction input
- [ ] Update parser tests to assert `:::chemd` behavior

### Task 2: Always write `:::chemd` blocks back to source

**Files:**
- Modify: `apps/web/src/features/chem-editor/lib/replace-chem-block.ts`
- Test: `apps/web/tests/replace-chem-block.test.ts`

- [ ] Serialize molecule drafts as `:::chemd + smiles`
- [ ] Serialize reaction drafts as `:::chemd + reac/prod/conditions`
- [ ] Update tests to assert unified block output

## Chunk 2: Unified Web Draft / Save / Render APIs

### Task 3: Introduce unified web chemd payloads

**Files:**
- Modify: `apps/web/src/server/chem/dto.ts`
- Modify: `apps/web/src/server/chem/chem-service-client.ts`
- Create: `apps/web/src/app/api/chem/draft/route.ts`
- Create: `apps/web/src/app/api/chem/save/route.ts`
- Modify: `apps/web/src/app/api/chem/render/route.ts`

- [ ] Define explicit `type: "molecule" | "reaction"` draft/render payloads
- [ ] Add unified draft lookup route
- [ ] Add unified save route
- [ ] Extend unified render route to support both types

### Task 4: Update web API tests to target unified routes

**Files:**
- Create: `apps/web/tests/chem-draft-route.test.ts`
- Create: `apps/web/tests/chem-save-route.test.ts`
- Modify: `apps/web/tests/chem-render-route.test.ts`

- [ ] Cover molecule and reaction draft lookup
- [ ] Cover molecule and reaction save
- [ ] Cover unified render route for both types

## Chunk 3: Unified Frontend Edit Flow And Preview Bridge

### Task 5: Replace split edit flows with one chemd flow

**Files:**
- Create: `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts`
- Create: `apps/web/src/features/chem-editor/lib/load-chemd-draft.ts`
- Create: `apps/web/src/features/chem-editor/lib/chemd-draft-store.ts`
- Modify: `apps/web/src/features/chem-editor/types.ts`
- Modify: `apps/web/src/features/chem-editor/lib/chem-editor-export.ts`
- Modify: `apps/web/src/features/chem-editor/components/ChemEditorDialog.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] Define one draft type for editor state
- [ ] Load unified drafts from the new route
- [ ] Save unified drafts through the new route
- [ ] Switch the page to one edit hook and one dialog payload

### Task 6: Unify preview edit bridge and hydration helpers

**Files:**
- Modify: `apps/web/src/features/chem-preview/lib/preview-bridge.ts`
- Modify: `apps/web/src/features/preview/lib/read-preview-edit-message.ts`
- Modify: `apps/web/src/features/preview/hooks/usePreviewShellController.ts`
- Modify: `apps/web/src/features/preview/components/PreviewShell.tsx`
- Modify: `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts`
- Modify: `apps/web/src/features/chem-preview/lib/preview-hydration.ts`

- [ ] Emit one `chemd:edit` preview event
- [ ] Parse one edit payload shape on the host side
- [ ] Hydrate preview graphics/labels through unified draft/render routes

## Chunk 4: Regression Tests And Verification

### Task 7: Update focused tests for unified chemd behavior

**Files:**
- Modify: `apps/web/tests/chem-editor-dialog.test.tsx`
- Modify: `apps/web/tests/chem-editor-save.test.ts`
- Modify: `apps/web/tests/preview-edit-message.test.ts`
- Modify: `apps/web/tests/rendered-preview-helpers.test.ts`
- Modify: `apps/web/tests/ocr-molecule-writeback.test.ts`

- [ ] Update expectations from `molecule/reaction` blocks to `chemd`
- [ ] Update API endpoints and payloads in tests
- [ ] Keep Ketcher export tests verifying explicit output type

### Task 8: Run targeted verification

**Files:**
- Modify: `docs/superpowers/plans/2026-04-08-chemd-unification.md`

- [ ] Run parser tests
- [ ] Run unified web tests
- [ ] Run `pnpm --filter @chemd/web typecheck`
- [ ] Record final verification status in the task log
