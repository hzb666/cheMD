# Directory Structure - @chemd/web

## Overview

`apps/web` is organized by runtime boundary first, then by feature. Keep App Router files thin and move reusable logic into `features`, `components`, `lib`, or `server`.

## Directory Layout

```text
apps/web/
|-- src/app/                 # Next App Router pages, layout, and route handlers
|-- src/components/          # Shared UI primitives and app-level components
|-- src/features/            # Feature-owned components, hooks, lib, types, styles
|-- src/lib/                 # Small browser-safe shared helpers
|-- src/server/chem/         # Server-only chemistry facade, DTOs, route helpers
+-- tests/                   # Vitest route, hook helper, and utility tests
```

## Module Organization

- `src/app/page.tsx` wires the playground shell; avoid moving domain details back into the page.
- `src/app/api/**/route.ts` should parse, call a server helper, and serialize a response.
- `src/server/chem/*` owns upstream chemistry service calls, session guard, route responses, request parsing, and server DTOs.
- `src/features/*` owns UI workflows such as editor, preview, OCR, chemistry editor, and export.
- `src/components/ui/*` contains shared Radix/shadcn-style primitives.

## Examples

- `apps/web/src/app/page.tsx` composes editor, OCR, DOCX export, preview, and chemistry editor flows.
- `apps/web/src/app/api/chem/render/route.ts` is a thin route that delegates parsing and rendering work.
- `apps/web/src/server/chem/request-parsers.ts` centralizes request body narrowing.
- `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts` owns one UI workflow.

## Anti-Patterns

- Do not put reusable route parsing or response helpers inside an individual route file.
- Do not import server-only modules into client components or hooks.
- Do not put feature-specific UI in `src/components/ui`; keep it under `src/features/<feature>`.
