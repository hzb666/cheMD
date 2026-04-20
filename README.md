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

`chemd` is a Markdown-native chemistry document workbench. It combines a
structured authoring language, a TypeScript compiler pipeline, a Next.js
playground, and a local Flask/RDKit chemistry service for rendering,
normalization, OCR integration, exports, runtime checks, and model-oriented
experiment data.

## Capabilities

- Structured chemistry Markdown with frontmatter, inline chemistry tokens,
  references, molecules, reactions, results, analyses, samples, procedures,
  observations, templates, and column layouts.
- Browser-based editing and preview through the Next.js playground.
- Semantic compilation through parser, resolver, typechecker, runtime planner,
  LNF builder, renderers, and training-data exporters.
- HTML preview, normalized JSON export, DOCX bridge output, and server-side DOCX
  generation when Pandoc is available.
- Molecule and reaction editing through Ketcher-backed UI flows.
- Molecule and reaction OCR entry points with configurable providers.
- A local chemistry service for normalization, rendering, OCR provider
  adapters, and structure draft storage.
- Separated data exports for retrieval, model training, and full audit review.

## Technology

| Area | Implementation |
| --- | --- |
| Workspace | pnpm workspace with Turborepo |
| Web | Next.js 15, React 19, Tailwind CSS 4 |
| Language | TypeScript 5.9 |
| Chemistry UI | Ketcher React and standalone packages |
| Chemistry service | Python 3.14, Flask 3.1, RDKit 2025.9 |
| Validation | Vitest, TypeScript checks, ESLint, Ruff, Python unittest |
| Document export | Pandoc for final DOCX generation |

## Repository Map

```text
chemd/
|-- apps/
|   `-- web/                 # Playground UI, API routes, and server facade
|-- deploy/
|   `-- playground/          # Compose, Dockerfile, nginx, and systemd assets
|-- packages/
|   |-- compiler/            # Public compile/export/render orchestration
|   |-- core/                # AST, diagnostics, shared primitives
|   |-- diagnostics/         # Diagnostic model and quick-fix metadata
|   |-- exporter-training/   # RAG, training understanding, and audit exports
|   |-- lnf/                 # Canonical LNF builder
|   |-- parser/              # Frontmatter, block, inline, and reference parsing
|   |-- render-profile/      # Render profiles and override validation
|   |-- renderer-docx/       # DOCX bridge renderer
|   |-- renderer-html/       # HTML renderer
|   |-- renderer-json/       # JSON renderer
|   |-- resolver/            # Reference resolution and template expansion
|   |-- runtime-lab/         # Runtime plan and preflight model
|   |-- runtime-trace/       # Runtime trace events and replay helpers
|   |-- step-ontology/       # Procedure, observation, and analysis lowering
|   `-- typechecker/         # Typed semantic graph and value diagnostics
|-- scripts/
|   `-- dev-demo.mjs         # Local launcher for web and chemistry service
|-- services/
|   `-- chem-service/        # Flask/RDKit chemistry API
`-- vision/                  # Logo and visual assets
```

## Local Development

### Prerequisites

- Node.js 20 or newer.
- pnpm 10.x.
- Python `>=3.14,<3.15`.
- Poetry for the chemistry service.
- Pandoc for final DOCX file generation.
- Docker only for containerized playground deployment.

### Install Dependencies

```bash
pnpm install

cd services/chem-service
poetry install
```

### Start the Full Demo

Run from the repository root:

```bash
pnpm dev
```

The launcher starts the web app on `http://127.0.0.1:2436` and the chemistry
service on `http://127.0.0.1:18081`.

### Start Individual Processes

```bash
pnpm dev:web
```

```bash
cd services/chem-service
poetry run python app.py
```

## Common Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm dev` | Start the web app and chemistry service |
| `pnpm dev:web` | Start only the web playground |
| `pnpm build` | Build all workspace packages through Turbo |
| `pnpm lint` | Run ESLint over TypeScript and JavaScript sources |
| `pnpm lint:fix` | Run ESLint with automatic fixes |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run the full validation suite |
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

## Authoring Model

`chemd` documents are Markdown files with required frontmatter and structured
fenced blocks. Required frontmatter fields are `id`, `title`, and `date`.
Supported metadata includes render profile selection, render overrides, tags,
and primary entity aliases for reactions, results, products, samples,
molecules, and analyses.

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

