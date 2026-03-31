# Chemd Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the initial `chemd` monorepo scaffold with a Next.js web app and TypeScript core packages that compile, test, and establish the semantic/render pipeline boundaries.

**Architecture:** Use a `pnpm` workspace with `Turborepo` to host one Next.js application and several focused TypeScript packages. Keep `core`, `parser`, `resolver`, `render-profile`, and `compiler` separate from day one so the semantic AST, resolution pipeline, and render selection stay decoupled.

**Tech Stack:** `pnpm`, `Turborepo`, `TypeScript`, `Vitest`, `Next.js 15`, `React 19`, `Tailwind CSS v4`

---

## Chunk 1: Workspace Foundation

### Task 1: Create root workspace and toolchain config

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `.gitignore`

- [ ] **Step 1: Write the failing workspace smoke test**

Create a package-level test later consumed by the workspace test runner so the workspace has a red/green proof point.

- [ ] **Step 2: Run test command to verify the repo is not yet configured**

Run: `pnpm test`
Expected: FAIL because no workspace config or scripts exist yet.

- [ ] **Step 3: Add root workspace and shared tool configuration**

Define workspace packages, shared TypeScript compiler options, shared `turbo` tasks, and the Vitest workspace entry.

- [ ] **Step 4: Run the workspace command again**

Run: `pnpm test`
Expected: advances past root script lookup and fails only because package code/tests are still missing.

### Task 2: Create the base directory layout

**Files:**
- Create: `apps/web/`
- Create: `packages/core/`
- Create: `packages/parser/`
- Create: `packages/resolver/`
- Create: `packages/render-profile/`
- Create: `packages/compiler/`

- [ ] **Step 1: Create the empty package/app directories**
- [ ] **Step 2: Add placeholder `package.json` files for each workspace**
- [ ] **Step 3: Re-run workspace discovery**

Run: `pnpm -r exec pwd`
Expected: all intended workspaces are discovered.

## Chunk 2: Core Types and Pipeline Stubs

### Task 3: Add `@chemd/core` types and diagnostics

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/ast.ts`
- Create: `packages/core/src/diagnostics.ts`
- Create: `packages/core/tests/core.test.ts`

- [ ] **Step 1: Write the failing core type test**

```ts
import { describe, expect, it } from "vitest";
import { createDocument } from "../src";

describe("createDocument", () => {
  it("creates a chemd document with empty diagnostics and children", () => {
    const doc = createDocument({ id: "exp-1", title: "Test", date: "2026-03-30" });

    expect(doc.type).toBe("document");
    expect(doc.children).toEqual([]);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.meta.id).toBe("exp-1");
  });
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `pnpm --filter @chemd/core test`
Expected: FAIL because `createDocument` and source files do not exist yet.

- [ ] **Step 3: Implement the minimal core domain model**

Add document/diagnostic types and a small `createDocument` helper that seeds the AST boundary expected by later packages.

- [ ] **Step 4: Re-run the targeted test**

Run: `pnpm --filter @chemd/core test`
Expected: PASS.

### Task 4: Add parser, resolver, render-profile, and compiler package stubs

**Files:**
- Create: `packages/parser/package.json`
- Create: `packages/parser/tsconfig.json`
- Create: `packages/parser/src/index.ts`
- Create: `packages/parser/tests/parser.test.ts`
- Create: `packages/resolver/package.json`
- Create: `packages/resolver/tsconfig.json`
- Create: `packages/resolver/src/index.ts`
- Create: `packages/resolver/tests/resolver.test.ts`
- Create: `packages/render-profile/package.json`
- Create: `packages/render-profile/tsconfig.json`
- Create: `packages/render-profile/src/index.ts`
- Create: `packages/render-profile/tests/render-profile.test.ts`
- Create: `packages/compiler/package.json`
- Create: `packages/compiler/tsconfig.json`
- Create: `packages/compiler/src/index.ts`
- Create: `packages/compiler/tests/compiler.test.ts`

- [ ] **Step 1: Write failing tests for each package contract**

Contracts:
- `parseChemd(source)` returns a document shell with raw source metadata
- `resolveChemd(doc)` returns the same doc plus diagnostics passthrough
- `resolveRenderProfile(selection)` returns a default profile when none selected
- `compileChemd(source)` wires the three stages together

- [ ] **Step 2: Run each targeted package test and confirm failure**

Run:
- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/resolver test`
- `pnpm --filter @chemd/render-profile test`
- `pnpm --filter @chemd/compiler test`

Expected: FAIL due to missing source contracts.

- [ ] **Step 3: Implement the minimum green path**

Keep implementations intentionally small and typed:
- parser returns a document shell using `@chemd/core`
- resolver returns the input doc unchanged for now
- render-profile exposes built-in defaults and selection resolution
- compiler composes parser + resolver + render-profile

- [ ] **Step 4: Re-run all targeted tests**

Run:
- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/resolver test`
- `pnpm --filter @chemd/render-profile test`
- `pnpm --filter @chemd/compiler test`

Expected: PASS.

## Chunk 3: Next.js App Shell

### Task 5: Add the `apps/web` Next.js application shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/features/editor/components/EditorShell.tsx`
- Create: `apps/web/src/features/preview/components/PreviewShell.tsx`
- Create: `apps/web/src/features/diagnostics/components/DiagnosticsShell.tsx`

- [ ] **Step 1: Write the failing UI smoke test**

Add a lightweight server-render smoke test or shared component test that asserts the landing page contains three panes: editor, preview, diagnostics.

- [ ] **Step 2: Run the app test and confirm it fails**

Run: `pnpm --filter @chemd/web test`
Expected: FAIL because the app shell files do not exist yet.

- [ ] **Step 3: Implement the minimal app router shell**

Create a simple split-pane landing page that reflects the planned product shape without adding real editor logic yet.

- [ ] **Step 4: Re-run the app test**

Run: `pnpm --filter @chemd/web test`
Expected: PASS.

## Chunk 4: Workspace Verification

### Task 6: Verify the integrated scaffold

**Files:**
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/*/package.json`

- [ ] **Step 1: Install dependencies**

Run: `pnpm install`
Expected: lockfile generated and all workspace dependencies installed.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`
Expected: PASS with all package tests green.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Run the web build**

Run: `pnpm --filter @chemd/web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: initialize chemd monorepo scaffold"
```
