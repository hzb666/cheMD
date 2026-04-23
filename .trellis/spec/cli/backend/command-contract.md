# Command Contract - @chemd/cli

## Commands

```text
pnpm chemd validate <file...>
pnpm chemd export <file> --format json|lnf|rag|training|training-full
pnpm chemd diff <old-file> <new-file> [--format text|json]
pnpm chemd changed [--base <ref>] [--format text|json]
pnpm chemd repair <file> [--format text|json] [--max-iterations <n>] [--write]
```

## Exit Codes

- `0`: command ran successfully and no error diagnostics were found.
- `1`: source compiled but at least one relevant document has an error
  diagnostic.
- `2`: invalid CLI usage, unreadable files, Git/runtime failure, or unexpected
  failure.

`repair` narrows the meaning of exit `1`:

- `0`: repair loop reached `finalDiagnosis.status === "clean"`.
- `1`: repair loop stopped with remaining unresolved work
  (`needs_author_input`, `manual_review`, `mixed`, `fixable`,
  `max_iterations`, or `stalled`).
- `2`: invalid CLI usage, unreadable files, write failure, or runtime failure.

Usage errors print the usage block to stderr. Runtime and Git failures print the
error message without the usage block.

## Diagnostic Boundaries

- `validate` writes diagnostic summaries to stdout.
- `export` and `diff` must not write business payloads to stdout if any input
  has error diagnostics; they write diagnostics to stderr and return `1`.
- Warnings and info diagnostics do not fail commands by themselves.
- `changed` validates current files. Deleted files skip current validation.
- `repair` writes its report payload to stdout even when it exits `1`, because
  the report itself is the command output.

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

`repair --format json` emits:

```text
schemaVersion: "chemd-repair/v0.1"
filePath: string
changed: boolean
maxIterations: number
stoppedReason: "clean" | "needs_author_input" | "manual_review" | "mixed" | "fixable" | "max_iterations" | "stalled"
writeRequested: boolean
wroteFile: boolean
finalDiagnosis: CompilerDiagnosis
finalSource: string
iterations: Array<{
  iteration: number
  diagnosisStatus: CompilerDiagnosis["status"]
  summary: CompilerDiagnosis["summary"]
  appliedSafeFixes: Array<{
    fixId: string
    diagnosticCode: string
    sourceNodeId?: string
    sourceField?: string
    title: string
  }>
}>
```

## Repair Command

- `repair` must reuse `runChemdRepairLoop(source, { compileOptions: { strictChemdKind: true } })`.
- `--max-iterations` must be a positive integer.
- `--write` only persists the repaired source when the final diagnosis is
  `clean`; partially repaired but unresolved source remains in the report only.
- Text mode prints a human summary; if the final diagnosis is `clean`, the
  source changed, and `--write` is absent, it also prints the repaired source.
