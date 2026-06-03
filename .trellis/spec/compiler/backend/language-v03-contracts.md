# Chemd Program v1 Pipeline Contracts

Status: Aligned with the program-first compiler architecture after the
program-first rewrite. The file path is retained for existing links, but the
contract described here is `chemd/program-v1`, not the older language v0.3
surface.

## Scenario: Program-First Compile Pipeline

- Trigger: `compileChemd(source)` receives Chemd program-v1 source.
- Primary parser output: `ChemdProgramDocument` with
  `schemaVersion: "chemd-program-ast/v1"` and
  `sourceLanguage: "chemd/program-v1"`.
- Pipeline order: parse -> resolve -> typecheck -> render profile -> run plan ->
  runtime preflight -> LNF -> training/RAG/understanding -> authoring
  diagnostics -> compiler diagnosis -> HTML/JSON/DOCX bridge.
- Full compile remains the source-of-truth oracle for future project graph,
  diff, and incremental compilation work.

## Public Entry Points

```ts
parseChemdProgram(source: string, options?: ParseChemdProgramOptions): ChemdProgramDocument

resolveChemd(program: ChemdProgramDocument): ChemdProgramDocument

typecheckProgram(program: ChemdProgramDocument, options?: TypecheckOptions): TypecheckResult

compileChemd(source: string, options?: CompileOptions): CompileResult
```

`parseChemd` is a compatibility alias to `parseChemdProgram`. New compiler work
should use `ChemdProgramDocument` as the AST boundary and should not introduce a
parallel Markdown or block-schema document contract.

## CompileResult Contract

`CompileResult` currently includes:

- `program`: the final program document with merged diagnostics.
- `diagnostics`: final diagnostics from parse, resolve, typecheck, render
  profile, authoring, and compiler stages.
- `renderOptions` and `renderAdapterPayload`: resolved render profile outputs.
- `typedSemanticGraph` and `stepGraph`: semantic and procedure facts from
  typechecking.
- `runPlan` and `runtimePreflight`: runtime planning and capability checks.
- `lnf`: canonical language-neutral fact output.
- `trainingExport`, `ragExport`, and `trainingUnderstanding`: training and RAG
  records derived from the typed program.
- `authoringAssistance` and `diagnosis`: deterministic authoring and diagnostic
  grouping surfaces.
- `html`, `json`, and `docxBridge`: renderer outputs.

## Diagnostic Rules

- Each stage appends diagnostics rather than replacing earlier diagnostics.
- Parser diagnostics should preserve enough AST for downstream diagnostics when
  recovery is possible.
- Resolver diagnostics should not drop unrelated declarations.
- Typechecker diagnostics should include source layer, node/source fields, and
  facts when available.
- Compiler diagnosis and quick fixes must be derived from diagnostics and safe
  fix metadata, not a separate validation truth source.

## Runtime and Export Rules

- Runtime packages remain pure contract packages. They may model run plans,
  preflight checks, lab state, trace events, replay, snapshots, and checkpoints,
  but must not own database IO.
- Export packages consume program and typed graph facts from the compiler
  pipeline. They must not duplicate parser logic.
- Storage packages may define persistence-ready records, revisions, and memory
  loop projections, but they should consume normalized compiler/export facts.

## Future Phase Gates

- Phase 1: harden public program-first exports.
- Phase 2: improve parser recovery and source-map coverage.
- Phase 3: promote workspace references into a project graph.
- Phase 4: deepen type constraints and normalized semantic facts.
- Phase 5: broaden diagnostics and headless safe fixes.
- Phase 6: extend runtime state into stack/checkpoint/replay semantics.
- Phase 7: unify diff layers and incremental compile.
- Phase 8: align exports, storage, and memory-loop diffs.
- Phase 9: close CLI/docs/release validation.
