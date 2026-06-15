# chemd

<p align="center">
  <img src="vision/logo-01.png" alt="chemd logo" width="520" />
</p>

[Simplified Chinese](./README.zh-CN.md) | [English](./README.md)

`chemd` is a program-first chemistry experiment record language. `.chemd` files record experiments, compare differences, audit agent edits, and export to multiple downstream formats.

## Core

- Declarative model: module, metadata, molecule, reaction, result, procedure, observation, trace, and agent audit block.
- Semantic validation: checks references, typed values, step evidence, and export readiness from source.
- Experiment diff: compares experiment attempts by reaction facts, conditions, result status, yield, and step changes.
- Agent audit: records repair or authoring goals, tool calls, patch proposals, decisions, timelines, and evidence.
- Multi-format export: one `.chemd` source can export JSON, canonical LNF, RAG data, training understanding data, and full audit export.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Workspace | pnpm workspace, Turborepo |
| Web | Next.js 16, React 19.2, Tailwind CSS 4.3 |
| Desktop | Tauri 2, Vite 8, React 19.2, Monaco Editor |
| Native runtime | Rust, Tauri commands, managed PostgreSQL resources |
| Language packages | TypeScript 6.0 |
| Chemistry editing | Ketcher React, Ketcher standalone |
| Chemistry service | Python 3.14, Flask 3.1, RDKit 2026.3 |
| Persistence and knowledge base | PostgreSQL, pgvector-oriented Graph/RAG records, local outbox |
| Validation | Vitest 4.1, TypeScript checks, ESLint 10.4, Ruff 0.15, Python unittest |
| Document conversion | Pandoc for final DOCX files |

## Repository Layout

```text
chemd/
|-- apps/
|   |-- desktop/            # Tauri Desktop IDE, Monaco workbench, native commands
|   `-- web/                # Playground UI, route handlers, server facade
|-- deploy/
|   `-- playground/         # Container, reverse proxy, and service assets
|-- examples/
|   `-- basic/              # Small .chemd samples with matching outputs
|-- packages/
|   |-- cli/                # CLI validation, repair, diff, and agent-loop tools
|   |-- compiler/           # Public compile pipeline
|   |-- core/               # AST, diagnostics, shared primitives
|   |-- diagnostics/        # Diagnostic model and quick-fix metadata
|   |-- exporter-training/  # RAG, training understanding, audit exports
|   |-- agent-tools/        # Agent run, evidence, patch, and audit primitives
|   |-- language-service/   # Editor diagnostics, outline, completion, hover, Graph/RAG DTOs
|   |-- lnf/                # Canonical LNF builder
|   |-- parser/             # Program grammar, doc comments, values, references
|   |-- reaction-map/       # Reaction graph layout and intelligence contracts
|   |-- render-profile/     # Render profiles and override validation
|   |-- renderer-docx/      # DOCX bridge renderer
|   |-- renderer-html/      # HTML preview renderer
|   |-- renderer-json/      # JSON renderer
|   |-- resolver/           # Program symbol tables and reference resolution
|   |-- runtime-lab/        # Runtime plan and preflight model
|   |-- runtime-trace/      # Runtime trace events and replay helpers
|   |-- step-ontology/      # Procedure, observation, analysis lowering
|   |-- storage-postgres/   # PostgreSQL schema, records, RAG, and memory tables
|   |-- semantic-rendering/ # Semantic preview view models
|   |-- workspace-index/    # Cross-document symbols and reference queries
|   `-- typechecker/        # Typed semantic graph and value diagnostics
|-- scripts/                # Local development and migration tools
|-- services/
|   `-- chem-service/       # Flask/RDKit chemistry API
`-- vision/                 # Visual assets
```

## Local Development

Prerequisites:

- Node.js 20 or newer.
- pnpm 10.x.
- Python `>=3.14,<3.15`.
- Poetry for chemistry service dependencies.
- Pandoc for final DOCX file generation.
- Docker for containerized playground deployment.

Install dependencies:

```bash
pnpm install

cd services/chem-service
poetry install
```

Start the full local stack:

```bash
pnpm dev
```

Default local endpoints:

| Service | URL |
| --- | --- |
| Web playground | `http://127.0.0.1:2436` |
| Chemistry service | `http://127.0.0.1:18081` |

