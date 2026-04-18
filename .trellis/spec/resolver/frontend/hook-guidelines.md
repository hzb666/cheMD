# Hook Guidelines - @chemd/resolver

## Overview

No React hooks should live in `packages/resolver`. Package APIs must stay usable from tests, Node adapters, and browser code without React.

## Rules

- Do not import `react` from package code.
- Do not use `useState`, `useEffect`, `useMemo`, or React context in packages.
- Put UI orchestration hooks in `apps/web/src/features/*/hooks`.
- Package functions should accept explicit inputs and return typed outputs.

## Examples

- `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts` owns React scheduling state and calls package APIs.
- `packages/compiler/src/index.ts` exposes `compileChemd(source, options)` as a pure function.
- `packages/render-profile/src/index.ts` exposes resolver functions without React dependencies.
