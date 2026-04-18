# Frontend Development Guidelines - @chemd/renderer-html

Status: Filled from the current codebase.

## Scope

`@chemd/renderer-html` has no React component or hook ownership. Its frontend relevance is that browser-facing code in `apps/web` may consume this package through its public `@chemd/*` API.

## Guideline Index

| Guide | Status | Purpose |
|-------|--------|---------|
| [Directory Structure](./directory-structure.md) | Filled | Browser-consumable package surface |
| [Component Guidelines](./component-guidelines.md) | Filled | No-package-components rule and renderer markup contracts |
| [Hook Guidelines](./hook-guidelines.md) | Filled | No-package-hooks rule |
| [State Management](./state-management.md) | Filled | No hidden mutable UI state in packages |
| [Quality Guidelines](./quality-guidelines.md) | Filled | Frontend consumption checks |
| [Type Safety](./type-safety.md) | Filled | Types exported for UI consumers |

## Pre-Development Checklist

- If adding UI, put it in `apps/web/src/features` or `apps/web/src/components`, not in `packages/renderer-html`.
- If adding browser-consumed data, export typed values from `packages/renderer-html/src/index.ts`.
- If changing HTML/data attributes, update renderer tests and `apps/web` preview hydration tests.