Start services individually:

```bash
pnpm dev:web
```

```bash
cd services/chem-service
poetry run python app.py
```

Start the Desktop IDE frontend:

```bash
pnpm --filter @chemd/desktop dev
```

Start the Tauri desktop app:

```bash
pnpm --filter @chemd/desktop tauri:dev
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm dev` | Start the web playground and chemistry service |
| `pnpm dev:web` | Start only the web playground |
| `pnpm build` | Build the workspace |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Run ESLint automatic fixes |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run the validation suite |
| `pnpm lint:py` | Run Ruff for the chemistry service |
| `pnpm format:check:py` | Check Python formatting |
| `pnpm desktop:diagnostics-bundle` | Export an offline desktop diagnostics bundle |
| `pnpm desktop:offline-core-smoke` | Run the desktop offline core smoke script |
| `pnpm desktop:release-readiness` | Run desktop release-readiness classification checks |
| `pnpm --filter @chemd/desktop tauri:dev` | Start the Tauri desktop app |
| `pnpm --filter @chemd/desktop tauri:build` | Build desktop release artifacts |

Package-level command examples:

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/desktop test
pnpm --filter @chemd/compiler typecheck
pnpm --filter @chemd/exporter-training test
```

Chemistry service validation:

```bash
cd services/chem-service
poetry run python -m unittest discover
```

## Examples

Small source-first examples live in [`examples/basic`](./examples/basic/):

- `experiment-before.chemd` and `experiment-after.chemd` show semantic experiment diffing with checked text output.
- `agent-audit.chemd` shows an agent audit block that keeps tool calls, patch decisions, timeline, and evidence in source.

```bash
pnpm chemd validate examples/basic/experiment-before.chemd examples/basic/experiment-after.chemd
pnpm chemd diff examples/basic/experiment-before.chemd examples/basic/experiment-after.chemd
pnpm chemd validate examples/basic/agent-audit.chemd
```

## CLI Workflows

The root `chemd` script invokes the CLI:

```bash
pnpm chemd validate file.chemd
pnpm chemd export file.chemd --format training-full
pnpm chemd diff before.chemd after.chemd --format json
pnpm chemd graph reports/*.chemd --format json
pnpm chemd repair draft.chemd --format text
pnpm chemd agent-loop draft.chemd --format json --max-iterations 3
```

Common commands:

| Command | Purpose |
| --- | --- |
| `validate <file...>` | Compile documents and output diagnostics |
| `export <file> --format json\|lnf\|rag\|training\|training-full` | Output structured compiler/exporter payloads |
| `graph <file...> [--format text\|json]` | Build repo-level graph indexes and reaction clusters from compiled understandings |
| `diff <old-file> <new-file> [--format text\|json]` | Compare semantic changes between two records |
| `changed [--base <ref>] [--format text\|json]` | Validate changed files from git status/diff context |
| `repair <file> [--write]` | Apply compiler-guided safe fixes |
| `agent-loop <file> [--write]` | Run iterative diagnosis and repair for LLM-generated Chemd |

The `graph` command does not require authors to write graph-specific syntax. It first compiles a set of experiment reports, then infers document nodes, entity/relation edges, route clusters, family/procedure clusters, condition clusters, campaign trajectories, and semantic reaction-similarity edges. When no computed chemical fingerprint is available, the output says so explicitly instead of presenting semantic similarity as RDKit/Tanimoto similarity.

## Document Language

Chemd program-v1 is a program-first language. A `.chemd` file is a module, and declarations are the only source of semantic truth. Markdown enters the compiler only through explicit documentation comments and `/*md */` regions; it can be rendered and retrieved, but it does not create experiment facts.

The compiler builds experiment facts only from program declarations. Markdown documentation enters only the rendering and retrieval pipeline through documentation comments and `/*md */` regions.

Program syntax:

| Syntax | Meaning |
| --- | --- |
| `module exp_demo` | File-level module scope |
| `meta { ... }` | Required metadata declaration |
| `import shared as s from "./shared.chemd"` | External program symbols |
| `molecule mol_a { ... }` | Semantic molecule declaration |
| `reaction rxn_main { ... }` | Semantic reaction declaration |
| `result res_main for @rxn_main { ... }` | Result bound to a reaction |
| `procedure proc_main for @rxn_main { ... }` | Declaration-native procedure steps |
| `agent run repair_001 { ... }` | Source-level agent audit record |
| `/// ...` and `/*md ... */` | Markdown documentation comments |

