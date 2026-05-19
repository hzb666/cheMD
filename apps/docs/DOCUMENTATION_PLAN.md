# Chemd Documentation Implementation Plan

## Scope

- Build `apps/docs` as a Fumadocs-based bilingual documentation app.
- Keep the primary content in a single mirrored Chemd manual with language, experiment-record, validation, workflow, advanced-language, appendix, and codebase sections.
- Base language semantics on the current implementation in `packages/core`, `packages/parser`, `packages/resolver`, `packages/compiler`, and checked-in fixtures.
- Base codebase topics on existing tracked paths under `apps`, `packages`, `services`, and `scripts`.
- Use `.zread` as a classification and manual-organization reference only.
- Do not use ignored directories as documentation sources or output targets.
- Avoid chat-style prose, rhetorical questions, contrastive rewrite phrases, and speculative product language.

## Checklist

- [x] Rebuild the Fumadocs content tree around the current manual structure.
- [x] Create Chinese and English index pages for the manual sections.
- [ ] Expand the language manual to cover syntax, objects, references, workflows, templates, compiler semantics, diagnostics, and CLI workflows.
- [ ] Add the codebase guide to cover monorepo structure, core packages, parser, resolver, compiler, apps, services, CLI, tests, and contributor workflows.
- [x] Keep page order explicit through `meta.json`.
- [ ] Use current code and fixtures as source evidence for implementation details.
- [ ] Use `.zread` only to compare topic grouping and coverage.
- [ ] Verify every module topic against tracked files before writing claims.
- [ ] Exclude ignored build, cache, dependency, and generated directories from documentation evidence.
- [ ] Run wording scans for banned patterns.
- [ ] Run `@chemd/docs` typecheck.
- [ ] Run `@chemd/docs` build.

## Chemd Language Manual

### 1. Language Overview

- Chemd file model
- `.chemd`
- Author surface, AST, compiler output
- Current supported language surface
- Minimal valid document

### 2. Document Structure and Frontmatter

- Required `id`, `title`, `date`
- `primary_*` declarations
- Metadata extensions
- `tags`
- `render_profile`
- `render_overrides`
- Frontmatter diagnostics

### 3. Markdown Prose and Inline Syntax

- Markdown paragraphs
- Object references
- Object field references
- Primary alias references
- Metadata references
- Template parameter references
- Inline chemistry
- Markdown links

### 4. Structured Block Fundamentals

- `:::` block syntax
- Block ID syntax
- Field line grammar
- List fields
- Multi-field physical lines
- Unknown fields
- Default object IDs

### 5. Molecules and Reactions

- `:::chemd` as the unified surface
- Molecule fields
- Reaction fields
- `kind` declaration
- `kind` inference
- Reactant and product references
- Route fields
- Chemistry feature references

### 6. Results and Analysis

- `:::result`
- Result association fields
- Yield and purity fields
- `:::analysis`
- TLC lane fields
- Analysis defaults
- Required analysis fields

### 7. Procedures and Observations

- `:::procedure`
- Inline `step:`
- Nested `:::step`
- Step dependencies
- Evidence and confidence
- `:::observation`
- Inline `event:`
- Event and step linkage

### 8. Samples, Artifacts, and Evidence

- `:::sample`
- Sample lineage
- Sample artifacts
- `:::artifact`
- File evidence
- Instrument metadata
- Evidence-chain modeling

### 9. Condition Screens

- `:::condition-varies`
- `standard`
- `condition`
- `varies`
- `varN`
- `resN`
- `noteN`
- `mode=override`
- Attempt references

### 10. Templates and Layout

- `:::template`
- `params`
- String parameters
- Reference parameters
- Quantity parameters
- `bind`
- `:::use`
- Expansion limits
- `:::col`

### 11. Compiler Semantics

- Parse stage
- Resolver stage
- Object index
- Reference resolution
- Required fields
- Primary reference validation
- Template expansion
- Output contracts

### 12. Diagnostics and Repair

- Frontmatter diagnostics
- ID diagnostics
- Field diagnostics
- List diagnostics
- Reference diagnostics
- Template diagnostics
- Required-field diagnostics
- Repairable patterns

### 13. CLI Workflows

- `validate`
- `export`
- `graph`
- `diff`
- `repair`
- `agent-loop`
- Recommended local validation order

## Codebase Section

### 1. Codebase Overview

- Monorepo structure
- Apps, packages, services, scripts
- Source-to-output flow
- Web, desktop, CLI, compiler relationships
- Entry file index

### 2. Core Packages

- `@chemd/core`
- `@chemd/parser`
- `@chemd/resolver`
- `@chemd/compiler`
- `@chemd/diagnostics`
- `@chemd/typechecker`
- `@chemd/step-ontology`
- `@chemd/runtime-lab`
- `@chemd/runtime-trace`
- `@chemd/lnf`

### 3. Parser Implementation

- `parseChemd`
- Frontmatter parser
- Body parser
- Block parser registry
- Field parsing
- List parsing
- Source spans
- Inline tokenizers

### 4. Resolver Implementation

- Object index
- Duplicate ID checks
- Primary aliases
- Object references
- Field references
- Condition attempt references
- Default IDs
- Template expansion
- Required-field validation

### 5. Compiler and Export Pipeline

- `compileChemd`
- Parser and resolver composition
- Typechecker integration
- HTML output
- JSON output
- DOCX bridge
- RAG export
- Training export
- Audit export
- Graph index export

### 6. Web Application

- `apps/web`
- Playground shell
- Editor and preview
- Diagnostics surface
- API routes
- Chemistry service proxy
- DOCX export
- Package dependencies

### 7. Desktop Application

- `apps/desktop`
- Tauri architecture
- Monaco editor integration
- Workspace file IO
- Rust commands
- Workspace index
- PostgreSQL profile integration
- Graph and RAG surfaces

### 8. Chemistry Service

- `services/chem-service`
- Molecule normalization
- Molecule rendering
- Reaction rendering
- OCR provider adapters
- RDKit integration
- Service boundary with web routes

### 9. CLI and Scripts

- CLI command structure
- Validation commands
- Export commands
- Graph commands
- Repair commands
- Agent loop commands
- Repo smoke scripts

### 10. Testing and Quality

- Vitest workspace
- Parser tests
- Resolver tests
- Compiler fixtures
- Web tests
- Desktop tests
- Script tests
- Python service tests
- Typecheck, lint, build

### 11. Contributor Workflows

- Local environment
- pnpm workspace commands
- Adding a block parser
- Adding a field
- Adding a diagnostic
- Adding an export format
- Adding fixtures
- Updating docs with language changes
