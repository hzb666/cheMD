# Chemd Source-First Demo

This folder contains the complete source-first demo set:

- `docs/llm-chemd-guide.md`: minimal LLM authoring guide.
- `llm-authoring/`: NL to Chemd source examples and repair fixtures.
- `llm-driver/`: LLM and mock source-repair drivers for `agent-loop`.
- `demo-diff/`: semantic diff input pair.
- `reaction-flight-deck/`: cross-document reference and graph demo workspace,
  including real SI-derived Suzuki-Miyaura source documents.
- `workspace-graph/`: generated interactive graph viewer with document,
  procedure-sequence, material-flow, and full-entity views.
- `scripts/`: local demo and verification scripts.

Run the source-first authoring demo:

```powershell
node examples\source-first-demo\scripts\demo-llm-authoring.mjs
```

Generate the cross-document graph viewer:

```powershell
node examples\source-first-demo\scripts\demo-workspace-graph.mjs `
  --out examples\source-first-demo\workspace-graph\workspace-graph.html
```

Validate the LLM authoring fixtures:

```powershell
Get-ChildItem examples\source-first-demo\llm-authoring -Recurse -File -Include output.chemd,repaired.chemd |
  ForEach-Object { pnpm --silent chemd validate $_.FullName }
```

Validate the cross-document graph workspace:

```powershell
pnpm --silent chemd check `
  examples\source-first-demo\reaction-flight-deck\shared-reagents.chemd `
  examples\source-first-demo\reaction-flight-deck\suzuki-pyrimidine.chemd `
  examples\source-first-demo\reaction-flight-deck\amidation-benzylamide.chemd `
  examples\source-first-demo\reaction-flight-deck\screen-comparison.chemd `
  examples\source-first-demo\reaction-flight-deck\si-rsc-2009-aqueous-suzuki.chemd `
  examples\source-first-demo\reaction-flight-deck\si-rsc-2011-neat-water-suzuki.chemd `
  examples\source-first-demo\reaction-flight-deck\si-rsc-2019-continuous-flow.chemd `
  examples\source-first-demo\reaction-flight-deck\si-nature-2024-ptc-suzuki.chemd `
  examples\source-first-demo\reaction-flight-deck\si-nature-2024-ptc-tbab.chemd `
  examples\source-first-demo\reaction-flight-deck\real-si-comparison.chemd `
  --target validate --format text
```

RAG and training flows are intentionally outside this demo folder.