Example:

```chemd
module exp_demo

meta {
  id: "exp-demo"
  title: "Ethanol oxidation"
  date: 2026-04-17
  primary_reaction: @rxn_main
  primary_result: @res_main
}

/*md
# Ethanol oxidation

This section is documentation. It can be rendered and retrieved, but it does
not create molecule, reaction, result, procedure, or agent facts.
*/

molecule mol_ethanol {
  name: "ethanol"
  smiles: "CCO"
  role: substrate
}

reaction rxn_main {
  reactants: [@mol_ethanol]
  products: ["CC(=O)O"]
  solvent: "THF"
  temperature: -78 C
  atmosphere: nitrogen
}

result res_main for @rxn_main {
  status: success
  yield: 72%
}

procedure proc_main for @rxn_main {
  step charge = charge(inputs: [@mol_ethanol], purpose: "assemble reaction")
  step cool = cool(temperature: -78 C, depends_on: [charge])
}
```

Program-first contracts:

- `/en/docs/program-v1/language`
- `/en/docs/program-v1/ast`
- `/en/docs/program-v1/exports`

## Common Workflows

After creating or opening a Chemd record, run validation first:

```bash
pnpm chemd validate file.chemd
```

Export data required by applications and model pipelines:

```bash
pnpm chemd export file.chemd --format json
pnpm chemd export file.chemd --format rag
pnpm chemd export file.chemd --format training
```

Inspect a workspace-level reaction graph:

```bash
pnpm chemd graph packages/compiler/fixtures/*.chemd --format json
```

Run compiler-guided repair for generated drafts:

```bash
pnpm chemd repair draft.chemd --write
pnpm chemd agent-loop draft.chemd --write --max-iterations 3
```

## Compiler Pipeline

`@chemd/compiler` exposes `compileChemd(source, options)`.

```text
source program
  -> parseChemdProgram()
  -> resolveProgram()
  -> typecheckProgram()
  -> resolveRenderProfileWithDiagnostics()
  -> buildRunPlan()
  -> preflightRun()
  -> buildCanonicalLnf()
  -> exportTrainingRecordFromProgram()
  -> buildRagExportFromTrainingRecord()
  -> buildTrainingUnderstandingFromRecord()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

Compile output includes diagnostics, resolved program, typed semantic graph, lowered step graph, runtime plan, preflight results, LNF, HTML, JSON, DOCX bridge Markdown, RAG export, training understanding export, and full audit export.

Data export responsibilities:

| Export | Purpose |
| --- | --- |
| RAG export | Retrieval index and search context |
| Training understanding export | LoRA/SFT dataset generation and experiment knowledge modeling |
| Graph index export | Repo/campaign graph indexing, reaction clustering, and similarity traversal |
| Full audit export | Inspection, debugging, and traceability |

Graph index is an inferred export. Authors only write real experiment facts in declarations, such as `reactants`, `products`, result target, analysis target, sample lineage, route edges, and condition screens. The export layer generates graph indexes and cluster views from those facts, while the report remains focused on experiment-fact authoring. Repo-level graph indexes are generated by `buildTrainingGraphIndexFromUnderstandings()` after one or more documents compile into training understandings.

## Web Playground

The playground provides:

- source editor and rendered document preview
- diagnostics and structured compiler output tabs
- render profile selection
- JSON and DOCX export actions
- molecule and reaction editing
- OCR import flows
- session-scoped draft writes

Structured output tabs include semantic output, runtime output, LNF, RAG export, training understanding export, and full audit export.

Typical browser workflow:

1. Run `pnpm dev`.
2. Open `http://127.0.0.1:2436`.
3. Edit Chemd source, or import structures through OCR / chemistry editor entry points.
4. Review diagnostics and rendered preview.
5. Export JSON, DOCX, RAG, training understanding, or audit payloads.

## Desktop IDE

