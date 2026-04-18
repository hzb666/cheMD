# Type Safety - @chemd/compiler

## Overview

Types exported from `@chemd/compiler` are part of the frontend consumption contract. Keep them explicit, narrow, and aligned with `@chemd/core`.

## Rules

- Reuse `@chemd/core` AST and diagnostic types instead of redefining them.
- Use discriminated unions for document nodes and route-like payloads.
- Use `unknown` at external boundaries, then narrow with local guards.
- Use `Record<string, unknown>` for extension points only when the schema is intentionally open.

## Examples

- `packages/core/src/ast.ts` defines discriminated `ChemdNode` and structured node contracts.
- `packages/renderer-docx/src/index.ts` exports `DocxBridgePayload` for downstream consumers.
- `packages/exporter-training/src/types.ts` defines schema-versioned export payloads.

## Common Mistakes

- Do not widen public APIs to `any` to satisfy one caller.
- Do not expose partially validated objects as trusted domain types.
- Do not change field names without updating parser, resolver, renderers, compiler tests, and web consumers.
