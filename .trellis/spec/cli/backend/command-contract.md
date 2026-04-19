# Command Contract - @chemd/cli

## Commands

```text
pnpm chemd validate <file...>
pnpm chemd export <file> --format json|lnf|training
pnpm chemd diff <old-file> <new-file> [--format text|json]
pnpm chemd changed [--base <ref>] [--format text|json]
```

## Exit Codes

- `0`: command ran successfully and no error diagnostics were found.
- `1`: source compiled but at least one relevant document has an error
  diagnostic.
- `2`: invalid CLI usage, unreadable files, Git/runtime failure, or unexpected
  failure.

Usage errors print the usage block to stderr. Runtime and Git failures print the
error message without the usage block.

## Diagnostic Boundaries

- `validate` writes diagnostic summaries to stdout.
- `export` and `diff` must not write business payloads to stdout if any input
  has error diagnostics; they write diagnostics to stderr and return `1`.
- Warnings and info diagnostics do not fail commands by themselves.
- `changed` validates current files. Deleted files skip current validation.

## Changed Command

- Modified tracked files validate current contents and include semantic diffs
  against `--base`.
- Tracked added files (`A`) and untracked files (`?`) validate current contents
  and report `semantic diff: new file`; they do not read from `--base`.
- Deleted files (`D`) skip validation and report `semantic diff: deleted file`.
- Renames (`R`) diff current contents against the previous path.
- `--base` must be non-empty and must not start with `-`.

## Semantic Diff

The semantic diff compares compiled object nodes by stable `type + id`.

- Compare object nodes only: molecule, reaction, result, analysis, procedure,
  observation, and sample.
- Ignore internal fields: `type`, `id`, `syntaxOrigin`, and `declaredKind`.
- Ignore resolver-generated default IDs that match
  `<document-id>-<node-type>-<number>`.
- Missing explicit IDs are ignored instead of being inferred from node order.

## JSON Schemas

`diff --format json` emits:

```text
schemaVersion: "chemd-semantic-diff/v0.1"
beforeDocumentId: string
afterDocumentId: string
changes: Array<added|removed|changed>
```

`changed --format json` emits:

```text
schemaVersion: "chemd-changed/v0.1"
base: string
files: Array<{
  path: string
  status: string
  previousPath?: string
  validation: ValidationReport | SkippedValidation
  diff?: SemanticDiff
}>
```
