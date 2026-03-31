# Playground Linear Lite Workbench Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `@chemd/web` playground into a wider Linear-inspired workbench without changing compile behavior.

**Architecture:** Keep the existing page and three shell components, but replace the current demo-card styling with shared workbench tokens and reorganized panel headers. Use CSS variables in `globals.css` for consistent theming, then update each shell component to consume the new structure and diagnostics tabs.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4 utilities, global CSS tokens, Vitest

---

## Chunk 1: Layout And Theme

### Task 1: Add the shared design tokens and workbench classes

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] Define the new cold-neutral theme tokens for page, panels, borders, text, code surfaces, and focus states.
- [ ] Add reusable workbench classes for shell width, panel chrome, status pills, stat cards, segmented controls, and motion preferences.
- [ ] Preserve accessible contrast and visible keyboard focus styling.

### Task 2: Replace the page shell with a Linear-lite workbench header

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/tests/page.test.tsx`

- [ ] Add a compact top product bar with app identity, compile status, and context summary.
- [ ] Expand the workbench container width and tune desktop column ratios for `Editor`, `Preview`, and `Inspect`.
- [ ] Keep existing semantic labels required by tests, then update `page.test.tsx` only if markup expectations change.

## Chunk 2: Panel Refinement

### Task 3: Redesign the editor shell

**Files:**
- Modify: `apps/web/src/features/editor/components/EditorShell.tsx`

- [ ] Add a richer header with panel title, document summary, and profile controls.
- [ ] Restyle the textarea and its container as a more polished editor surface.
- [ ] Keep the existing `Render profile select` and `chemd-source-editor` identifiers for accessibility and tests.

### Task 4: Redesign the preview shell

**Files:**
- Modify: `apps/web/src/features/preview/components/PreviewShell.tsx`

- [ ] Reduce explanatory copy and replace it with compact metadata/status cards.
- [ ] Restyle the iframe container to create a distinct document canvas inside the application panel.
- [ ] Update the iframe theme CSS to match the new neutral visual language.

### Task 5: Redesign the diagnostics shell

**Files:**
- Modify: `apps/web/src/features/diagnostics/components/DiagnosticsShell.tsx`

- [ ] Keep diagnostics, render options, DOCX export, JSON, and bridge payload in one coherent inspect panel.
- [ ] Add a local tab state to switch between `Normalized JSON` and `DOCX Bridge Payload`.
- [ ] Preserve the existing export behavior and loading/error feedback.

## Chunk 3: Verification

### Task 6: Validate test and type safety

**Files:**
- Test: `apps/web/tests/page.test.tsx`

- [ ] Run `pnpm --filter @chemd/web test`.
- [ ] Run `pnpm --filter @chemd/web build`.
- [ ] Run `pnpm typecheck` if workspace state allows; otherwise run `pnpm --filter @chemd/web typecheck` from the package directory.

### Task 7: Capture UI evidence

**Files:**
- Modify: none

- [ ] Start the local web app.
- [ ] Capture at least one updated screenshot of the playground workbench.
- [ ] Note any remaining responsive or visual gaps before closing the task.
