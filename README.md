<p align="center">
  <img src="vision/logo-01.png" alt="chemd logo" width="520" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white" alt="pnpm 10" />
  <img src="https://img.shields.io/badge/Flask-3.1-111111?logo=flask&logoColor=white" alt="Flask 3.1" />
  <img src="https://img.shields.io/badge/RDKit-2025.9-0B7285" alt="RDKit" />
</p>

# chemd

[简体中文](./README.zh-CN.md) | [English](./README.md)

`chemd` turns chemistry experiment records into code-like, compiler-checked
documents that remain readable to researchers and structured for LLM systems.
It preserves the narrative of an experiment while extracting entities,
references, procedure logic, observations, evidence links, and knowledge-graph
relations for retrieval, training, and downstream reasoning. The system combines
a typed chemistry document language, a TypeScript compiler pipeline, a Next.js
playground, and a local Flask/RDKit chemistry service.

## Product Scope

- Code-like Chemd authoring with frontmatter, Markdown-style prose, inline chemistry,
  references, molecules, reactions, results, analyses, samples, procedures,
  observations, templates, and column layouts.
- Experiment-logic enrichment that connects raw records to typed entities,
  resolved references, procedure steps, observations, field evidence,
  normalization facts, and knowledge-graph edges.
- Live browser workbench with source editing, rendered preview, diagnostics,
  structured outputs, export actions, OCR entry points, and chemistry editor
  integration.
- Compiler output for HTML preview, normalized JSON, DOCX bridge Markdown,
  canonical LNF, runtime preflight, RAG retrieval data, training understanding
  data, and full audit data.
- Repo-level graph index and reaction clustering derived from existing
  experiment facts, including routes, procedure reuse, condition signatures,
  campaign trajectories, and semantic reaction-similarity edges.
- LLM-oriented exports that separate retrieval data from training understanding
  data, keeping audit-only source detail out of model-training inputs.
- Local chemistry API for molecule and reaction normalization, rendering, OCR
  provider adapters, and structure draft storage.
- Deployment assets for a playground web service backed by an internal chemistry
  service.

## Stack

| Layer | Technology |
| --- | --- |
| Workspace | pnpm workspace, Turborepo |
| Web | Next.js 15, React 19, Tailwind CSS 4 |
| Language packages | TypeScript 5.9 |
| Chemistry editing | Ketcher React, Ketcher standalone |
| Chemistry service | Python 3.14, Flask 3.1, RDKit 2025.9 |
| Validation | Vitest, TypeScript checks, ESLint, Ruff, Python unittest |
| Document conversion | Pandoc for final DOCX generation |

## Repository Layout

```text
chemd/
|-- apps/
|   `-- web/                 # Playground UI, route handlers, server facade
|-- deploy/
|   `-- playground/          # Container, reverse proxy, and service assets
|-- packages/
|   |-- cli/                 # Command-line validation, repair, diff, and agent-loop tools
|   |-- compiler/            # Public compile pipeline
|   |-- core/                # AST, diagnostics, shared primitives
|   |-- diagnostics/         # Diagnostic model and quick-fix metadata
|   |-- exporter-training/   # RAG, training understanding, audit exports
|   |-- lnf/                 # Canonical LNF builder
|   |-- parser/              # Frontmatter, blocks, inline tokens, references
|   |-- render-profile/      # Render profiles and override validation
|   |-- renderer-docx/       # DOCX bridge renderer
|   |-- renderer-html/       # HTML preview renderer
|   |-- renderer-json/       # JSON renderer
|   |-- resolver/            # Reference resolution and template expansion
|   |-- runtime-lab/         # Runtime plan and preflight model
|   |-- runtime-trace/       # Runtime trace events and replay helpers
|   |-- step-ontology/       # Procedure, observation, analysis lowering
|   |-- storage-postgres/    # PostgreSQL schema, records, RAG, and memory tables
|   `-- typechecker/         # Typed semantic graph and value diagnostics
|-- scripts/                 # Local development and migration utilities
|-- services/
|   `-- chem-service/        # Flask/RDKit chemistry API
`-- vision/                  # Visual assets
```

## Local Development

Prerequisites:

- Node.js 20 or newer.
- pnpm 10.x.
- Python `>=3.14,<3.15`.
- Poetry for the chemistry service.
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

Start individual services:

```bash
pnpm dev:web
```

```bash
cd services/chem-service
poetry run python app.py
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm dev` | Start the web playground and chemistry service |
| `pnpm dev:web` | Start only the web playground |
| `pnpm build` | Build the workspace |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Run ESLint with automatic fixes |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run the validation suite |
| `pnpm lint:py` | Run Ruff for the chemistry service |
| `pnpm format:check:py` | Check Python formatting |

Package-scoped examples:

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/compiler typecheck
pnpm --filter @chemd/exporter-training test
```

