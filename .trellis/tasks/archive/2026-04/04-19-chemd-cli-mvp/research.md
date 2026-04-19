# Research: Chemd CLI MVP

## Relevant Specs

- `.trellis/spec/compiler/backend/index.md`: `@chemd/compiler` is the public
  orchestration API; downstream tools must not duplicate parsing or validation.
- `.trellis/spec/compiler/backend/error-handling.md`: document problems remain
  diagnostics; CLI maps error diagnostics to exit code `1`.
- `.trellis/spec/compiler/backend/quality-guidelines.md`: add focused tests for
  behavior changes and keep command behavior deterministic.
- `.trellis/spec/compiler/backend/language-v03-contracts.md`: export `json`,
  `lnf`, and `training` from the canonical `compileChemd()` result.
- `.trellis/spec/cli/backend/command-contract.md`: CLI command surface, exit
  codes, JSON schemas, Git changed behavior, and semantic diff identity rules.
- `.trellis/spec/cli/backend/quality-guidelines.md`: CLI validation commands and
  required good/base/bad coverage.
- `.trellis/spec/guides/code-reuse-thinking-guide.md`: search existing scripts
  first and follow their patterns.
- `.trellis/spec/guides/cross-layer-thinking-guide.md`: data flow is
  source file -> compiler -> CLI serialization -> Git/LLM consumer.

## Code Patterns Found

- `scripts/audit-legacy-surface-usage.mjs`: simple Node CLI with exported core
  function and direct `process.argv` entrypoint.
- `scripts/migrate-legacy-surface-to-chemd.mjs`: script-level file IO with
  deterministic stdout output.
- `scripts/legacy-surface-tools.test.mjs`: root script tests use `node:test` and
  `node:assert/strict`.
- `apps/web/src/server/chem/json-export.ts`: strict JSON export already calls
  `compileChemd(source, { strictChemdKind: true })`.

## Files Modified

- `packages/cli/src/cli.ts`: CLI command implementation.
- `packages/cli/src/ts-loader.mjs`: local TS loader so plain Node can import
  workspace TypeScript packages without a bundling step.
- `packages/cli/src/semantic-diff.ts`: semantic diff builder for compiled
  documents, comparing stable object nodes by `type + id`.
- `packages/cli/src/git-changed.ts`: Git working-tree discovery helpers for
  changed `.chemd.md` files and base ref source reads.
- `packages/cli/src/cli.spec.ts`: Vitest coverage for CLI behavior.
- `packages/cli/bin/chemd.mjs`: package bin wrapper for the root `pnpm chemd`
  entry.
- `package.json`: add the root `chemd` script and leave legacy script tests in
  `test:scripts`.
- `pnpm-lock.yaml`: register `@chemd/cli` as a workspace importer.

## Key Finding

`node -e "import('@chemd/compiler')"` fails under Node v24.13.1 because Node's
type stripping does not support `.ts` files under `node_modules`. The MVP should
avoid adding a new runtime dependency and instead register a local loader before
the CLI dynamically imports `@chemd/compiler`.

## Phase 4 Finding: Workspace Package

`pnpm-workspace.yaml` already includes `packages/*`, so promoting the CLI only
needs a new private `@chemd/cli` package plus a lockfile refresh. Turbo then
includes the package in `build`, `typecheck`, and `test` scopes.

The package keeps a small JavaScript bin wrapper because Node must register the
local TypeScript loader before importing `src/cli.ts`. The root `pnpm chemd`
script delegates to `node packages/cli/bin/chemd.mjs`, so existing local command
usage stays stable while the implementation has package ownership.

## Review Fix Findings

- `export` and `diff` share the same error-diagnostic failure boundary as
  `validate`: error diagnostics return `1`, suppress successful stdout payloads,
  and write diagnostics to stderr.
- `changed` treats tracked added files (`A`) the same as untracked files for base
  diff purposes: validate current contents, then report `new file`.
- Git failures with `status: null` are failures, not successful empty output.
- Command-specific option parsing prevents ignored options and missing option
  values from silently falling back to defaults.
- Resolver-generated default IDs match `<document-id>-<node-type>-<number>` and
  are ignored by CLI semantic diff so missing explicit IDs do not create
  unstable object identities.

## Phase 2 Finding: Semantic Diff

Use `compileChemd(source, { strictChemdKind: true }).document` as the diff input.
The stable MVP unit is a semantic object node with both `type` and `id`.

Traversal should recurse into `col.children` and `template.body`, then compare
these object node types:

- `molecule`
- `reaction`
- `result`
- `analysis`
- `procedure`
- `observation`
- `sample`

Ignored metadata fields:

- `type`
- `id`
- `syntaxOrigin`
- `declaredKind`

Out of scope for this phase:

- Markdown prose diff
- Git ref resolution
- three-way merge
- source-span reporting
- identity inference for nodes without an ID

## Phase 3 Finding: Git Changed Files

Use Git porcelain-safe commands with argument arrays, not shell-joined command
strings:

- `git diff --name-status -z --diff-filter=ACMRTD <base> -- "*.chemd.md"`
- `git ls-files --others --exclude-standard -z -- "*.chemd.md"`
- `git show <base>:<path>`

The changed command should normalize Git paths to `/`, dedupe by current path,
and keep these statuses:

- `M` / `A` / `C` / `R` / `T`: validate current file; diff against base when a
  base path exists.
- `?`: validate current file only; report `new file`.
- `D`: skip validation; report `deleted file`.

The command output is designed for two consumers:

- text: quick human review in terminal or PR logs.
- JSON: downstream LLM or Git automation.
