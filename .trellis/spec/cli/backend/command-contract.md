# Command Contract - @chemd/cli

## Commands

```text
pnpm chemd validate <file...> [--dry-run]
pnpm chemd check <path...> [--target validate|run-plan|training|graph] [--format text|json] [--dry-run]
pnpm chemd export <file> --format json|lnf|rag|training|training-full
pnpm chemd graph <file...> [--format text|json]
pnpm chemd diff <old-file> <new-file> [--format text|json]
pnpm chemd changed [--base <ref>] [--format text|json]
pnpm chemd repair <file> [--format text|json] [--max-iterations <n>] [--write]
pnpm chemd agent-loop <file> --driver <cmd> [--driver-arg <arg> ...] [--format text|json] [--max-iterations <n>] [--max-repair-iterations <n>] [--write]
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

`agent-loop` follows the same exit shape:

- `0`: agent loop reached `finalDiagnosis.status === "clean"`.
- `1`: agent loop stopped with remaining unresolved work
  (`needs_author_input`, `manual_review`, `mixed`, `fixable`,
  `max_iterations`, `repair_max_iterations`, `repair_stalled`,
  or `agent_stalled`).
- `2`: invalid CLI usage, unreadable files, driver failure, write failure, or runtime failure.

Usage errors print the usage block to stderr. Runtime and Git failures print the
error message without the usage block.

## Diagnostic Boundaries

- `validate` writes diagnostic summaries to stdout.
- `check` recursively discovers `.chemd` and `.chemd.md` files under directory
  arguments, validates with the current language contract, and writes a
  deterministic text or JSON batch report to stdout. `--dry-run` is accepted for
  CLI consistency and guarantees the command will not write source files.
- `export` and `diff` must not write business payloads to stdout if any input
  has error diagnostics; they write diagnostics to stderr and return `1`.
- `graph` follows the same validation boundary as `export`: if any input file
  has error diagnostics, it writes diagnostics to stderr and suppresses graph
  payload output.
- Warnings and info diagnostics do not fail commands by themselves.
- `changed` validates current files. Deleted files skip current validation.
- `repair` writes its report payload to stdout even when it exits `1`, because
  the report itself is the command output.
- `agent-loop` also writes its report payload to stdout even when it exits `1`,
  because the loop report is the command output.

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

`graph --format json` emits:

```text
schema_version: "chemd-training-graph-index/v0.1"
index_scope: {
  document_ids: string[]
  sources: Array<{
    document_id: string
    file_path?: string
    commit?: string
    content_hash?: string
  }>
}
nodes: TrainingGraphIndexNodeV1[]
edges: TrainingGraphIndexEdgeV1[]
reaction_features: TrainingReactionGraphFeatureV1[]
reaction_clusters: TrainingReactionClusterV1[]
reaction_similarity_edges: TrainingReactionSimilarityEdgeV1[]
warnings: string[]
```

Text mode prints counts plus the first reaction clusters. The command is a
compiled projection over existing document facts; it must not require graph- or
cluster-specific author syntax.

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

`agent-loop --format json` emits:

```text
schemaVersion: "chemd-agent-loop/v0.1"
filePath: string
changed: boolean
maxIterations: number
maxRepairIterations: number
stoppedReason: "clean" | "needs_author_input" | "manual_review" | "mixed" | "fixable" | "max_iterations" | "repair_max_iterations" | "repair_stalled" | "agent_stalled"
writeRequested: boolean
wroteFile: boolean
finalDiagnosis: CompilerDiagnosis
finalSource: string
iterations: Array<{
  iteration: number
  repairStoppedReason: ChemdRepairLoopResult["stoppedReason"]
  repairDiagnosisStatus: CompilerDiagnosis["status"]
  summary: CompilerDiagnosis["summary"]
  appliedSafeFixes: Array<{
    fixId: string
    diagnosticCode: string
    sourceNodeId?: string
    sourceField?: string
    title: string
  }>
  agentResponse?: {
    action: "rewrite" | "stop"
    changedSource: boolean
    note?: string
  }
}>
```

## Check Command

`check --format json` emits:

```text
schemaVersion: "chemd-check/v0.1"
dryRun: boolean
target: "validate" | "run-plan" | "training" | "graph"
totals: { error: number; warning: number; info: number }
files: Array<{
  filePath: string
  counts: { error: number; warning: number; info: number }
  diagnostics: Diagnostic[]
}>
```

P0 `check` uses the same validation semantics for all accepted targets. Later
target-specific passes may add stricter target requirements, but they must keep
the schema and exit-code contract stable.

## Repair Command

- `repair` must reuse `runChemdRepairLoop(source, ...)` with the current
  language contract; do not require an author-selectable language mode.
- `--max-iterations` must be a positive integer.
- `--write` only persists the repaired source when the final diagnosis is
  `clean`; partially repaired but unresolved source remains in the report only.
- Text mode prints a human summary; if the final diagnosis is `clean`, the
  source changed, and `--write` is absent, it also prints the repaired source.

## Agent Loop Command

- `agent-loop` must reuse `runChemdAgentLoop(source, ...)` with the current
  language contract; do not require an author-selectable language mode.
- `agent-loop` must create the external driver with `spawnSync(command, args, { shell: false })`; do not shell-join user-provided values.
- `--driver` is required and names the executable to launch.
- `--driver-arg` is repeatable and appends raw argv entries after the driver command.
- `--max-iterations` and `--max-repair-iterations` must be positive integers.
- `--write` only persists the final source when the final diagnosis is `clean`.
- Text mode prints a human summary; if the final diagnosis is `clean`, the source changed, and `--write` is absent, it also prints the final source.

Driver stdin payload:

```text
schemaVersion: "chemd-agent-driver-request/v0.1"
filePath: string
iteration: number
source: string
diagnosis: CompilerDiagnosis
diagnostics: Diagnostic[]
repair: {
  changed: boolean
  finalDiagnosis: CompilerDiagnosis
  stoppedReason: ChemdRepairLoopResult["stoppedReason"]
  totalAppliedSafeFixCount: number
}
history: Array<{
  iteration: number
  diagnosisStatus: CompilerDiagnosis["status"]
  repairStoppedReason: ChemdRepairLoopResult["stoppedReason"]
  safeFixCount: number
  agentAction?: "rewrite" | "stop"
  agentChangedSource?: boolean
  agentNote?: string
}>
```

Driver stdout response:

```text
schemaVersion: "chemd-agent-driver-response/v0.1"
action: "rewrite" | "stop"
nextSource?: string   # required when action === "rewrite"
note?: string
```