Chemistry service validation:

```bash
cd services/chem-service
poetry run python -m unittest discover
```

## CLI Workflows

The package CLI is available through the root `chemd` script:

```bash
pnpm chemd validate examples/report.chemd
pnpm chemd export examples/report.chemd --format training-full
pnpm chemd diff before.chemd after.chemd --format json
pnpm chemd graph reports/*.chemd --format json
pnpm chemd repair draft.chemd --format text
pnpm chemd agent-loop draft.chemd --format json --max-iterations 3
```

Important commands:

| Command | Purpose |
| --- | --- |
| `validate <file...>` | Compile documents and report diagnostics |
| `export <file> --format json\|lnf\|rag\|training\|training-full` | Emit structured compiler/exporter payloads |
| `graph <file...> [--format text\|json]` | Build a repo-level graph index and reaction clusters from compiled understandings |
| `diff <old-file> <new-file> [--format text\|json]` | Compare semantic changes between two records |
| `changed [--base <ref>] [--format text\|json]` | Validate changed files from git status/diff context |
| `repair <file> [--write]` | Apply compiler-guided safe fixes |
| `agent-loop <file> [--write]` | Run iterative diagnosis and repair for generated Chemd |

The `graph` command does not require graph-specific source syntax. It compiles
one or more experiment reports, then derives document nodes, entity/relation
edges, route clusters, family/procedure clusters, condition clusters,
campaign trajectories, and semantic reaction-similarity edges. When computed
chemical fingerprints are not available, the output marks this explicitly
instead of presenting semantic similarity as RDKit/Tanimoto similarity.

## Document Language

`chemd` documents are dedicated Chemd source files with required frontmatter:

- `id`
- `title`
- `date`

Supported metadata includes render profile selection, render overrides, tags,
and primary aliases for reaction, result, product, sample, molecule, and
analysis entities.

Inline syntax:

| Syntax | Meaning |
| --- | --- |
| `:chem[H2O]` | Inline chemistry token |
| `` `inline code` `` | Inline code token |
| `[label](https://example.com)` | Markdown link token with safety metadata |
| `@rxn-main` | Entity reference |
| `@res-main.yield` | Entity field reference |
| `@meta.title` | Metadata reference |
| `@result.yield` | Primary alias field reference |
| `@param.amount` | Template parameter reference |

Structured blocks:

| Block | Role |
| --- | --- |
| `:::chemd` | Molecule or reaction block; `kind` can be explicit or compiler-inferred from stable reaction fields |
| `:::result` | Outcome status, yield, conversion, selectivity, purity, notes |
| `:::analysis` | Analysis records and TLC-style lane data |
| `:::sample` | Sample metadata and lineage references |
| `:::procedure` | Procedure text or explicit steps |
| `:::observation` | Observation text or explicit events |
| `:::template` | Reusable document template |
| `:::use` | Template invocation |
| `:::col-N` | Column layout block |

Example:

```md
---
id: exp-demo
title: Ethanol oxidation
date: 2026-04-17
render_profile: publication-acs
primary_reaction: rxn-main
primary_result: res-main
tags:
  - demo
  - oxidation
---

:::chemd #rxn-main
kind: reaction
reactants: CCO | O=O
products: CC(=O)O
conditions: THF | -78 C | 30 min | nitrogen
:::

:::procedure #proc-main
step: cool | id=cool-main | target_temperature=-78 C
step: add | id=add-oxidant | dependsOn=cool-main
:::

:::analysis #ana-tlc
type: tlc
ref: rxn-main
result: partial_conversion
data: TLC shows starting material remains
:::

:::result #res-main
ref: rxn-main
status: partial
yield: 23%
purity: 91%
:::

Yield: @res-main.yield
```

