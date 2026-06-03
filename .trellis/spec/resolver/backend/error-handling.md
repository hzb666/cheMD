# Error Handling - @chemd/resolver

## Overview

Prefer explicit diagnostics and typed return values over thrown errors for
document problems. Throw only for impossible local invariants or Node IO
failures that cannot be represented in a `ChemdProgramDocument`.

## Diagnostic Contract

Use `Diagnostic` from `@chemd/core`:

```ts
interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  position?: SourceRange;
  nodeId?: string;
}
```

## Patterns

- Parser errors should append diagnostics and keep parsing when possible.
- Resolver validation should append diagnostics and keep unrelated content renderable.
- Render profile failures should append diagnostics and fall back to `eln-default` when a requested profile is missing.
- Compiler code should merge diagnostics from each stage instead of replacing earlier diagnostics.

## Examples

- `packages/parser/src/program/parser.ts` records legacy syntax and malformed
  program diagnostics while still returning a `ChemdProgramDocument`.
- `packages/resolver/src/index.ts` reports duplicate ids and unresolved
  program references without dropping unrelated declarations.
- `packages/render-profile/src/index.ts` reports invalid profile values and clamps unsafe numeric options.

## Throwing Rules

Throw only when the caller cannot continue safely:

- `packages/render-profile/src/index.ts` throws if the built-in default profile cannot resolve.
- `packages/compiler/src/node.ts` throws for invalid `.docx` paths, missing Pandoc, timeout, or missing output file.

## Common Mistakes

- Do not swallow invalid input silently.
- Do not convert warnings into thrown exceptions unless the API contract explicitly says it fails hard.
- Do not invent a new diagnostic code without adding tests that assert the exact code.
