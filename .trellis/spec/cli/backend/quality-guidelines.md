# Quality Guidelines - @chemd/cli

## Required Checks

- `pnpm --filter @chemd/cli test`
- `pnpm --filter @chemd/cli typecheck`
- `pnpm --filter @chemd/cli build`
- For broad changes, also run root `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  and `pnpm build`.

## Code Standards

- Keep CLI IO boundaries explicit: stdout for successful command output, stderr
  for usage/runtime failures and validation failures that suppress payloads.
- Use Git argument arrays only; never shell-join user-provided values.
- Keep `--base` validation strict because it is passed before Git pathspecs.
- Keep local TypeScript loader behavior covered by at least one bin smoke test.
- Prefer typed helpers over ad hoc string parsing when command behavior grows.

## Tests

Cover these cases for every CLI command touched:

- Good: valid source and expected stdout payload.
- Base: warnings or empty/no-change inputs.
- Bad: unsupported options, missing option values, unreadable files, error
  diagnostics, Git failures, and runtime loader path regressions.
- Git: modified, tracked added, untracked, deleted, renamed, invalid current
  files, and no changed files.

## Anti-Patterns

- Do not duplicate parser/compiler validation in the CLI.
- Do not emit JSON payloads on stdout when returning `EXIT_VALIDATION_FAILED`.
- Do not silently ignore options that are unsupported for a command.
- Do not infer semantic object identity from node order.
