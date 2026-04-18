# Component Guidelines - @chemd/exporter-training

## Overview

`@chemd/exporter-training` should not define React components. UI components live in `apps/web/src/components` or `apps/web/src/features/*/components`.

## Renderer Markup Contract

Packages that output markup must emit stable strings that UI code can hydrate safely:

- Escape user-controlled text before writing HTML.
- Keep class names and `data-*` attributes stable when tests or preview hydration depend on them.
- Do not attach browser event handlers in package-rendered HTML.

## Examples

- `packages/renderer-html/src/shared.ts` centralizes HTML escaping and `data-chem-*` loading markup.
- `packages/renderer-html/tests/renderer-html.test.ts` asserts class and `data-*` contracts.
- `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts` reads renderer output and injects client-side preview bridge code.

## Anti-Patterns

```tsx
// Do not add React UI to packages/*.
export const PreviewCard = () => <div />;
```

Instead, export typed data or HTML from the package and render UI in `apps/web`.
