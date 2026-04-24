# Frontend Directory Structure - @chemd/renderer-json

## Overview

This package is consumed by frontend code but does not own React directories. Keep it framework-agnostic.

## Layout

```text
packages/renderer-json/
|-- src/        # pure TypeScript public and internal APIs
+-- tests/      # Vitest tests for package behavior
```

## Frontend Integration Points

- `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts` calls `compileChemd` from `@chemd/compiler`.
- `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts` hydrates renderer HTML through stable `data-*` attributes.
- `apps/web/src/app/next.config.ts` transpiles workspace packages needed by the Next app.

## Rules

- Do not add `components`, `hooks`, or React context directories here.
- Keep browser-safe exports free of Node-only APIs.
- Put Node-only APIs behind explicit subpath exports, as `@chemd/compiler/node` does.