Chemd Desktop IDE is the day-to-day authoring product for local workspaces. It uses Tauri, React, and Monaco with Rust-backed workspace commands for local files, knowledge indexes, and Agent review.

Desktop features:

- Open local folders and browse Chemd documents with related assets.
- Edit `.chemd` program files in Monaco with diagnostics, outline, hover, completion, source ranges, and quick-fix proposals from `@chemd/language-service`.
- Use file tabs, breadcrumbs, status bar, autosave, `Ctrl+S` / `Cmd+S`, and conflict-aware saving.
- View compiled document preview and semantic tree while editing.
- Build a local workspace index for symbols, references, document candidates, and RAG citation candidates.
- Bind a workspace to a PostgreSQL profile, use managed PostgreSQL resources, persist Graph/RAG runtime snapshots, query connected RAG data, and backfill embeddings after provider configuration.
- Run reaction intelligence jobs and view reaction graph layout, clusters, evidence rows, and source-jump links.
- Review Agent patch proposals, inspect evidence and audit timeline, and approve / reject / apply changes.
- Export offline diagnostics bundles for support and release checks.

Desktop development commands:

```bash
pnpm --filter @chemd/desktop dev
pnpm --filter @chemd/desktop tauri:dev
pnpm --filter @chemd/desktop test
pnpm --filter @chemd/desktop typecheck
pnpm desktop:diagnostics-bundle
```

Related architecture documents:

- `docs/desktop-ide-production-plan.zh-CN.md`
- `docs/desktop-runtime-boundaries.zh-CN.md`
- `docs/desktop-language-service-contract.zh-CN.md`
- `docs/postgres-graph-rag-schema.zh-CN.md`
- `docs/agent-tool-contract.zh-CN.md`
- `docs/desktop-ui-style-guide.zh-CN.md`

## API Surface

Next.js routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/export/json` | `POST` | Compile source and return normalized JSON |
| `/api/export/docx` | `POST` | Compile source and return a DOCX file |
| `/api/chem/draft` | `GET` | Read a saved structure draft |
| `/api/chem/inventory` | `POST` | Resolve inventory data through configured services |
| `/api/chem/normalize` | `POST` | Normalize molecule notation |
| `/api/chem/render` | `POST` | Render molecule or reaction notation |
| `/api/chem/save` | `POST` | Save molecule or reaction notation |
| `/api/chem/ocr` | `POST` | Run molecule-oriented OCR workflow |
| `/api/chem/reaction/ocr` | `POST` | Run reaction OCR workflow |
| `/api/chem/postgres/memory/loop` | `POST` | Derive semantic diff, training events, pattern memory, dataset projection, and correction-pattern support from persisted revisions |
| `/api/chem/postgres/training/export` | `POST` | Export bounded training artifacts and optional pattern memory from persisted PostgreSQL records |

Chemistry service routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/healthz` | `GET` | Health and provider readiness |
| `/ocr` | `POST` | Molecule OCR provider adapter |
| `/normalize` | `POST` | Molecule normalization |
| `/render` | `POST` | Molecule rendering |
| `/reaction/ocr` | `POST` | Reaction OCR provider adapter |
| `/reaction/render` | `POST` | Reaction rendering |
| `/structure` | `GET`, `POST` | Structure draft lookup and storage |

## Package Roles

| Package | Role |
| --- | --- |
| `@chemd/cli` | CLI validation, graph export, repair loop, semantic diff, and agent-loop integration |
| `@chemd/agent-tools` | Agent runs, cited evidence, patch decisions, and audit timelines |
| `@chemd/core` | Shared AST, diagnostics, render overrides, chemistry primitives |
| `@chemd/parser` | Program grammar, doc comments, values, references |
| `@chemd/resolver` | Program symbol tables, imports, references, semantic cleanup |
| `@chemd/diagnostics` | Diagnostic model, bands, quick-fix metadata |
| `@chemd/typechecker` | Typed semantic graph and value diagnostics |
| `@chemd/step-ontology` | Procedure, observation, analysis lowering |
| `@chemd/runtime-lab` | Runtime plans and preflight checks |
| `@chemd/runtime-trace` | Runtime trace events and replay helpers |
| `@chemd/lnf` | Canonical LNF payloads |
| `@chemd/language-service` | Editor diagnostics, outline, symbols, completions, hover, quick fixes, Graph/RAG DTOs |
| `@chemd/reaction-map` | Reaction map layout, cluster model, and reaction intelligence contracts |
| `@chemd/render-profile` | Built-in render profiles and override validation |
| `@chemd/renderer-html` | HTML preview rendering |
| `@chemd/renderer-json` | JSON rendering |
| `@chemd/renderer-docx` | DOCX bridge rendering |
| `@chemd/exporter-training` | Retrieval, training understanding, graph index, clustering, audit exports |
| `@chemd/storage-postgres` | PostgreSQL schema, storage records, RAG chunks, and training memory records |
| `@chemd/semantic-rendering` | Semantic preview view models for editor products |
| `@chemd/workspace-index` | Cross-document symbol indexing, references, and workspace query helpers |
| `@chemd/compiler` | Public compile pipeline |
| `@chemd/web` | Playground UI and server-side routes |
| `@chemd/desktop` | Tauri Desktop IDE and native workspace runtime |

