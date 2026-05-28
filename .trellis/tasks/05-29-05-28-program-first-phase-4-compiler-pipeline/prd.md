# Phase 4: Compiler Pipeline Replacement

## Goal

Replace compiler and CLI integration points that still assume legacy
`ChemdDocument.children` with program-first `ChemdProgramDocument` contracts.

## Scope

- `packages/compiler/src/index.ts`
  - Update `CompileResult` to expose `program` as the compiler document.
  - Run the program-first pipeline:
    `parseChemdProgram -> resolveChemd -> typecheckProgram`.
  - Keep downstream renderer/export/LNF calls compiling with the current
    downstream package contracts until Phase 5 replaces those packages.
- `packages/compiler/src/diagnosis.ts`
- `packages/compiler/src/quick-fix.ts`
- `packages/compiler/src/repair-loop.ts`
- `packages/compiler/src/agent-loop.ts`
- `packages/compiler/src/authoring-*.ts`
  - Move authoring and repair targeting from legacy node/block assumptions
    toward declaration/field/doc ids.
- `packages/cli/src/cli.ts`
  - Report program declaration counts and program diagnostics where CLI output
    currently describes document/body semantics.
- `packages/compiler/tests/*`
  - Replace or add focused program compiler tests and remove compiler tests
    that depend on `:::` or `document.children`.

## Boundaries

- Do not modify root `docs/`.
- Do not add legacy AST adapters or automatic `:::` lowering.
- Do not rewrite renderer/export/LNF packages in this phase except for narrow
  compile fallout required to keep compiler tests meaningful. Those packages
  are Phase 5.
- Prefer explicit TODO-free failing boundaries over hidden compatibility paths.

## Verification

- `pnpm --filter @chemd/compiler test`
- `pnpm --filter @chemd/compiler typecheck`
- `pnpm --filter @chemd/cli test`
- `pnpm --filter @chemd/cli typecheck`
- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/resolver test`
- `pnpm --filter @chemd/typechecker test`
- CLI smoke for program fixture:
  `pnpm chemd validate packages/compiler/fixtures/program-golden-suzuki-screen.chemd`
- `git diff --check`
