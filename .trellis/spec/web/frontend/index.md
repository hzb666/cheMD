# Frontend Development Guidelines - @chemd/web

Status: Filled from the current codebase.

## Scope

`@chemd/web` is the Next.js 15 playground app. It owns the product UI, feature hooks, API route handlers, and the server-side facade around chemistry services.

## Guideline Index

| Guide | Status | Purpose |
|-------|--------|---------|
| [Directory Structure](./directory-structure.md) | Filled | App Router, features, server, and tests |
| [Component Guidelines](./component-guidelines.md) | Filled | React component and styling patterns |
| [Hook Guidelines](./hook-guidelines.md) | Filled | Client hooks, effects, and fetch orchestration |
| [State Management](./state-management.md) | Filled | Local state, refs, transitions, and server state |
| [Quality Guidelines](./quality-guidelines.md) | Filled | Tests, lint, typecheck, and route boundaries |
| [Type Safety](./type-safety.md) | Filled | DTOs, unknown narrowing, and package contracts |

## Pre-Development Checklist

- Read `apps/web/src/app/page.tsx` for the top-level product wiring before changing the workbench.
- Read the relevant feature folder under `apps/web/src/features/*` before adding UI or hooks.
- Read `apps/web/src/server/chem/*` before changing `/api/chem/*` routes.
- For UI changes, run targeted `@chemd/web` tests and provide screenshots when the task asks for PR-ready output.
- For route/server changes, run affected web tests plus `pnpm --filter @chemd/web typecheck`.
