# Playground Shadcn Workbench Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `@chemd/web` playground UI to a shadcn-style component system while keeping the existing two-column workbench behavior and compile pipeline unchanged.

**Architecture:** Add a focused shadcn-compatible UI layer inside `apps/web/src/components/ui`, plus shared helpers in `src/lib`. Keep playground chrome styles in a dedicated stylesheet and extract preview-document rendering styles into a separate module so UI chrome and rendered content remain independently customizable.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4, Radix UI, class-variance-authority, clsx, tailwind-merge, Vitest

---

## Chunk 1: Foundation

### Task 1: Add the failing UI regression test

**Files:**
- Modify: `apps/web/tests/page.test.tsx`

- [ ] **Step 1: Write the failing test**
  Assert the page renders the new shadcn-style shell markers, including shared panel cards, tab triggers, and explicit playground chrome hooks without removing existing compile content assertions.
- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm --filter @chemd/web test -- --runInBand page.test.tsx`
  Expected: FAIL because the new hooks and structure do not exist yet.
- [ ] **Step 3: Keep the test focused**
  Avoid snapshotting the whole page. Assert stable markers such as panel labels, data attributes, and text that represent the intended UI contract.

### Task 2: Add shadcn-compatible dependencies and helpers

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 1: Add the minimal standard dependency set**
  Add `@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-separator`, `@radix-ui/react-slot`, `@radix-ui/react-tabs`, `class-variance-authority`, `clsx`, and `tailwind-merge`.
- [ ] **Step 2: Add the shared `cn` helper**
  Implement the standard `cn(...inputs)` helper with `clsx` and `twMerge`.
- [ ] **Step 3: Install and verify**
  Run: `pnpm install`
  Expected: lockfile updated and workspace install succeeds.

## Chunk 2: UI Layer

### Task 3: Create the reusable shadcn-style UI components

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/dialog.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`
- Create: `apps/web/src/components/ui/separator.tsx`
- Create: `apps/web/src/components/ui/tabs.tsx`
- Create: `apps/web/src/components/ui/textarea.tsx`

- [ ] **Step 1: Copy only the needed primitives**
  Port the component patterns from `D:\Code\LabStorageManager\frontend\src\components\ui`, but remove any dependency on that project’s `inputConfigs` or unrelated business helpers.
- [ ] **Step 2: Normalize file shape**
  Use lowercase shadcn-style filenames and keep each file focused on one primitive family.
- [ ] **Step 3: Keep the API conventional**
  Preserve Radix-forwardRef patterns, `cva` variants where appropriate, and accessible defaults.

### Task 4: Separate playground chrome styles from render styles

**Files:**
- Create: `apps/web/src/features/playground/styles/playground.css`
- Create: `apps/web/src/features/preview/styles/preview-document.ts`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Keep global CSS minimal**
  Limit `globals.css` to Tailwind import, theme variables, and app-wide base rules.
- [ ] **Step 2: Add dedicated playground chrome styles**
  Put workbench-specific layout, panel sizing, and desktop/mobile behavior in `playground.css`.
- [ ] **Step 3: Extract preview document styles**
  Move iframe document CSS into `preview-document.ts` so rendered-content styling can evolve independently from playground chrome.

## Chunk 3: Workbench Migration

### Task 5: Rebuild the page shell around the new UI primitives

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Keep the existing compile orchestration intact**
  Do not change the sample source, scheduler usage, or compile-state derivation beyond what the new UI needs.
- [ ] **Step 2: Replace custom header chrome**
  Build the workbench header with shadcn-style card/button/separator treatment while preserving the existing logo and compile status.
- [ ] **Step 3: Preserve the two-column workbench**
  Keep editor left and preview right on desktop, with stacked behavior on smaller screens.

### Task 6: Rebuild the editor and preview shells

**Files:**
- Modify: `apps/web/src/features/editor/components/EditorShell.tsx`
- Modify: `apps/web/src/features/preview/components/PreviewShell.tsx`

- [ ] **Step 1: Convert the editor shell**
  Replace ad hoc panel markup with `Card`, `Textarea`, and shadcn-style metadata chips while preserving `chemd-source-editor`.
- [ ] **Step 2: Convert the preview shell**
  Replace custom tab buttons with Radix tabs, restyle the preview card, and keep export behavior unchanged.
- [ ] **Step 3: Preserve stable behavior**
  Continue rendering the iframe preview, normalized JSON, and DOCX bridge content from the same source data.

### Task 7: Decide what to do with diagnostics

**Files:**
- Modify: `apps/web/src/features/diagnostics/components/DiagnosticsShell.tsx` if needed

- [ ] **Step 1: Reassess current usage**
  Confirm whether the diagnostics rail is currently mounted.
- [ ] **Step 2: Only refactor if it remains in active use**
  If it is unused, leave it untouched in this pass to avoid speculative churn. If it is being mounted, migrate it to the same UI layer.

## Chunk 4: Verification

### Task 8: Verify the targeted frontend scope

**Files:**
- Test: `apps/web/tests/page.test.tsx`

- [ ] **Step 1: Run targeted tests**
  Run: `pnpm --filter @chemd/web test`
  Expected: PASS.
- [ ] **Step 2: Run targeted typecheck**
  Run: `pnpm --filter @chemd/web typecheck`
  Expected: PASS.
- [ ] **Step 3: Run targeted build**
  Run: `pnpm --filter @chemd/web build`
  Expected: PASS.

### Task 9: Capture UI evidence

**Files:**
- Modify: none

- [ ] **Step 1: Start the local app**
  Run: `pnpm --filter @chemd/web dev --port 3000` or the package default dev command.
- [ ] **Step 2: Capture updated screenshots**
  Record at least desktop and mobile screenshots of the migrated playground.
- [ ] **Step 3: Check layout contracts**
  Verify the desktop two-column workbench remains intact and mobile stacking is usable.