## Configuration

Environment variables can be supplied by the shell, process manager, or deployment platform.

Web app variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHEM_SERVICE_BASE_URL` | `http://127.0.0.1:18081` | Server-side calls to chemistry service |
| `CHEM_SERVICE_ACCESS_KEY` | unset | Optional shared internal access key |
| `PUBCHEM_PUG_REST_BASE_URL` | code default | PubChem metadata lookup |
| `PUBCHEM_PUG_REST_TIMEOUT_MS` | code default | PubChem request timeout |
| `PANDOC_PATH` | `pandoc` | DOCX export binary path |
| `LAB_STORAGE_BASE_URL` | configured API base URL | Lab inventory API |
| `LAB_STORAGE_USERNAME` | unset | Lab inventory login |
| `LAB_STORAGE_PASSWORD` | unset | Lab inventory login |
| `LAB_STORAGE_DEVICE_ID` | code default | Lab inventory device id |
| `LAB_STORAGE_DEVICE_NAME` | code default | Lab inventory device name |

Chemistry service variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHEM_SERVICE_HOST` | `127.0.0.1` | Flask bind host |
| `CHEM_SERVICE_PORT` | `18081` | Flask bind port |
| `CHEM_SERVICE_ALLOW_ORIGINS` | local origins | CORS allowlist |
| `CHEM_SERVICE_ACCESS_KEY` | unset | Optional shared internal access key |
| `CHEM_SERVICE_INTERNAL_ONLY` | code default | Internal request protection |
| `CHEM_SERVICE_MAX_CONTENT_LENGTH` | code default | Request body limit |
| `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH` | code default | OCR image payload limit |
| `CHEM_SERVICE_CACHE_MAX_ENTRIES` | `256` | Structure cache capacity |
| `CHEM_SERVICE_MOLECULE_OCR_PROVIDER` | `placeholder` | Molecule OCR provider |
| `CHEM_SERVICE_REACTION_OCR_PROVIDER` | `placeholder` | Reaction OCR provider |
| `CHEM_SERVICE_DECIMER_API_URL` | unset | DECIMER endpoint |
| `CHEM_SERVICE_DECIMER_API_KEY` | unset | DECIMER key |
| `CHEM_SERVICE_MOLSCRIBE_API_URL` | unset | MolScribe endpoint |
| `CHEM_SERVICE_MOLSCRIBE_API_KEY` | unset | MolScribe key |
| `CHEM_SERVICE_MOLNEXTR_API_URL` | unset | MolNexTR endpoint |
| `CHEM_SERVICE_MOLNEXTR_API_KEY` | unset | MolNexTR key |
| `CHEM_SERVICE_RXNSCRIBE_API_URL` | unset | RxnScribe endpoint |
| `CHEM_SERVICE_RXNSCRIBE_API_KEY` | unset | RxnScribe key |
| `CHEM_SERVICE_RXNIM_API_URL` | unset | RXNIM endpoint |
| `CHEM_SERVICE_RXNIM_API_KEY` | unset | RXNIM key |
| `CHEM_SERVICE_RXNCAPTION_API_URL` | unset | RXNCaption endpoint |
| `CHEM_SERVICE_RXNCAPTION_API_KEY` | unset | RXNCaption key |
