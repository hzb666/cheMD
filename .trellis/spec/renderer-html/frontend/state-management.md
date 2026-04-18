# State Management - @chemd/renderer-html

## Overview

Package code should avoid hidden UI state. State belongs to callers or explicit in-memory local variables scoped to a single function call.

## Rules

- Do not add global mutable UI state to package modules.
- Do not cache user document data in package globals.
- Keep fallback state visible in return values, diagnostics, or typed payload fields.
- If a cache is necessary, keep it in `apps/web/src/server/chem` or `services/chem-service` where lifetime and session boundaries are explicit.

## Examples

- `packages/resolver/src/index.ts` builds indexes per `resolveChemd` call instead of using shared globals.
- `packages/render-profile/src/index.ts` uses immutable built-in profile definitions and returns resolved options.
- `apps/web/src/server/chem/cas-resolution-cache.ts` is the correct layer for runtime cache behavior.
