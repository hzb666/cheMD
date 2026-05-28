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
- [ ] Expand the language manual to cover program syntax, declarations, references, workflows, compiler semantics, diagnostics, and CLI workflows.
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

### 2. Program Structure and Metadata

- `module` declaration
- Required `meta.id`, `meta.title`, `meta.date`
- `primary_*` references
- Metadata extensions
- `tags`
- `render_profile`
- `render_overrides`
- Legacy source removal diagnostics

### 3. Markdown Prose and Inline Syntax

- Doc comments and Markdown documentation blocks
- Object references
- Object field references
- Primary alias references
- Metadata references
- Inline chemistry
- Markdown links

### 4. Declaration Fundamentals

- Declaration syntax
- Declaration ID syntax
- Field grammar
- List fields
- Unknown fields
- Source ranges

### 5. Molecules and Reactions

- `molecule` declarations
- `reaction` declarations
- Molecule fields
- Reaction fields
- Reactant and product references
- Route fields
- Chemistry feature references

### 6. Results and Analysis

- `result` declarations
- Result association fields
- Yield and purity fields
- `analysis` declarations
- TLC lane fields
- Analysis defaults
- Required analysis fields

### 7. Procedures and Observations

- `procedure` declarations
- Program `step` statements
- Step dependencies
- Evidence and confidence
- `observation` declarations
- Event and step linkage

### 8. Samples, Artifacts, and Evidence

- `sample` declarations
- Sample lineage
- Sample artifacts
- `artifact` declarations
- File evidence
- Instrument metadata
- Evidence-chain modeling

### 9. Condition Screens

- `condition_screen` declarations
- `standard`
- `factor`
- `outcome`
- Attempt references

### 10. Compiler Semantics

- Parse stage
- Resolver stage
- Program symbol table
- Reference resolution
- Required fields
- Primary reference validation
- Output contracts

### 11. Diagnostics and Repair

- Legacy source diagnostics
- ID diagnostics
- Field diagnostics
- List diagnostics
- Reference diagnostics
- Required-field diagnostics
- Repairable patterns

### 12. CLI Workflows

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
