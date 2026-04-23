# Error Handling - @chemd/compiler

## Overview

Prefer explicit diagnostics and typed return values over thrown errors for document problems. Throw only for impossible local invariants or Node IO failures that cannot be represented in a `ChemdDocument`.

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
- Compiler may append compile-only authoring diagnostics after semantic export when it detects LLM/generated-record gaps; these must still surface through `CompileResult.diagnostics` instead of a side channel.
- Compiler may derive a machine-readable `CompileResult.diagnosis` view from final diagnostics, but that view must be computed from diagnostics/quick fixes rather than inventing a second validation channel with divergent truth.
- Compiler repair loops must stay deterministic: they may apply only compiler-declared safe fixes and must stop with typed status/reason when authored facts or manual rewrites are still required.

## Examples

- `packages/parser/src/frontmatter/parse-frontmatter.ts` records invalid YAML/frontmatter diagnostics and still returns a document body.
- `packages/resolver/src/index.ts` reports duplicate ids, unresolved references, template cycles, and expansion limits without dropping unrelated content.
- `packages/render-profile/src/index.ts` reports invalid profile values and clamps unsafe numeric options.
- `packages/compiler/src/authoring-diagnostics.ts` turns conservative authoring suggestions into actionable compile diagnostics and leaves non-conservative scaffolds out of diagnostics.
- `packages/compiler/src/diagnosis.ts` classifies final diagnostics into safe fixes, required inputs, and manual-review items for automated compile-fix-recompile loops.
- `packages/compiler/src/repair-loop.ts` runs bounded compile-fix-recompile loops and must stop before pretending an unresolved document is clean.

## Throwing Rules

Throw only when the caller cannot continue safely:

- `packages/render-profile/src/index.ts` throws if the built-in default profile cannot resolve.
- `packages/compiler/src/node.ts` throws for invalid `.docx` paths, missing Pandoc, timeout, or missing output file.

## Common Mistakes

- Do not swallow invalid input silently.
- Do not convert warnings into thrown exceptions unless the API contract explicitly says it fails hard.
- Do not invent a new diagnostic code without adding tests that assert the exact code.