## Compiler Pipeline

`@chemd/compiler` exposes `compileChemd(source, options)`.

```text
source markdown
  -> parseChemd()
  -> resolveChemd()
  -> typecheckDocument()
  -> resolveRenderProfileWithDiagnostics()
  -> buildRunPlan()
  -> preflightRun()
  -> buildCanonicalLnf()
  -> exportTrainingRecordFromDocument()
  -> buildRagExportFromTrainingRecord()
  -> buildTrainingUnderstandingFromRecord()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

Compile output includes diagnostics, resolved document data, typed semantic
graph, lowered step graph, runtime plan, preflight results, LNF, HTML, JSON,
DOCX bridge Markdown, RAG export, training understanding export, and full audit
export.

Data export responsibilities:

| Export | Purpose |
| --- | --- |
| RAG export | Retrieval indexing and search context |
| Training understanding export | LoRA/SFT dataset generation and experiment knowledge modeling |
| Graph index export | Repo/campaign graph indexing, reaction clustering, and similarity traversal |
| Full audit export | Inspection, debugging, and traceability |

Graph-index output is intentionally inference-driven. Authors write the
strong experimental facts that belong in a report, such as `reactants`,
`products`, `result.ref`, `analysis.ref`, `sample.derived_from`, `route`,
`prev`, and `condition-varies`. The exporter derives the graph and clustering
projection from those facts rather than adding a separate graph language.
Repo-level graph indexes are built after compiling one or more documents into
training understandings, using `buildTrainingGraphIndexFromUnderstandings()`.

## Web Playground

The playground provides:

- source editor and rendered document preview
- diagnostics and structured compiler output tabs
- render profile selection
- JSON and DOCX export actions
- molecule and reaction editing
- OCR import flows
- session-scoped draft writes

Structured output tabs include semantic output, runtime output, LNF, RAG export,
training understanding export, and full audit export.

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
| `@chemd/core` | Shared AST, diagnostics, render overrides, chemistry primitives |
| `@chemd/parser` | Frontmatter, Markdown, inline token, block, reference parsing |
| `@chemd/resolver` | References, aliases, template expansion, semantic cleanup |
| `@chemd/diagnostics` | Diagnostic model, bands, quick-fix metadata |
| `@chemd/typechecker` | Typed semantic graph and value diagnostics |
| `@chemd/step-ontology` | Procedure, observation, analysis lowering |
| `@chemd/runtime-lab` | Runtime plans and preflight checks |
| `@chemd/runtime-trace` | Runtime trace events and replay helpers |
| `@chemd/lnf` | Canonical LNF payloads |
| `@chemd/render-profile` | Built-in render profiles and override validation |
| `@chemd/renderer-html` | HTML preview rendering |
| `@chemd/renderer-json` | JSON rendering |
| `@chemd/renderer-docx` | DOCX bridge rendering |
| `@chemd/exporter-training` | Retrieval, training understanding, graph index, clustering, audit exports |
| `@chemd/storage-postgres` | PostgreSQL schema, storage records, RAG chunks, and training memory records |
| `@chemd/compiler` | Public compile pipeline |
| `@chemd/web` | Playground UI and server-side routes |

## Configuration

Environment variables can be supplied by the shell, process manager, or
deployment platform.

Web app variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CHEM_SERVICE_BASE_URL` | `http://127.0.0.1:18081` | Server-side calls to the chemistry service |
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

## Deployment

The playground deployment assets support a web service, a chemistry service, and
reverse-proxy exposure.

Compose deployment:

```bash
cd deploy/playground
docker compose up -d --build
```

The web service is the public boundary. The chemistry service should remain
behind the web app or inside a trusted internal network. Public domain routing
and TLS termination belong at the reverse proxy in front of the web service.

## Runtime Notes

- RDKit-backed rendering requires the Python runtime to import RDKit
  successfully.
- OCR defaults to placeholder providers; production OCR requires provider URLs
  and keys.
- DOCX file generation requires Pandoc. DOCX bridge Markdown is available from
  the compiler without Pandoc.
- Lab inventory lookup requires credentials and network access to the configured
  API.
- Structure drafts are stored by the chemistry service for the active playground
  flow.
