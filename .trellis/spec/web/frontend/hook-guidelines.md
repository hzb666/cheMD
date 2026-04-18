# Hook Guidelines - @chemd/web

## Overview

Feature hooks own client orchestration. They should wrap browser effects, request lifecycles, editor state, preview hydration, and feature-specific side effects while keeping package logic in `@chemd/*` packages.

## Hook Placement

- Put hooks in `apps/web/src/features/<feature>/hooks`.
- Keep helper functions in `features/<feature>/lib` when they do not need React.
- Do not put hooks in `packages/*`.

## Effects and Async Work

- Use `AbortController` for fetch effects that depend on changing input.
- Use cleanup functions to cancel schedulers, timers, and async hydration flags.
- Use `startTransition` and `useDeferredValue` for expensive compile/preview updates.
- Keep latest mutable source values in refs when async callbacks need current state.

## Examples

- `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts` uses deferred source, a compile scheduler, refs, and transitions.
- `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts` hydrates rendered HTML and guards async updates with an `active` flag.
- `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts` coordinates draft loading, save requests, source replacement, and status messages.

## Error Handling

- Convert expected request failures into user-facing status strings or typed return values.
- Do not throw from event handlers unless the caller explicitly catches and surfaces the error.
- Keep failed preview hydration non-fatal; return fallback HTML when possible.

## Common Mistakes

- Do not import `apps/web/src/server/*` from hooks.
- Do not let an async effect update state after unmount or dependency change.
- Do not duplicate request body construction when a feature lib helper already exists.
