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

`chemd` is a Markdown-based semantic system for chemistry documents and experimental records.  
The current product prototype is centered on `Editor + Preview`, with a document pipeline that supports structured chemistry blocks, references, templates, rendering profiles, OCR-assisted ingestion, chemistry-aware preview, and source write-back.

## Table of Contents

- [Overview](#overview)
- [Current Focus](#current-focus)
- [Interaction Flow](#interaction-flow)
- [Getting Started](#getting-started)
- [Example Document](#example-document)
- [Milestones](#milestones)
- [Current Constraints](#current-constraints)
- [Developer Guide](#developer-guide)
- [Repository Layout](#repository-layout)
- [Architecture](#architecture)
- [Packages and Services](#packages-and-services)
- [Web API Surface](#web-api-surface)
- [Environment Variables](#environment-variables)
- [Commands](#commands)
- [Testing](#testing)
- [Deployment Notes](#deployment-notes)
- [Project Status](#project-status)

## Overview

`chemd` is designed for chemistry documentation workflows that need more structure than conventional Markdown and more document fidelity than standalone structure editors. The system keeps Markdown as the source of truth while adding a controlled semantic layer for chemistry-specific content.

The current prototype supports:

- Structured chemistry blocks for `molecule`, `reaction`, `result`, `analysis`, `sample`, `template`, and `use`
- Inline chemistry expressions and document references
- Document compilation through parser, resolver, render-profile, and renderer stages
- A web workbench with synchronized editing and preview
- OCR-assisted molecule and reaction ingestion
- A chemistry service that handles normalization, rendering, structure cache, and OCR provider seams
- HTML preview, JSON inspection output, SVG fallback rendering, and a DOCX export bridge

The intended operating model is document-first. OCR, rendering, structure editing, and preview updates all converge back into the Markdown source instead of creating a disconnected UI state.

## Current Focus

The current public README focuses on what the repository already supports today. Detailed `v0.1` scope boundaries and milestone decisions are maintained in [`docs/chemd-v0.1-功能计划与实现进度.md`](docs/chemd-v0.1-%E5%8A%9F%E8%83%BD%E8%AE%A1%E5%88%92%E4%B8%8E%E5%AE%9E%E7%8E%B0%E8%BF%9B%E5%BA%A6.md) and [`docs/chemd-v0.1-spec.zh-CN.md`](docs/chemd-v0.1-spec.zh-CN.md).

### Current Product Surface

- Markdown-based chemistry document authoring
- Structured document compilation
- `Editor + Preview` web experience
- `molecule` and `reaction` as first-class product objects
- Render profile selection and document-level overrides
- OCR entry points for chemistry ingestion
- Chemistry-aware preview hydration
- Source write-back from preview and structure editing
- DOCX bridge export

## Interaction Flow

The current end-to-end interaction model is:

1. Author Markdown and `chemd` blocks in the editor.
2. Compile the source into a structured document tree with diagnostics, references, templates, and render profile resolution.
3. Render the same source into preview outputs.
4. Ingest chemistry from images through OCR when needed.
5. Promote OCR results into standard `molecule` or `reaction` blocks.
6. Refine the result through the embedded chemistry editor.
7. Persist the final state back into the Markdown source.

This keeps the document, the preview, and the chemistry interaction surfaces aligned around a single source of truth.

## Getting Started

### Prerequisites

For the full local demo stack:

- Node.js `20+`
- `pnpm` `10+`
- Python `3.14`
- `Poetry`

Notes:

- The monorepo uses `pnpm` at the root.
- `services/chem-service` is managed with Poetry and is not part of the `pnpm` workspace.
- The full local service path currently follows [`services/chem-service/pyproject.toml`](services/chem-service/pyproject.toml), which requires `Python >=3.14,<3.15`.

### Install workspace dependencies

```bash
pnpm install
```

### Install `chem-service` dependencies

```bash
cd services/chem-service
poetry install
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

### Start the full demo stack

From the repository root:

```bash
pnpm dev
```

The demo launcher starts:

- Web: `http://127.0.0.1:2436`
- `chem-service`: `http://127.0.0.1:18081`

If you want frontend + backend hot reload together, start the stack with:

```bash
pnpm dev --reload
```

In this mode the web app still runs with Next.js dev, and `chem-service` runs with Flask reload enabled.

### Start the web application only

```bash
pnpm dev:web
```

This mode is useful for UI work, but any feature that depends on `chem-service` will be unavailable or fall back to degraded behavior.

### OCR provider configuration

The repository includes OCR provider seams, but real OCR quality depends on external configuration:

- Molecule OCR depends on provider-backed integration
- Reaction OCR depends on provider-backed integration

Provider variables are listed in [Environment Variables](#environment-variables).

## Example Document

```md
---
entry_type: experiment # Optional. Document category such as experiment or note.
id: exp-2026-03-30-001 # Required. Unique document id. Falls back to draft-document when omitted.
title: Ethanol oxidation to acetic acid # Required. Human-readable document title. Falls back to Untitled chemd document.
author: zhibin hu # Optional. Record author or owner.
date: 2026-03-30 # Required. Preferred in YYYY-MM-DD. Falls back to 1970-01-01 when omitted.
project: oxidation-study # Optional. Project or study grouping label.
status: completed # Optional. High-level record status for display or downstream processing.
primary_reaction: rxn-main # Optional. Declares the main reaction object for alias/reference resolution.
primary_result: res-main # Optional. Declares the main result object for alias/reference resolution.
render_profile: eln-default # Optional. Render profile id. Falls back to eln-default when omitted or invalid.
render_overrides: # Optional. One-level render override map applied on top of the selected profile.
  structure.bondLineWidth: 2.1 # Optional. Example override for structure stroke width.
tags: # Optional. String array for filtering or lightweight classification.
  - oxidation # Optional tag item.
  - copper # Optional tag item.
---

This record documents the target transformation @rxn-main and the outcome @res-main.yield.

:::molecule #mol-ethanol
smiles: CCO
name: Ethanol
role: reactant
:::

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
yield: 63%
:::

:::result #res-main
status: success
yield: 63%
notes: Product isolated as colorless liquid.
:::
```

The current language surface includes:

- YAML frontmatter
- `:chem[...]` inline chemistry expressions
- `:::molecule`
- `:::reaction`
- `:::result`
- `:::analysis`
- `:::sample`
- `:::template`
- `:::use`
- `@id`, `@id.field`, `@meta.*`, and primary-object aliases

## Milestones

The current `v0.1` track is best understood through delivered capabilities and near-term product milestones, rather than internal implementation status.

### Current Capabilities

- [x] `Editor + Preview` is the default product surface.
- [x] The document compilation pipeline `source -> parser -> resolver -> render-profile -> preview/output` is operational.
- [x] `molecule` and `reaction` are formal first-class objects in the `v0.1` product narrative.
- [x] References, template definition and invocation, nested expansion, and cycle detection are implemented.
- [x] `render-profile` supports built-in profiles, inheritance, fallback, overrides, and base validation.
- [x] HTML preview, JSON output, SVG fallback rendering, and DOCX bridge output are implemented.
- [x] `reaction.conditions` is part of the AST, parser, renderer, and export contract.
- [x] `chem-service` provides an RDKit-first render path, OCR seams, and structure cache support.
- [x] A unified chemistry editor is in place, and the molecule editing path already runs on an embedded Ketcher-based loop.
- [x] Web write operations use a minimal local single-session protection model based on session token and preview token.

### Roadmap

- [ ] Extend OCR from prototype integration to a fully validated product workflow for both molecule and reaction use cases.
- [ ] Complete the reaction editing experience to the same standard as the current molecule editing path.
- [ ] Continue improving the chemistry rendering path and external runtime integration.
- [ ] Further reduce the gap between the workbench shell and formal product features.

## Current Constraints

The current repository should still be described conservatively in a few areas:

- Reaction editing is on the product path, but it should not yet be presented as complete parity with the molecule editing flow.
- OCR is available in the product surface, but real accuracy and readiness still depend on external service configuration.
- `chem-service` is intended as an internal chemistry runtime and should not be treated as a public-facing service.
- The repository does not currently ship with a production deployment bundle or deployment templates.

---

## Developer Guide

## Repository Layout

The repository is a `pnpm` workspace and Turborepo monorepo:

```text
chemd/
├── apps/
│   └── web/                    # Next.js 15 workbench and API facade
├── packages/
│   ├── compiler/               # Orchestration entry point
│   ├── core/                   # AST, diagnostics, shared contracts
│   ├── exporter-training/      # Training export implementation package
│   ├── parser/                 # Frontmatter, block, and token parsing
│   ├── render-profile/         # Profiles, overrides, fallback, validation
│   ├── renderer-docx/          # DOCX bridge output
│   ├── renderer-html/          # HTML renderer
│   ├── renderer-json/          # JSON renderer
│   ├── renderer-svg/           # SVG fallback renderer
│   └── resolver/               # References, template expansion, semantic validation
├── services/
│   └── chem-service/           # Flask chemistry service, outside the pnpm workspace
├── scripts/
│   └── dev-demo.mjs            # Full demo launcher
└── vision/                     # Visual assets and logo files
```

## Architecture

### Document compilation pipeline

```text
source markdown
  -> parseChemd()
  -> resolveChemd()
  -> resolveRenderProfileWithDiagnostics()
  -> renderHtml()
  -> renderJson()
  -> renderDocxBridge()
```

### Chemistry interaction pipeline

```text
image / screenshot
  -> OCR provider
  -> normalize / render backend
  -> write back chemd block
  -> preview
  -> chemistry editor
  -> write back chemd block
```

### Service boundary

```text
apps/web
  -> /api/chem/*
  -> services/chem-service
```

The main engineering boundary is stable and intentional:

- semantic AST is distinct from render parameters
- `render-profile` is the canonical layer for style and render constraints
- the web application owns session handling, facade routes, and preview token logic
- `chem-service` owns chemistry-specific runtime behavior such as RDKit integration, OCR seams, and structure cache

## Packages and Services

| Module | Responsibility | Status |
| --- | --- | --- |
| `@chemd/core` | AST, diagnostics, shared contracts | `v0.1` core |
| `@chemd/parser` | frontmatter, blocks, inline chemistry, references | `v0.1` core |
| `@chemd/resolver` | references, template expansion, semantic validation | `v0.1` core |
| `@chemd/render-profile` | profile registry, inheritance, fallback, overrides, validation | `v0.1` core |
| `@chemd/compiler` | unified orchestration API | `v0.1` core |
| `@chemd/renderer-html` | HTML output | `v0.1` core |
| `@chemd/renderer-json` | JSON output | `v0.1` core |
| `@chemd/renderer-svg` | fallback SVG rendering | `v0.1` core, but fallback-only in positioning |
| `@chemd/renderer-docx` | DOCX bridge output | `v0.1` core |
| `@chemd/exporter-training` | training export pipeline | experimental |
| `apps/web` | product workbench, chemistry facade routes, UI interaction | main product entry point |
| `services/chem-service` | RDKit-first render, OCR seams, structure cache | downstream chemistry service |

## Web API Surface

The Next.js application currently exposes:

- `POST /api/chem/ocr`
- `POST /api/chem/normalize`
- `POST /api/chem/render`
- `GET|POST /api/chem/structure`
- `POST /api/chem/structure/save`
- `POST /api/chem/reaction/ocr`
- `POST /api/chem/reaction/render`
- `POST /api/chem/reaction/save`
- `GET|POST /api/chem/reaction/structure`
- `POST /api/export/docx`

The chemistry service currently exposes:

- `GET /healthz`
- `POST /ocr`
- `POST /reaction/ocr`
- `POST /normalize`
- `POST /render`
- `POST /reaction/render`
- `GET|POST /structure`

The current OCR behavior in code is:

- the unified web OCR entry first attempts a reaction OCR path
- if reaction OCR does not return a usable reaction payload, it falls back to the molecule OCR path
- final output quality depends on provider configuration and external service readiness

## Environment Variables

There is no root-level `.env.example`.  
The only existing template is [`services/chem-service/.env.example`](services/chem-service/.env.example).

At the same time:

- `apps/web` reads additional runtime variables, but the repository does not provide a dedicated root template for them
- `services/chem-service/.env.example` does not include every variable that the code can read

The list below reflects the currently observable runtime surface.

### Network and limits

| Variable | Purpose | Notes |
| --- | --- | --- |
| `CHEM_SERVICE_HOST` | bind host | defaults to `127.0.0.1` |
| `CHEM_SERVICE_PORT` | bind port | defaults to `18081` |
| `CHEM_SERVICE_ALLOW_ORIGINS` | CORS allowlist | defaults to local `2436` origins |
| `CHEM_SERVICE_MAX_CONTENT_LENGTH` | request body limit | aligned with the 5 MiB raw image contract |
| `CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH` | base64 image limit | aligned with upload size |
| `CHEM_SERVICE_CACHE_MAX_ENTRIES` | structure cache capacity | defaults to `256` |

### Web facade and export runtime

These variables are referenced by code, but are not provided through a root-level template:

| Variable | Purpose |
| --- | --- |
| `CHEM_SERVICE_BASE_URL` | base URL used by `apps/web` to call `chem-service` |
| `CHEM_SERVICE_ACCESS_KEY` | access key forwarded by `apps/web` when calling protected chemistry service routes |
| `PUBCHEM_PUG_REST_BASE_URL` | base URL for CAS to SMILES resolution through PubChem |
| `PUBCHEM_PUG_REST_TIMEOUT_MS` | timeout for PubChem calls |
| `PANDOC_PATH` | Pandoc executable path for DOCX export flow |

### OCR provider selection

| Variable | Purpose |
| --- | --- |
| `CHEM_SERVICE_MOLECULE_OCR_PROVIDER` | molecule OCR provider: `decimer`, `molscribe`, `molnextr` |
| `CHEM_SERVICE_REACTION_OCR_PROVIDER` | reaction OCR provider: `rxnscribe`, `rxnim`, `rxncaption` |

### Reaction OCR and remote seams

| Variable | Purpose |
| --- | --- |
| `CHEM_SERVICE_RXNSCRIBE_API_URL` | RxnScribe HTTP endpoint |
| `CHEM_SERVICE_RXNSCRIBE_TIMEOUT_SECONDS` | RxnScribe timeout |
| `CHEM_SERVICE_RXNSCRIBE_API_KEY` | optional RxnScribe API key |
| `CHEM_SERVICE_RXNIM_API_URL` | reserved seam |
| `CHEM_SERVICE_RXNCAPTION_API_URL` | reserved seam |

### Remote molecule OCR seams

| Variable | Purpose |
| --- | --- |
| `CHEM_SERVICE_DECIMER_API_URL` | DECIMER service URL |
| `CHEM_SERVICE_MOLSCRIBE_API_URL` | MolScribe service URL |
| `CHEM_SERVICE_MOLNEXTR_API_URL` | MolNexTR service URL |

### Security and internal access

The chemistry service also uses:

- `CHEM_SERVICE_ACCESS_KEY`
- `CHEM_SERVICE_INTERNAL_ONLY`
- `CHEM_SERVICE_MAX_UPLOAD_BYTES`

Operationally, this means:

- the default local setup is intended for loopback or trusted internal use
- cross-network deployments should use an access key and a deliberate trust boundary

### Runtime notes

Two practical environment points matter during local setup:

- the full local `chem-service` path follows Poetry and the Python requirement declared in [`services/chem-service/pyproject.toml`](services/chem-service/pyproject.toml)
- successful lightweight tests do not automatically imply a complete RDKit-capable runtime

## Commands

### Repository root

| Command | Purpose |
| --- | --- |
| `pnpm install` | install workspace dependencies |
| `pnpm dev` | start the full demo stack: web + `chem-service` |
| `pnpm dev --reload` | start the full demo stack with backend auto-reload |
| `pnpm dev:demo` | explicit demo launcher alias |
| `pnpm dev:web` | start the web workbench only |
| `pnpm build` | build the monorepo |
| `pnpm test` | run workspace tests |
| `pnpm test:dev-demo` | run the demo launcher test |
| `pnpm typecheck` | run TypeScript type checks |
| `pnpm lint` | run ESLint |
| `pnpm lint:fix` | run ESLint with automatic fixes |
| `pnpm lint:py` | run Ruff linting for `services/chem-service` |
| `pnpm format:check:py` | check Python formatting |
| `node --test scripts/dev-demo.test.mjs` | verify the demo launcher contract |

### Package-scoped commands

| Command | Purpose |
| --- | --- |
| `pnpm --filter @chemd/web test` | run web tests |
| `pnpm --filter @chemd/web build` | build the web app |
| `pnpm --filter @chemd/parser test` | run parser tests |
| `pnpm --filter @chemd/compiler test` | run compiler tests |
| `pnpm --filter @chemd/renderer-html test` | run HTML renderer tests |
| `pnpm --filter @chemd/renderer-svg test` | run fallback SVG tests |
| `pnpm --filter @chemd/renderer-docx test` | run DOCX bridge tests |

### `chem-service`

| Command | Purpose |
| --- | --- |
| `poetry install` | install Python dependencies |
| `poetry run python app.py` | start the service |
| `poetry run python -m unittest discover -s tests -p "test_*.py"` | run Python tests |
| `poetry check` | validate Poetry configuration |
| `GET /healthz` | inspect provider readiness |

## Testing

The repository currently has two main verification paths.

### TypeScript and web workspace

```bash
pnpm test
pnpm typecheck
```

### Python chemistry service

```bash
cd services/chem-service
poetry run python -m unittest discover -s tests -p "test_*.py"
```

For scoped changes, targeted verification is recommended before full test runs:

```bash
pnpm --filter @chemd/web test -- tests/page.test.tsx
pnpm --filter @chemd/compiler test -- compiler.test.ts
pnpm --filter @chemd/renderer-docx test -- renderer-docx.test.ts
```

## Deployment Notes

The repository does not currently include root-level production deployment assets such as:

- `Dockerfile`
- `docker-compose.yml`
- `vercel.json`
- `render.yaml`
- `fly.toml`
- `railway.toml`

The clearest supported operating mode today is the local demo stack.

For service topology, the intended trust model is:

```text
apps/web -> chem-service
```

on a trusted local or internal boundary.

Important operational notes:

- `chem-service` should not be documented or treated as a public internet-facing service
- RDKit-first behavior depends on the runtime environment actually having RDKit available
- OCR seams are present, but real provider readiness depends on external configuration and service availability
- fallback behavior is a resilience mechanism, not evidence of complete chemistry backend delivery

## Project Status

`chemd` is currently best described as a chemistry document product prototype with a converged `Editor + Preview` surface, a stable document compilation core, and an increasingly formal chemistry interaction layer.

At the current stage:

- `v0.1` is centered on `Editor + Preview`
- `molecule` and `reaction` are the formal product objects
- HTML, JSON, SVG fallback, and DOCX bridge outputs are implemented
- the unified chemistry editor is the active runtime path
- the remaining work is concentrated on OCR provider validation and continued reaction editing refinement
