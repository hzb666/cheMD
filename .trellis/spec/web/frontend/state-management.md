# State Management - @chemd/web

## Overview

Use local React state and feature hooks. There is no global client store in the current app. Keep server state behind route handlers and server helpers.

## Local State

- Use `useState` for active source, compile result, JSON export result, status messages, and open dialogs.
- Use `useRef` for mutable current values needed by async callbacks, such as latest editor source.
- Use `useMemo` for derived values like document id, session id, line count, bridge tokens, and base HTML.
- Use `useDeferredValue` and `startTransition` for compile and preview responsiveness.

## Server State

- Browser code calls Next routes such as `/api/export/json` and `/api/chem/render`.
- Server-only helpers in `src/server/chem` call the chemistry service and manage session/caching contracts.
- Do not call `CHEM_SERVICE_BASE_URL` directly from browser code.

## Narrow Event Bridges

- For narrow, time-sensitive client sync across distant UI branches, prefer a small `window` event bridge over introducing a global store.
- `apps/web/src/lib/theme-sync-events.ts` defines the theme sync contract for the playground shell:
  - request event: `PREVIEW_THEME_SYNC_REQUEST_EVENT`
  - ack event: `PREVIEW_THEME_SYNC_ACK_EVENT`
  - iframe ack message: `PREVIEW_THEME_SYNC_ACK_MESSAGE_TYPE`
- Request/ack payloads must keep the exact fields:
  - `requestId: string`
  - `theme: "light" | "dark"`
- `apps/web/src/components/theme-toggle.tsx` is the owner of theme switch intent and timeout fallback.
- `apps/web/src/features/preview/components/DocumentPreview.tsx` is the owner of forwarding the requested theme into the sandboxed preview iframe and returning a local ack on the next animation frame.
- Keep this pattern scoped. Do not turn `window` events into a general-purpose state bus.

## Examples

- `apps/web/src/features/playground/hooks/usePlaygroundDocumentController.ts` is the reference for editor source, compile result, JSON export state, and status state.
- `apps/web/src/features/chem-editor/hooks/useChemdEditFlow.ts` is the reference for modal edit state and source write-back.
- `apps/web/src/server/chem/structure-store.ts` and related server helpers define runtime structure state boundaries.
- `apps/web/src/components/theme-toggle.tsx` and `apps/web/src/features/preview/components/DocumentPreview.tsx` are the reference pair for one-shot request/ack synchronization between the page shell and the preview iframe.

## Common Mistakes

- Do not add a global store before a feature has cross-tree state pressure.
- Do not keep document source in both a component and a hook without a single write path.
- Do not mutate compiled document objects in place; derive next values and set state.
- Do not use `window` events without a small typed payload contract and a timeout escape hatch.
