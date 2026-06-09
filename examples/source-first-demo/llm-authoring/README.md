# LLM Source-First Authoring Demo

This demo keeps the authoring surface as Chemd source. The LLM generates or
repairs `.chemd` text; compiler diagnostics decide whether the source is valid.
RAG is intentionally out of scope for this demo.

## 1. Natural language to Chemd source

Use a real OpenAI-compatible endpoint:

```powershell
$env:OPENAI_API_KEY = "..."
$env:CHEMD_LLM_MODEL = "gpt-4.1-mini"
node examples\source-first-demo\llm-authoring\nl-to-chemd.mjs `
  examples\source-first-demo\llm-authoring\001-simple-suzuki\input.txt `
  > $env:TEMP\draft.chemd
```

For deterministic local demos, mock the LLM output:

```powershell
$env:CHEMD_LLM_MOCK_OUTPUT = Get-Content examples\source-first-demo\llm-authoring\001-simple-suzuki\output.chemd -Raw
node examples\source-first-demo\llm-authoring\nl-to-chemd.mjs `
  examples\source-first-demo\llm-authoring\001-simple-suzuki\input.txt `
  > $env:TEMP\draft.chemd
Remove-Item Env:\CHEMD_LLM_MOCK_OUTPUT
```

The script writes only Chemd source. It rejects JSON-shaped output and strips
markdown fences.

## 2. Compiler validation and deterministic repair

```powershell
pnpm chemd validate $env:TEMP\draft.chemd
pnpm chemd repair $env:TEMP\draft.chemd --format text
```

`repair` is the user-facing alias for the existing deterministic `fix` command.

## 3. LLM repair from diagnostics

```powershell
pnpm chemd agent-loop $env:TEMP\draft.chemd `
  --driver node `
  --driver-arg examples\source-first-demo\llm-driver\chemd-source-repair-driver.mjs `
  --format text
```

For offline demos of the repair loop:

```powershell
pnpm chemd agent-loop examples\source-first-demo\llm-authoring\006-syntax-repair\bad.chemd `
  --driver node `
  --driver-arg examples\source-first-demo\llm-driver\mock-source-repair-driver.mjs `
  --format text

pnpm chemd agent-loop examples\source-first-demo\llm-authoring\007-reference-repair\bad.chemd `
  --driver node `
  --driver-arg examples\source-first-demo\llm-driver\mock-source-repair-driver.mjs `
  --format text
```

## 4. Validate bundled source-first examples

```powershell
Get-ChildItem examples\source-first-demo\llm-authoring -Recurse -File -Include output.chemd,repaired.chemd |
  Sort-Object FullName |
  ForEach-Object { pnpm chemd validate $_.FullName }
```

The examples include missing fields, failed reactions, condition screens,
syntax repair, reference repair, and symbolic temperature values such as `rt`,
`reflux`, `"room temperature"`, and `"ice bath"`.

## 5. Workspace graph and cross-document references

The graph demo is separate from LLM authoring:

```powershell
node examples\source-first-demo\scripts\demo-workspace-graph.mjs --out $env:TEMP\chemd-workspace-graph.html
```

Open the generated HTML to inspect document-internal and cross-document graph
edges across the default 10-document graph workspace, including the real
SI-derived Suzuki-Miyaura records.

## 6. Optional semantic diff

```powershell
pnpm chemd diff examples\source-first-demo\demo-diff\attempt-a.chemd `
  examples\source-first-demo\demo-diff\attempt-b.chemd `
  --format text
```
