# Chemd CLI MVP

## Goal

Expose the existing `compileChemd()` pipeline through a small local CLI so Git,
CI, and LLM workflows can validate and export `.chemd.md` documents without
going through the web playground.

## Requirements

- Add a command that validates one or more source files by running
  `compileChemd(source, { strictChemdKind: true })`.
- Add a command that exports a compiled document as `json`, `lnf`, or
  `training` payload.
- Keep the implementation local and lightweight; avoid Git merge drivers,
  GitHub bot behavior, and new third-party dependencies.
- Provide deterministic stdout output and meaningful non-zero exit codes for
  invalid usage, unreadable files, and documents with error diagnostics.
- Add focused tests for CLI argument handling, validation, export formats, and
  failure behavior.
- Add a lightweight semantic diff command that compares compiled object nodes by
  stable `type + id` and reports added, removed, and changed fields.
- Add a Git working-tree command that discovers changed `.chemd.md` files,
  validates current files, and emits semantic diffs when a base version exists.
- Promote the CLI from root `scripts/` into a first-class `packages/cli`
  workspace package once the command surface is stable.

## Acceptance Criteria

- [x] `pnpm chemd validate <file>` reports diagnostics and exits `0` when no
      error diagnostics exist.
- [x] `pnpm chemd validate <file>` exits non-zero when compile diagnostics
      include at least one error.
- [x] `pnpm chemd export <file> --format json|lnf|training` writes valid JSON
      to stdout.
- [x] CLI tests cover success, compile-error, unsupported format, and missing
      file paths.
- [x] Root scripts expose a convenient `pnpm chemd` entry only if it can be done
      without adding dependencies.
- [x] `pnpm chemd diff <old-file> <new-file>` prints a stable human-readable
      summary of semantic object changes.
- [x] `pnpm chemd diff <old-file> <new-file> --format json` emits parseable JSON
      for downstream LLM/Git tooling.
- [x] CLI diff tests cover added, removed, changed, and no-change cases.
- [x] `pnpm chemd changed [--base HEAD]` discovers changed `.chemd.md` files
      from Git and validates current files.
- [x] `pnpm chemd changed --format json` emits parseable JSON with validation
      counts and semantic diff payloads.
- [x] CLI changed tests cover modified, untracked, invalid, and no-change cases.
- [x] CLI implementation and Vitest coverage live in `packages/cli`, and root
      `pnpm chemd` delegates to the package bin wrapper.
- [x] Error diagnostics make `validate`, `export`, `diff`, and `changed` return
      non-zero without emitting successful payloads.
- [x] `changed` handles tracked added, untracked, deleted, renamed, invalid, and
      no-change files.
- [x] CLI command contract is captured in `.trellis/spec/cli/backend`.

## Technical Notes

- This is a backend/tooling task.
- The first MVP lived under root `scripts/`; the stabilized implementation now
  lives under `packages/cli`.
- Reuse `@chemd/compiler` as the only source of semantic truth.
- Do not persist generated exports in the repository during this task.
- Keep the package private until distribution requirements are explicit.

## Command Contract

```text
pnpm chemd validate <file...>
pnpm chemd export <file> --format json|lnf|training
pnpm chemd diff <old-file> <new-file> [--format text|json]
pnpm chemd changed [--base <ref>] [--format text|json]
```

Exit behavior:

- `0`: command ran successfully and no error diagnostics were found.
- `1`: source compiled but validation found at least one error diagnostic.
- `2`: invalid CLI usage, unsupported format, unreadable file, or unexpected
  runtime failure.

Changed command matrix:

- Good: modified tracked files validate and include semantic diffs against
  `--base`.
- Base: tracked added and untracked files validate but report
  `semantic diff: new file`.
- Base: deleted files skip validation and report `semantic diff: deleted file`.
- Bad: current files with error diagnostics make the command exit `1`.

Semantic diff matrix:

- Good: object field changes are reported by `type`, `id`, and field name.
- Base: no semantic object changes prints `No semantic changes.` and exits `0`.
- Bad: missing IDs are ignored for MVP rather than guessed from node index.
- Out of scope: Git refs, three-way merge, field-level source spans, and
  text-only Markdown diff.

Validation matrix:

- Good: valid canonical `:::chemd kind: ...` source validates and export emits
  parseable JSON.
- Base: warnings are printed but do not fail validation.
- Base: strict missing `kind:` warnings are printed but do not fail validation.
- Bad: invalid `kind:` error diagnostics fail validation.
