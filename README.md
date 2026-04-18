<p align="center">
  <img src="vision/logo-01.png" alt="chemd logo" width="520" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Turborepo-2.x-EF4444?logo=turborepo&logoColor=white" alt="Turborepo" />
  <img src="https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white" alt="pnpm 10" />
  <img src="https://img.shields.io/badge/Flask-3.1-111111?logo=flask&logoColor=white" alt="Flask 3.1" />
  <img src="https://img.shields.io/badge/RDKit-2025.9-0B7285" alt="RDKit" />
  <img src="https://img.shields.io/badge/Vitest-3.2-6E9F18?logo=vitest&logoColor=white" alt="Vitest 3.2" />
</p>

# chemd

[简体中文](./README.zh-CN.md) | [English](./README.md)

`chemd` is a chemistry-document workbench and language runtime built around Markdown as the editable source. It combines a Next.js playground, a TypeScript document compiler, and a local Flask/RDKit chemistry service for rendering, OCR seams, structure drafts, JSON export, DOCX export, semantic typing, procedure lowering, runtime preflight, and training-data export.

## Table of Contents

- [Current Capabilities](#current-capabilities)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Local Setup](#local-setup)
- [Development Commands](#development-commands)
- [Language Surface](#language-surface)
- [Compiler Pipeline](#compiler-pipeline)
- [Web Workbench](#web-workbench)
- [API Surface](#api-surface)
- [Package Map](#package-map)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)
- [Runtime Notes](#runtime-notes)

## Current Capabilities

- A Next.js playground at `apps/web` with a split `Editor + Preview` workbench.
- In-browser compilation through `@chemd/compiler`.
- Structured Markdown parsing for frontmatter, markdown text, inline chemistry, references, chemistry blocks, result blocks, analysis blocks, sample blocks, procedure blocks, observation blocks, template blocks, use blocks, and column layout blocks.
- A semantic pipeline that resolves references, assigns object IDs, type-checks values, lowers procedures into a step graph, builds a runtime plan, runs runtime preflight, creates an LNF payload, and creates a training export payload.
- HTML preview, normalized JSON export, and a DOCX export path through Pandoc.
- A chemistry editing loop backed by Ketcher components and server-side save/render routes.
- Image OCR entry points for molecule and reaction workflows; real recognition quality depends on configured providers.
- A local `chem-service` Flask service with RDKit-backed molecule/reaction rendering when RDKit is available.
- Playground deployment assets under `deploy/playground`.

## Tech Stack

| Area | Current implementation |
| --- | --- |
| Monorepo | `pnpm` workspace with Turborepo |
| Language | TypeScript 5.9, Python 3.14 for `chem-service` |
| Web app | Next.js 15, React 19 |
| Styling/UI | Tailwind CSS 4, Radix UI primitives, `lucide-react`, local UI components |
| Chemistry editor | `ketcher-react`, `ketcher-standalone` |
| Tests | Vitest for TypeScript packages and web tests, Node test runner for demo launcher, Python `unittest` for `chem-service` |
| Python service | Flask 3.1, RDKit 2025.9 |
| DOCX export | Pandoc invoked by `@chemd/compiler/node` |

## Repository Layout

```text
chemd/
├── apps/
│   └── web/                    # Next.js playground, UI features, API routes, server facade
├── deploy/
│   └── playground/             # Docker Compose, Dockerfiles, nginx, systemd, env examples
├── packages/
│   ├── compiler/               # Orchestrates parse/resolve/typecheck/render/export/runtime pipeline
│   ├── core/                   # AST types, diagnostics, render override helpers, shared primitives
│   ├── diagnostics/            # v0.3 diagnostic shape, bands, quick fixes
│   ├── exporter-training/      # Training export payloads from compiled documents
│   ├── lnf/                    # LNF v0.3 payload builder
│   ├── parser/                 # Frontmatter, block, inline chemistry, reference parsing
│   ├── render-profile/         # Built-in render profiles and override validation
│   ├── renderer-docx/          # Markdown bridge for Pandoc DOCX export
│   ├── renderer-html/          # HTML preview renderer
│   ├── renderer-json/          # JSON renderer for compiled documents
│   ├── resolver/               # References, primary aliases, template expansion, semantic cleanup
│   ├── runtime-lab/            # Runtime plan and preflight model
│   ├── runtime-trace/          # Trace event and replay helpers
│   ├── step-ontology/          # Procedure/observation/analysis lowering model
│   └── typechecker/            # Typed semantic graph and value diagnostics
├── scripts/
│   ├── audit-legacy-surface-usage.mjs
│   ├── dev-demo.mjs            # Starts web + chem-service
│   ├── dev-demo.test.mjs       # Launcher contract tests
│   ├── legacy-surface-shared.mjs
│   ├── legacy-surface-tools.test.mjs
│   └── migrate-legacy-surface-to-chemd.mjs
├── services/
│   └── chem-service/           # Flask/RDKit local chemistry service
└── vision/                     # Logo and visual assets
```

The `pnpm` workspace includes `apps/*` and `packages/*`. `services/chem-service` is a separate Poetry-managed Python project.

## Local Setup

### Prerequisites

- Node.js 20 or newer.
- `pnpm` 10.x. The root `packageManager` is `pnpm@10.33.0`.
- Python `>=3.14,<3.15` and Poetry for `services/chem-service`.
- Pandoc if you want DOCX export to produce real `.docx` files.
- Docker only if you want to use the playground deployment assets.

### Install TypeScript workspace dependencies

```bash
pnpm install
```

### Install `chem-service`

```bash
cd services/chem-service
poetry install
cp .env.example .env
```

PowerShell:

```powershell
cd services/chem-service
poetry install
Copy-Item .env.example .env
```

`services/chem-service/poetry.toml` enables an in-project virtualenv. The root demo launcher expects the Python binary at `services/chem-service/.venv/bin/python` on Unix-like systems or `services/chem-service/.venv/Scripts/python.exe` on Windows.

### Start the full local demo

From the repository root:

```bash
pnpm dev
```

This starts:

- `@chemd/web` at `http://127.0.0.1:2436`
- `chem-service` at `http://127.0.0.1:18081`

### Start only the web app

```bash
pnpm dev:web
```

The web-only mode is useful for UI work. Chemistry-service features require `chem-service` to be started separately.

### Start only `chem-service`

```bash
cd services/chem-service
poetry run python app.py
```

Health check:

```bash
curl http://127.0.0.1:18081/healthz
```

## Development Commands

Run these from the repository root unless noted.

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install workspace dependencies |
| `pnpm dev` | Start the web app and `chem-service` through `scripts/dev-demo.mjs` |
| `pnpm dev:demo` | Alias for the full demo launcher |
| `pnpm dev:web` | Start only `@chemd/web` through Turbo |
| `pnpm build` | Run `turbo run build` |
| `pnpm test` | Run all workspace Vitest tasks through Turbo |
| `pnpm typecheck` | Run all workspace TypeScript checks through Turbo |
| `pnpm lint` | Run ESLint over `apps`, `packages`, `scripts`, root config files, and `vitest.workspace.ts` |
| `pnpm lint:fix` | Run ESLint with automatic fixes |
| `pnpm test:dev-demo` | Run Node tests for the demo launcher |
| `node --test scripts/legacy-surface-tools.test.mjs` | Run legacy surface migration/audit tests |
| `pnpm lint:py` | Run Ruff checks for `services/chem-service` |
| `pnpm format:check:py` | Optional Python format check for `services/chem-service` |

Package-scoped examples:

```bash
pnpm --filter @chemd/web test
pnpm --filter @chemd/web typecheck
pnpm --filter @chemd/compiler test
pnpm --filter @chemd/parser test
pnpm --filter @chemd/typechecker test
```

Python service tests:

```bash
cd services/chem-service
poetry run python -m unittest discover -s tests -p "test_*.py"
```

## Language Surface

The authoring surface is Markdown with structured blocks.

### Frontmatter

The parser requires these frontmatter keys:

- `id`
- `title`
- `date`

Recognized special keys include:

- `render_profile`
- `render_overrides`
- `tags`
- `primary_reaction`
- `primary_result`
- `primary_product`
- `primary_sample`
- `primary_molecule`
- `primary_analysis`

Other scalar frontmatter keys are preserved as metadata. `tags` must be a string array. `render_overrides` must be a one-level object with supported render option paths.

Built-in render profiles in the current code are:

- `eln-default`
- `publication-acs`
- `slides-large`

### Inline syntax

| Syntax | Meaning |
| --- | --- |
| `:chem[H2O]` | Inline chemistry token |
| `` `inline code` `` | Inline code token |
| `[label](https://example.com)` | Markdown link token with safety metadata |
| `@rxn-main` | Object reference |
| `@res-main.yield` | Object field reference |
| `@meta.title` | Metadata reference |
| `@result.yield` | Primary alias field reference |
| `@param.amount` | Template parameter reference |

### Structured blocks

Supported block families:

- `:::chemd`: molecule or reaction. New documents should declare `kind: molecule` or `kind: reaction`; field-shape inference remains a compatibility fallback.
- `:::result`: result fields such as `status`, `yield`, `conversion`, `selectivity`, `purity`, and notes.
- `:::analysis`: analysis fields; TLC-style lane fields `p1`, `p2`, ... are accepted.
- `:::sample`: sample metadata.
- `:::procedure`: freeform procedure text with optional `ref`.
- `:::observation`: freeform observation text with optional `ref`.
- `:::template`: template definition with `bind`, `params`, and `description`.
- `:::use`: template invocation.
- `:::col-N`: column layout block, for example `:::col-2`.

### Example document

```md
---
id: exp-v03
title: v0.3 internal language smoke
date: 2026-04-17
render_profile: publication-acs
primary_reaction: rxn-main
primary_result: res-main
tags:
  - demo
  - oxidation
---

# Ethanol oxidation to acetic acid

:::chemd #rxn-main
kind: reaction
reactants: CCO | O=O
products: CC(=O)O
solvent: THF
temperature: -78 °C
time: 30 min
atmosphere: nitrogen
:::

:::procedure #proc-main
1. Cool the substrate solution to -78 °C.
2. Add reagent under nitrogen.
3. Sample the reaction after 30 min for TLC.
:::

:::observation #obs-main
The mixture became deep red after addition.
:::

:::analysis #ana-tlc
type: tlc
ref: rxn-main
result: partial_conversion
data: TLC shows starting material remains
p1: sm 0.82 ^1(1) | 0.46 ^3(3)
p2: pd 0.80 1(1) | 0.42 3(3)
:::

:::result #res-main
status: partial
yield: 23%
purity: 91%
:::

:::chemd #mol-main
smiles: CCO
name: Ethanol
:::

Water marker: :chem[H2O]
Yield: @res-main.yield
```

## Compiler Pipeline

`@chemd/compiler` exposes `compileChemd(source, options)`. The current pipeline is:

```text
source markdown
  -> parseChemd()
  -> resolveChemd()
  -> typecheckDocument()
  -> resolveRenderProfileWithDiagnostics()
  -> buildRunPlan()
  -> preflightRun()
  -> buildLnf()
  -> exportTrainingRecordFromDocument()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

The returned `CompileResult` includes:

- resolved document and diagnostics
- render options and render adapter payload
- typed semantic graph
- lowered step graph
- runtime run plan and preflight result
- LNF v0.3 payload
- training export payload
- HTML, JSON, and DOCX bridge strings

For real DOCX files, `@chemd/compiler/node` exposes `compileChemdToDocx()`, which converts the DOCX bridge Markdown through Pandoc.

## Web Workbench

The playground entry point is `apps/web/src/app/page.tsx`.

Current UI capabilities:

- A sticky header with document metadata, selected render profile, compile status, and theme toggle.
- A source editor initialized from `apps/web/src/features/playground/lib/sample-source.ts`.
- Deferred compilation and preview refresh through `usePlaygroundDocumentController`.
- HTML preview, JSON output, and DOCX bridge output in the preview shell.
- DOCX export through `/api/export/docx`.
- Image OCR import and paste handling.
- Molecule/reaction editing through the chemistry editor dialog.
- Source write-back after OCR or chemistry editor saves.
- Per-session write protection based on the `chemd-session-token` cookie and `x-chemd-session-token` header.

## API Surface

### Next.js routes

The web app exposes these route handlers:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/export/json` | `POST` | Compile source and return normalized JSON |
| `/api/export/docx` | `POST` | Compile source and stream a `.docx` file through Pandoc |
| `/api/chem/draft` | `GET` | Read a saved molecule/reaction draft for a document block and session |
| `/api/chem/inventory` | `POST` | Resolve molecule/reaction inventory data through PubChem and LabStorageManager |
| `/api/chem/normalize` | `POST` | Normalize molecule notation through `chem-service` |
| `/api/chem/render` | `POST` | Render molecule or reaction notation |
| `/api/chem/save` | `POST` | Save molecule or reaction notation and cache the structure draft |
| `/api/chem/ocr` | `POST` | Run reaction-first OCR workflow with source write-back payloads |
| `/api/chem/reaction/ocr` | `POST` | Run reaction OCR directly |

Write routes that modify chemistry drafts require matching session token values in cookie and header.

### `chem-service` routes

The Flask service exposes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/healthz` | `GET` | Service health and provider readiness |
| `/ocr` | `POST` | Molecule OCR provider seam |
| `/normalize` | `POST` | Molecule normalization |
| `/render` | `POST` | Molecule rendering |
| `/reaction/ocr` | `POST` | Reaction OCR provider seam |
| `/reaction/render` | `POST` | Reaction rendering |
| `/structure` | `GET`, `POST` | Structure draft lookup and storage |

`chem-service` runs as the internal chemistry API behind the web app.

## Package Map

| Package | Main role |
| --- | --- |
| `@chemd/core` | AST types, diagnostic types, render override rules, reaction condition helpers, TLC helpers, loading SVG helper |
| `@chemd/parser` | Parses frontmatter, markdown text, inline tokens, structured blocks, templates, and column blocks |
| `@chemd/resolver` | Resolves references, primary aliases, default object IDs, template expansion, and semantic diagnostics |
| `@chemd/diagnostics` | Builds v0.3 diagnostics, diagnostic bands, and quick-fix metadata |
| `@chemd/typechecker` | Builds typed semantic graph, validates values, and emits semantic diagnostics |
| `@chemd/step-ontology` | Lowers procedure/observation/analysis text into step-oriented structures |
| `@chemd/runtime-lab` | Builds runtime plans and reports missing runtime capabilities |
| `@chemd/runtime-trace` | Creates trace events and replays traces against runtime steps |
| `@chemd/lnf` | Builds Chemd LNF v0.3 payloads |
| `@chemd/render-profile` | Resolves built-in render profiles and validates render overrides |
| `@chemd/renderer-html` | Renders compiled documents to preview HTML |
| `@chemd/renderer-json` | Renders compiled documents to JSON |
| `@chemd/renderer-docx` | Renders compiled documents to DOCX bridge Markdown |
| `@chemd/exporter-training` | Creates training export records from compiled documents |
| `@chemd/compiler` | Public orchestration API for the full compile/export/runtime path |
| `@chemd/web` | Next.js playground UI and server-side facade routes |

## Environment Variables

Configuration templates:

- `services/chem-service/.env.example`
- `deploy/playground/.env.example`
- `deploy/playground/env/web.env.example`
- `deploy/playground/env/chem-service.env.example`

### Web app

| Variable | Default | Used for |
| --- | --- | --- |
| `CHEM_SERVICE_BASE_URL` | `http://127.0.0.1:18081` | Server-side calls from `apps/web` to `chem-service` |
| `CHEM_SERVICE_ACCESS_KEY` | unset | Optional internal access key forwarded to `chem-service` |
| `PUBCHEM_PUG_REST_BASE_URL` | PubChem default in code | CAS/name metadata lookup |
| `PUBCHEM_PUG_REST_TIMEOUT_MS` | code default | PubChem request timeout |
| `PANDOC_PATH` | `pandoc` | DOCX export binary path |
| `LAB_STORAGE_BASE_URL` | `https://lab.thejiaogroup.cn/api` | LabStorageManager API base URL |
| `LAB_STORAGE_USERNAME` | unset | LabStorageManager login |
| `LAB_STORAGE_PASSWORD` | unset | LabStorageManager login |
| `LAB_STORAGE_DEVICE_ID` | `chemd-lab-storage-proxy` | LabStorageManager device id |
| `LAB_STORAGE_DEVICE_NAME` | `chemd server proxy` | LabStorageManager device name |

DOCX export currently limits concurrent exports to `1`, times out Pandoc after `15000` ms, and accepts request bodies up to `256 KiB`.

### `chem-service`

| Variable | Default/template value | Used for |
| --- | --- | --- |
| `CHEM_SERVICE_HOST` | `127.0.0.1` | Flask bind host |
| `CHEM_SERVICE_PORT` | `18081` | Flask bind port |
| `CHEM_SERVICE_ALLOW_ORIGINS` | local web origins | CORS allowlist |
| `CHEM_SERVICE_ACCESS_KEY` | unset | Optional internal access key |
| `CHEM_SERVICE_INTERNAL_ONLY` | code default | Loopback/internal request protection behavior |
| `CHEM_SERVICE_MAX_CONTENT_LENGTH` | `7252652` in template | Flask request body limit |
| `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH` | `6990508` in template | OCR image payload limit |
| `CHEM_SERVICE_MAX_UPLOAD_BYTES` | code default | Upload protection |
| `CHEM_SERVICE_CACHE_MAX_ENTRIES` | `256` | In-memory structure cache capacity |
| `CHEM_SERVICE_MOLECULE_OCR_PROVIDER` | `placeholder` | `placeholder`, `decimer`, `molscribe`, or `molnextr` |
| `CHEM_SERVICE_REACTION_OCR_PROVIDER` | `placeholder` | `placeholder`, `rxnscribe`, `rxnim`, or `rxncaption` |
| `CHEM_SERVICE_DECIMER_API_URL` | unset | Remote molecule OCR seam |
| `CHEM_SERVICE_DECIMER_TIMEOUT_SECONDS` | `60` | DECIMER timeout |
| `CHEM_SERVICE_DECIMER_API_KEY` | unset | DECIMER API key |
| `CHEM_SERVICE_MOLSCRIBE_API_URL` | unset | Remote molecule OCR seam |
| `CHEM_SERVICE_MOLSCRIBE_TIMEOUT_SECONDS` | `60` | MolScribe timeout |
| `CHEM_SERVICE_MOLSCRIBE_API_KEY` | unset | MolScribe API key |
| `CHEM_SERVICE_MOLNEXTR_API_URL` | unset | Remote molecule OCR seam |
| `CHEM_SERVICE_MOLNEXTR_TIMEOUT_SECONDS` | `60` | MolNEXTR timeout |
| `CHEM_SERVICE_MOLNEXTR_API_KEY` | unset | MolNEXTR API key |
| `CHEM_SERVICE_RXNSCRIBE_API_URL` | unset | Remote reaction OCR seam |
| `CHEM_SERVICE_RXNSCRIBE_TIMEOUT_SECONDS` | `60` | RxnScribe timeout |
| `CHEM_SERVICE_RXNSCRIBE_API_KEY` | unset | RxnScribe API key |
| `CHEM_SERVICE_RXNIM_API_URL` | unset | Remote reaction OCR seam |
| `CHEM_SERVICE_RXNIM_TIMEOUT_SECONDS` | `60` | RXNIM timeout |
| `CHEM_SERVICE_RXNIM_API_KEY` | unset | RXNIM API key |
| `CHEM_SERVICE_RXNCAPTION_API_URL` | unset | Remote reaction OCR seam |
| `CHEM_SERVICE_RXNCAPTION_TIMEOUT_SECONDS` | `60` | RXNCaption timeout |
| `CHEM_SERVICE_RXNCAPTION_API_KEY` | unset | RXNCaption API key |

## Testing

Recommended verification by change type:

```bash
# All TypeScript package/web tests
pnpm test

# All TypeScript checks
pnpm typecheck

# ESLint
pnpm lint

# Demo launcher contract
pnpm test:dev-demo

# Python service tests
cd services/chem-service
poetry run python -m unittest discover -s tests -p "test_*.py"
```

The current repository has tests for every TypeScript package, the web route/component helpers under `apps/web/tests`, the demo launcher, and `services/chem-service/tests`.

## Deployment

Playground deployment assets:

Relevant files:

- `deploy/playground/compose.yaml`
- `deploy/playground/web.Dockerfile`
- `deploy/playground/chem-service.Dockerfile`
- `deploy/playground/nginx/chemd-playground.conf`
- `deploy/playground/systemd/chemd-playground-web.service`
- `deploy/playground/systemd/chemd-playground-chem.service`
- `deploy/playground/env/web.env.example`
- `deploy/playground/env/chem-service.env.example`

The intended topology is:

```text
public traffic
  -> nginx
  -> apps/web
  -> chem-service
```

Keep the public boundary at the web app. In the Compose file, the public port is bound to `127.0.0.1:${PUBLIC_WEB_PORT:-2436}` and `chem-service` remains a backend service dependency.

## Runtime Notes

- Public traffic enters through the web app, with `chem-service` kept on loopback or a trusted internal network.
- RDKit-backed rendering depends on the Python environment actually installing and importing RDKit.
- OCR routes exist, but the default provider is `placeholder`; production OCR requires external provider URLs and keys.
- DOCX export requires Pandoc. The compiler can produce DOCX bridge Markdown independently; the web DOCX route needs Pandoc to create a `.docx`.
- Lab inventory lookup requires LabStorageManager credentials and network access to the configured API.
- `services/chem-service` uses in-memory structure storage for the current playground flow.
