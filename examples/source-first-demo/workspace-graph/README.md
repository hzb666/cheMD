# Chemd Workspace Graph Demo

This demo shows document-internal and cross-document graph edges without using
RAG. It uses the existing `examples/source-first-demo/reaction-flight-deck` workspace and renders
the `chemd graph` JSON output as a browser HTML viewer.

## Build the graph index

```powershell
pnpm chemd graph `
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
  --format json > $env:TEMP\chemd-workspace-graph.json
```

## Render an HTML viewer

```powershell
node examples\source-first-demo\scripts\demo-workspace-graph.mjs `
  --json $env:TEMP\chemd-workspace-graph.json `
  --out $env:TEMP\chemd-workspace-graph.html
```

Or generate the default reaction-flight-deck viewer directly:

```powershell
node examples\source-first-demo\scripts\demo-workspace-graph.mjs --out $env:TEMP\chemd-workspace-graph.html
```

Open the generated HTML in a browser. The viewer supports view mode, document,
node type, edge type, and cross-document filters.

The default graph input contains 10 Chemd source documents: the original demo
records, one shared reagent library, four real SI-derived Suzuki-Miyaura
records, one TBAB phase-transfer SI variant, and one cross-document SI
comparison record.

## Viewer modes

- `Documents`: the default collapsed view. It shows module-level imports, so
  shared reagent libraries appear once as document nodes.
- `Procedure Sequence`: the step-by-step view. It shows only
  `procedure_step` nodes and `step_precedes_step` edges, with fixed positions
  from left to right.
- `Material Flow`: the reagent/material view. It links reactions and procedure
  steps to shared molecule/material declarations.
- `Full Entity Graph`: the detail view. It keeps every emitted node and edge,
  so it is useful for inspection but intentionally denser than the workflow
  views.

## What to show

- `document_imports_document` links the imported Chemd source files.
- `reaction_uses_imported_molecule`, `reaction_uses_imported_material`, and
  `reaction_uses_imported_batch` link reaction participants and conditions to
  shared declarations in another document.
- `procedure_step_uses_molecule` and `procedure_step_uses_material` link
  procedure steps to shared bases, solvents, and Pd catalyst candidates.
- `step_precedes_step` is the procedure order signal; use the `Procedure
  Sequence` view when demonstrating operational order.
- `condition_screen_compares_reaction` and `condition_screen_uses_standard`
  link comparison screens to reactions/results.
- Runtime control edges such as `control_reads_runtime_signal` show program
  semantics inside one document.

## Real SI-derived records

- `si-rsc-2009-aqueous-suzuki.chemd`: RSC Green Chemistry 2009/2010 aqueous
  Suzuki ESI for DOI `10.1039/B915436A`.
- `si-rsc-2011-neat-water-suzuki.chemd`: RSC Green Chemistry 2011 neat-water
  Suzuki protocol for DOI `10.1039/C0GC00522C`.
- `si-rsc-2019-continuous-flow.chemd`: RSC Reaction Chemistry & Engineering
  2019 continuous-flow Pd-beta-cyclodextrin Suzuki kinetics for DOI
  `10.1039/C9RE00159J`.
- `si-nature-2024-ptc-suzuki.chemd` and
  `si-nature-2024-ptc-tbab.chemd`: Nature Communications 2024 biphasic
  Suzuki phase-transfer catalyst SI for DOI `10.1038/s41467-024-49681-4`.

This is a graph/export demo, not a RAG demo.