Structured block families:

| Block | Role |
| --- | --- |
| `:::chemd` | Molecule or reaction; new documents should set `kind` |
| `:::result` | Result status, yield, conversion, selectivity, purity, and notes |
| `:::analysis` | Analysis records, including TLC lane data |
| `:::sample` | Sample metadata and lineage references |
| `:::procedure` | Procedure text or explicit step blocks |
| `:::observation` | Observation text or explicit event blocks |
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
solvent: THF
temperature: -78 C
time: 30 min
atmosphere: nitrogen
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

The compile result includes diagnostics, resolved document data, typed semantic
graph, lowered step graph, runtime plan, runtime preflight output, LNF, HTML,
JSON, DOCX bridge Markdown, RAG export, training understanding export, and full
audit export.

The full audit export is useful for inspection. RAG indexing should consume the
RAG export. LoRA/SFT dataset generation should consume the training
understanding export.

## Web Playground

The playground provides an editor, live preview, diagnostics, render profile
selection, theme switching, export actions, OCR entry points, and chemistry
editor integration.

Preview tabs include:

- rendered document
- JSON
- diagnostics
- semantic output
- runtime output
- LNF
- RAG export
- training understanding export
- full audit export

Write operations that update chemistry drafts use matching session tokens in
cookie and request header values.

## API Surface

Next.js routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/export/json` | `POST` | Compile source and return normalized JSON |
| `/api/export/docx` | `POST` | Compile source and stream a DOCX file |
| `/api/chem/draft` | `GET` | Read a saved structure draft |
| `/api/chem/inventory` | `POST` | Resolve inventory data through configured services |
| `/api/chem/normalize` | `POST` | Normalize molecule notation |
| `/api/chem/render` | `POST` | Render molecule or reaction notation |
| `/api/chem/save` | `POST` | Save molecule or reaction notation |
| `/api/chem/ocr` | `POST` | Run molecule-oriented OCR workflow |
| `/api/chem/reaction/ocr` | `POST` | Run reaction OCR workflow |

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

## Package Responsibilities

| Package | Responsibility |
| --- | --- |
| `@chemd/core` | Shared AST, diagnostics, render overrides, and chemistry primitives |
| `@chemd/parser` | Frontmatter, Markdown, inline token, block, and reference parsing |
| `@chemd/resolver` | References, aliases, template expansion, and semantic cleanup |
| `@chemd/diagnostics` | Diagnostic model, bands, and quick-fix metadata |
| `@chemd/typechecker` | Typed semantic graph and value diagnostics |
| `@chemd/step-ontology` | Procedure, observation, and analysis lowering |
| `@chemd/runtime-lab` | Runtime plans and preflight checks |
| `@chemd/runtime-trace` | Runtime trace events and replay helpers |
| `@chemd/lnf` | Canonical LNF payloads |
| `@chemd/render-profile` | Built-in render profiles and override validation |
| `@chemd/renderer-html` | HTML preview rendering |
| `@chemd/renderer-json` | JSON rendering |
| `@chemd/renderer-docx` | DOCX bridge rendering |
| `@chemd/exporter-training` | Retrieval, training understanding, and audit exports |
| `@chemd/compiler` | Public compile pipeline |
| `@chemd/web` | Playground UI and server-side routes |

## Configuration

Set environment variables through the shell, process manager, or deployment
platform used to run the app.

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

The playground deployment assets under `deploy/playground` support a web
container, a chemistry-service container, and reverse-proxy based exposure.

Compose deployment:

```bash
cd deploy/playground
docker compose up -d --build
```

The web service is the public boundary. The chemistry service should remain
behind the web app or a trusted internal network. Public domains and TLS should
be handled by the reverse proxy in front of the web service.

## Runtime Notes

- RDKit-backed rendering requires the Python environment to import RDKit
  successfully.
- OCR routes are available with placeholder providers by default; production OCR
  requires provider URLs and keys.
- DOCX file generation requires Pandoc. The compiler can still produce DOCX
  bridge Markdown without it.
- Lab inventory lookup requires credentials and network access to the configured
  API.
- Structure drafts are stored by the chemistry service for the active playground
  flow.
