# Logging Guidelines - @chemd/exporter-training

## Overview

Library packages should not log during normal execution. They return diagnostics, typed errors, or structured payloads to callers.

## Policy

- No `console.log`, `console.warn`, or `console.error` in package library paths.
- Use `Diagnostic[]` for document quality and validation issues.
- Use typed errors only for IO-oriented adapters such as `@chemd/compiler/node`.
- Web and service layers decide how to expose or log failures.

## Examples

- `packages/parser/src/index.ts` returns parse diagnostics on the document.
- `packages/resolver/src/index.ts` appends semantic diagnostics to the document.
- `packages/compiler/src/node.ts` includes Pandoc stderr in thrown error messages because that API is an explicit Node export.

## Forbidden Pattern

```ts
// Do not log from a renderer or parser helper.
console.warn('Unknown field', key);
```

Instead, push a diagnostic with a stable code such as `W_UNKNOWN_FIELD`.
