# Parser Resolver Phase Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first real `chemd` language slice: semantic block parsing, reference tokenization, object indexing, and basic resolution diagnostics.

**Architecture:** Extend `@chemd/core` so semantic nodes and references are explicit typed objects instead of raw markdown-only placeholders. Keep parsing and resolution separate: the parser emits normalized semantic blocks and reference tokens, then the resolver builds indexes, validates ids and required fields, and annotates references with resolution outcomes.

**Tech Stack:** `TypeScript`, `Vitest`, `pnpm`, workspace packages `@chemd/core`, `@chemd/parser`, `@chemd/resolver`, `@chemd/compiler`

---

## Chunk 1: Core AST Expansion

### Task 1: Add semantic node and reference types

**Files:**
- Modify: `packages/core/src/ast.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/core.test.ts`

- [ ] **Step 1: Write failing tests for semantic node creation and reference tokens**
- [ ] **Step 2: Run `pnpm --filter @chemd/core test` and confirm failure**
- [ ] **Step 3: Implement typed semantic nodes for `molecule`, `reaction`, `result`, `analysis`, `sample`, `template`, `use`, and `reference`**
- [ ] **Step 4: Re-run `pnpm --filter @chemd/core test` and confirm pass**

## Chunk 2: Parser Implementation

### Task 2: Parse fenced `chemd` blocks and inline references

**Files:**
- Modify: `packages/parser/src/index.ts`
- Modify: `packages/parser/tests/parser.test.ts`

- [ ] **Step 1: Write failing parser tests for `reaction`, `result`, markdown references, and diagnostics**
- [ ] **Step 2: Run `pnpm --filter @chemd/parser test` and confirm failure**
- [ ] **Step 3: Implement block extraction, field normalization, list splitting, and markdown reference tokenization**
- [ ] **Step 4: Re-run `pnpm --filter @chemd/parser test` and confirm pass**

## Chunk 3: Resolver Implementation

### Task 3: Resolve object references and validate ids/required fields

**Files:**
- Modify: `packages/resolver/src/index.ts`
- Modify: `packages/resolver/tests/resolver.test.ts`
- Modify: `packages/compiler/tests/compiler.test.ts`

- [ ] **Step 1: Write failing resolver tests for duplicate ids, missing fields, `@meta.key`, `@id`, and `@id.field`**
- [ ] **Step 2: Run `pnpm --filter @chemd/resolver test` and confirm failure**
- [ ] **Step 3: Implement object index construction, basic validation, and resolution status annotation**
- [ ] **Step 4: Re-run resolver and compiler tests and confirm pass**

## Chunk 4: Verification

### Task 4: Run full verification

**Files:**
- Modify: `packages/*/package.json`

- [ ] **Step 1: Run `pnpm test`**
- [ ] **Step 2: Run `pnpm typecheck`**
- [ ] **Step 3: Run `pnpm --filter @chemd/web build`**
