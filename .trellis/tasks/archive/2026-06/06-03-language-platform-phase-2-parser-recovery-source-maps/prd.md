# Phase 2: Parser Recovery and Source Maps

## Goal

Make the program-v1 parser recover more predictably from malformed field/value
syntax and make parser diagnostics/source spans refer to the full source
document, not only sliced value strings.

## Scope

- Improve recovery around missing field colons and malformed values.
- Preserve useful AST fields when a declaration has local syntax errors.
- Add parser tests for full-document source spans on nested value diagnostics.
- Add parser tests for field block recovery after a malformed field.
- Keep compiler behavior unchanged except for better parser diagnostics/spans.

## Non-Goals

- No docs/spec reads or edits.
- No IDE UI work.
- No language syntax expansion beyond recovery/source-map correctness.
- No broad parser rewrite.

## Acceptance Criteria

- Parser diagnostics produced while parsing field values are mapped to
  full-document source spans.
- A malformed field does not prevent later valid fields in the same block from
  being parsed when recovery is possible.
- Existing valid program fixtures still compile without error diagnostics.

## Verification

- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/parser typecheck`
- `pnpm --filter @chemd/compiler test -- language-fixture-matrix.test.ts`
- `git diff --check`
