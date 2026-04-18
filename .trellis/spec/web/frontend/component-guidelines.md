# Component Guidelines - @chemd/web

## Overview

Components are functional React components with explicit props. Use `"use client"` only when the component uses state, effects, browser APIs, event handlers, or client-only libraries.

## Component Structure

- Define a local `Props` interface for non-trivial props.
- Keep shared primitives in `src/components/ui` and feature components in `src/features/<feature>/components`.
- Compose feature flows in the page, but keep workflow details inside feature hooks/components.
- Export named components unless the file is an App Router page or layout.

## Props Conventions

```tsx
interface EditorShellProps {
  source: string;
  lineCount: number;
  toolbarActions?: ReactNode;
  statusMessage?: string | null;
  onSourceChange?: (nextSource: string) => void;
}
```

Follow `apps/web/src/features/editor/components/EditorShell.tsx`: props are explicit, optional callbacks are optional, and nullable UI messages use `string | null`.

## Styling Patterns

- Use Tailwind utility classes and `cn` from `apps/web/src/lib/utils.ts` for class merging.
- Shared primitives may use `class-variance-authority`, as in `apps/web/src/components/ui/button.tsx`.
- Feature-specific CSS belongs under the feature, such as `features/playground/styles/playground.css`.
- Keep layout-stable dimensions for editor, preview, dialogs, top bars, and icon buttons.

## Accessibility

- Buttons that trigger hidden behavior need clear labels, as `CopyIconButton` and OCR import controls do.
- Dialog components should use Radix primitives from `src/components/ui/dialog.tsx`.
- Error markup that users must notice should include `role="alert"` or `aria-live`, as preview render errors do.

## Examples

- `apps/web/src/components/ui/button.tsx` for shared primitive style variants.
- `apps/web/src/features/editor/components/EditorShell.tsx` for typed feature shell props.
- `apps/web/src/app/page.tsx` for composition of feature hooks and components.

## Common Mistakes

- Do not move server calls or parsing logic into presentational components.
- Do not create feature components in `src/components/ui`.
- Do not mark a server-safe component with `"use client"` unless it truly needs client runtime behavior.
