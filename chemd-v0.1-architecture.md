# chemd v0.1 Architecture Document

Status: Draft for implementation  
Audience: agent implementing parser, resolver, renderer, editor, export pipeline  
Scope: v0.1 MVP

---

## 1. Goals

The v0.1 architecture must support these product goals:

1. `chemd` documents remain plain Markdown files.
2. Chemical and experiment objects become structured AST nodes.
3. The system supports lightweight references and reusable templates.
4. Render style is configurable through independent render profiles.
5. The same source document can drive:
   - human-readable HTML preview
   - machine-readable JSON
   - SVG structure/reaction output
   - export-oriented HTML/DOCX pipeline
6. The implementation stays small enough to ship quickly.

---

## 2. Non-Goals

v0.1 does not attempt to provide:

- a full graphical molecule editor
- a full desktop ELN application
- a complete bidirectional DOCX editor
- arbitrary programmable templating
- deep schema standardization for all analytical techniques
- per-bond manual geometry editing in the language layer

---

## 3. Recommended Tech Stack

### 3.1 Language and runtime

- TypeScript
- Node.js runtime for parser/export pipeline
- Browser runtime for preview app

### 3.2 Markdown parsing

Recommended primary stack:

- `unified`
- `remark-parse`
- `remark-frontmatter`
- custom `chemd` plugin(s)

Optional helper:

- `remark-directive` if the implementation chooses to reuse directive parsing instead of fully custom block scanning

### 3.3 Inline chemistry rendering

- KaTeX + `mhchem` extension for `:chem[...]`

### 3.4 Molecule rendering

- RDKit.js as the primary structure rendering engine
- adapter boundary kept open for Ketcher/Indigo-backed workflows later

### 3.5 Export

- JSON export from normalized AST
- HTML renderer for preview
- SVG output for molecule and reaction visuals
- optional Pandoc-based DOCX export stage after HTML / markdown transformation

### 3.6 UI

For v0.1, a simple web playground is sufficient:

- left pane: source markdown
- middle pane: rendered preview
- right pane: normalized JSON + diagnostics

---

## 4. Architecture Principle: Semantic AST vs Render Options

This is a hard architectural boundary.

### 4.1 Semantic AST contains

- frontmatter metadata
- `molecule`, `reaction`, `result`, `analysis`, `sample`
- references
- templates and template use sites
- normalized document structure

### 4.2 Render options contain

- selected render profile id
- resolved render tokens such as bond length, bond line width, multiple bond offset, hash spacing, font sizing, monochrome/color mode, export margin, background color, DPI
- renderer-specific adapter values for RDKit.js or future engines

### 4.3 Consequence

No semantic block node may directly own style properties like `bond_length`, `bond_line_width`, or `hash_spacing`.

---

## 5. System Overview

The system should be designed as a multi-stage pipeline, not a single render pass.

```text
source .md
  -> frontmatter parse
  -> markdown parse
  -> chemd block parse
  -> AST normalization
  -> object indexing
  -> template indexing
  -> reference resolution
  -> template expansion
  -> validation
  -> render profile resolution
  -> render adapter mapping
  -> output renderers (HTML / JSON / SVG / DOCX bridge)
```

### 5.1 Why pipeline architecture

This architecture separates concerns:

- syntax parsing is independent from semantic resolution
- template expansion is independent from markdown tokenization
- style resolution is independent from semantic object parsing
- HTML rendering is independent from JSON export
- diagnostics can be attached at every stage

---

## 6. Monorepo Layout

Recommended repository structure:

```text
chemd/
  packages/
    core/
    parser/
    resolver/
    render-profile/
    renderer-html/
    renderer-json/
    renderer-svg/
    renderer-docx/
    react/
  apps/
    playground/
  docs/
    chemd-v0.1-spec.md
    chemd-v0.1-architecture.md
    chemd-render-profile-v0.1-spec.md
```

### 6.1 Package responsibilities

#### `packages/core`

Shared domain types and utilities:

- AST types
- diagnostics types
- standard block definitions
- identifier validators
- helper tokenizers

#### `packages/parser`

Responsible for:

- reading frontmatter
- parsing markdown into mdast or equivalent
- detecting `chemd` inline and block syntax
- constructing normalized semantic AST nodes

#### `packages/resolver`

Responsible for:

- object index creation
- template index creation
- alias resolution
- `@...` reference resolution
- template expansion
- semantic validation pass

#### `packages/render-profile`

Responsible for:

- loading profile definitions
- validating profile schema
- merging defaults + selected profile + document overrides
- converting generic render tokens into resolved render options

#### `packages/renderer-html`

Responsible for:

- transforming resolved AST to HTML
- rendering `:chem[...]`
- rendering molecule blocks as SVG/HTML
- rendering result/analysis/sample blocks as formatted HTML sections
- consuming resolved render options

#### `packages/renderer-json`

Responsible for:

- serializing normalized AST
- serializing resolved object graph
- serializing diagnostics
- serializing selected render profile and resolved render options separately

#### `packages/renderer-svg`

Responsible for:

- structure and reaction visual generation as SVG
- adapter mapping to RDKit.js or future engines
- export-safe SVG generation

#### `packages/renderer-docx`

v0.1 recommendation:

- keep this thin
- either transform to an intermediate markdown/html representation for Pandoc
- or emit a structured export model consumed by an external DOCX bridge

#### `packages/react`

Optional view components:

- preview renderer components
- diagnostics panel components
- render profile selector components
- block cards

#### `apps/playground`

Minimal development UI and integration test harness.

---

## 7. Parsing Strategy

### 7.1 Recommended approach

Use a hybrid parser approach:

1. parse frontmatter first
2. parse markdown body
3. intercept and normalize `chemd` block syntax and inline syntax

This can be implemented in either of two ways:

#### Option A: remark-first

- rely on `remark` / `mdast`
- implement custom block transformation plugins
- optionally use `remark-directive` for directive syntax

Pros:

- ecosystem-friendly
- easier future MDX/remark integration
- easier downstream AST manipulation

Cons:

- directive edge cases may require custom handling anyway
- more mdast-specific knowledge needed

#### Option B: pre-scan + markdown parse

- pre-scan source text for `chemd` blocks and `:chem[...]`
- replace them with placeholders
- run markdown parser
- rehydrate placeholders into AST nodes

Pros:

- tighter control over syntax
- fewer surprises from generic markdown directive parsing

Cons:

- more custom code
- placeholder mapping complexity

### 7.2 Recommendation

For v0.1, prefer **Option A with a custom normalization layer**, unless directive parsing becomes unstable for the chosen syntax. If the implementation hits parser ambiguity, switching the block scanner to a small custom pre-parser is acceptable.

---

## 8. AST Model

The AST must distinguish between:

1. ordinary markdown nodes
2. structured `chemd` semantic nodes
3. unresolved reference tokens
4. resolved render profile selection metadata

### 8.1 Document-level types

Recommended top-level document model:

```ts
interface ChemdDocument {
  type: 'document'
  meta: Record<string, unknown>
  children: ChemdNode[]
  diagnostics: Diagnostic[]
  renderSelection?: RenderSelection
}
```

### 8.2 Structured block shape

```ts
interface BaseChemdBlock {
  type: string
  id?: string
  raw?: string
  position?: SourceRange
}
```

Specific semantic nodes extend this model.

### 8.3 Template and use nodes

Template and use nodes should remain semantic, not execute during parsing.

### 8.4 Reference token model

References should be represented explicitly so the resolver can attach resolution outcomes.

### 8.5 Render profile model

```ts
interface RenderSelection {
  profileId?: string
  overrides?: Record<string, unknown>
}
```

This object belongs at document level, not inside semantic block nodes.

---

## 9. Parsing Stages in Detail

### Stage 1: Source ingestion

- read UTF-8 source
- preserve original source for diagnostics and snapshot tests

### Stage 2: Frontmatter parse

- parse YAML frontmatter
- extract `render_profile` and optional `render_overrides`
- validate primitive frontmatter types

### Stage 3: Markdown + chemd parse

- parse ordinary markdown nodes
- detect `:chem[...]`
- detect `chemd` directive blocks
- normalize header ids and block names

### Stage 4: Block normalization

- normalize field maps
- split simple list fields on `|`
- classify block nodes into standard semantic types

### Stage 5: Index construction

- build object id index
- build template name index
- collect diagnostics for duplicate ids or duplicate template names

### Stage 6: Reference tokenization

- tokenize `@meta.key`
- tokenize `@id`
- tokenize `@id.field`
- tokenize alias references such as `@reaction.temperature`

### Stage 7: Template resolution

- classify `use` fields into alias overrides or params
- resolve template binds
- expand templates into AST fragments
- detect cycles

### Stage 8: Semantic resolution

- resolve references against object index and frontmatter
- attach resolution outcomes to reference nodes or substitute render text where needed

### Stage 9: Validation

- missing required fields
- unresolved references
- invalid list items
- invalid profile selection warnings

### Stage 10: Render profile resolution

- load base default profile
- merge selected profile
- merge any document-level overrides
- validate final resolved render options

### Stage 11: Render adapter mapping

- map generic render options to renderer-specific options
- create RDKit.js adapter options and future adapter payloads

### Stage 12: Rendering / export

- HTML preview
- SVG structure/reaction assets
- JSON export
- DOCX bridge payload

---

## 10. Object Index and Lookup Rules

### 10.1 Required lookup functions

The resolver should provide:

- `getObjectById(id)`
- `getTemplateByName(name)`
- `resolveMeta(key)`
- `resolveAlias(alias, context)`
- `resolveReferenceToken(token, context)`

### 10.2 Alias resolution contract

For aliases such as `reaction` and `result`, the recommended order is:

1. explicit `use` override
2. template `bind`
3. frontmatter `primary_*`
4. optional first-object fallback if enabled

---

## 11. Template Engine Design

### 11.1 Constraint

The template engine is intentionally weak. It is not a scripting engine.

### 11.2 Allowed features

- static markdown body
- `@...` lightweight references
- alias binding
- free params
- template expansion

### 11.3 Expansion strategy

Expand templates into semantic/markdown AST fragments before renderers run.

### 11.4 Why AST expansion matters

AST expansion preserves compatibility with:

- HTML rendering
- JSON export
- DOCX transformation
- diagnostics tracking

---

## 12. Render Profile System

### 12.1 Purpose

The render profile system controls visual output while keeping semantic content stable.

### 12.2 Inputs

- built-in default profile
- named project profile
- document-level `render_profile`
- optional document-level `render_overrides`

### 12.3 Output

A resolved generic `RenderOptions` object.

### 12.4 Generic render options shape

```ts
interface RenderOptions {
  profileId: string
  structure: {
    bondLength?: number
    bondLineWidth?: number
    multipleBondOffset?: number
    hashSpacing?: number
    fontSize?: number
    atomLabelPadding?: number
    monochrome?: boolean
    backgroundColor?: string
  }
  reaction: {
    arrowLength?: number
    componentGap?: number
    plusGap?: number
    showConditionsBelowArrow?: boolean
  }
  export: {
    margin?: number
    imageFormat?: 'svg' | 'png'
    dpi?: number
  }
}
```

### 12.5 Hard rule

Render options MUST be mutable without changing semantic AST meaning.

---

## 13. Rendering Architecture

### 13.1 HTML renderer

Consumes:

- resolved semantic AST
- resolved render options
- diagnostics

Produces:

- HTML preview
- inline SVG assets or references

### 13.2 JSON renderer

Produces:

- semantic AST JSON
- diagnostics JSON
- render selection metadata
- resolved render options JSON

### 13.3 SVG renderer

Consumes:

- molecule/reaction semantic nodes
- resolved render options
- renderer adapter payload

Produces:

- structure SVG
- reaction SVG

### 13.4 DOCX export strategy

Recommended v0.1 flow:

- render semantic content into export-oriented HTML/Markdown
- embed SVG or raster fallbacks
- pass to Pandoc bridge if DOCX is required

---

## 14. Chemistry Rendering Module

### 14.1 Inline chemistry

Use KaTeX + `mhchem` for `:chem[...]`.

### 14.2 Molecule rendering

Use RDKit.js as primary renderer behind an adapter.

The adapter should accept generic options such as:

- bond length
- bond line width
- multiple bond offset
- font size
- monochrome mode
- background color

### 14.3 Reaction rendering in v0.1

Keep reaction rendering simple:

- render reactant/product structures inline or as grouped SVG elements
- add reaction arrow and plus signs using layout helpers
- optionally place conditions under or beside the arrow

### 14.4 Adapter boundary

Define a stable interface such as:

```ts
interface StructureRendererAdapter {
  renderMolecule(input: MoleculeRenderInput, options: RenderOptions): Promise<string>
  renderReaction(input: ReactionRenderInput, options: RenderOptions): Promise<string>
}
```

This makes later Ketcher-assisted export or alternate engines possible.

---

## 15. Diagnostics System

### 15.1 Diagnostic shape

```ts
interface Diagnostic {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  position?: SourceRange
  nodeId?: string
}
```

### 15.2 Required diagnostic codes

Recommended codes:

- `E_DUPLICATE_ID`
- `E_MISSING_REQUIRED_FIELD`
- `E_INVALID_LIST_ITEM`
- `E_TEMPLATE_CYCLE`
- `E_UNKNOWN_TEMPLATE`
- `W_UNKNOWN_FIELD`
- `W_UNKNOWN_BLOCK`
- `W_UNRESOLVED_REFERENCE`
- `W_UNKNOWN_RENDER_PROFILE`
- `W_INVALID_RENDER_OVERRIDE`

### 15.3 Behavior

Errors should be as local as possible. A broken block or profile selection must not crash unrelated document sections.

---

## 16. Data Contracts Between Packages

### 16.1 Parser -> Resolver

Parser output should include:

- semantic AST
- unresolved reference tokens
- frontmatter metadata
- render selection metadata
- parser diagnostics

### 16.2 Resolver -> Renderers

Resolver output should include:

- resolved semantic AST
- object index summary
- diagnostics
- resolved render options
- adapter-ready render payloads where useful

### 16.3 Core typing discipline

Keep semantic types, render types, and diagnostics types in `packages/core`. Do not duplicate these interfaces in renderer packages.

---

## 17. Minimal Public API

### `packages/parser`

```ts
parseChemd(source: string): ParsedChemdDocument
```

### `packages/resolver`

```ts
resolveChemd(doc: ParsedChemdDocument, ctx?: ResolveContext): ResolvedChemdDocument
```

### `packages/render-profile`

```ts
resolveRenderProfile(selection: RenderSelection, registry: RenderProfileRegistry): RenderOptions
```

### `packages/renderer-html`

```ts
renderHtml(doc: ResolvedChemdDocument, options: RenderOptions): string
```

### `packages/renderer-json`

```ts
renderJson(doc: ResolvedChemdDocument, options: RenderOptions): string
```

### `packages/renderer-svg`

```ts
renderMoleculeSvg(input: MoleculeRenderInput, options: RenderOptions): Promise<string>
renderReactionSvg(input: ReactionRenderInput, options: RenderOptions): Promise<string>
```

### Convenience API

```ts
compileChemd(source: string, ctx?: CompileContext): CompileResult
```

Where `CompileResult` contains semantic AST, render options, diagnostics, HTML, and JSON.

---

## 18. Testing Strategy

### 18.1 Unit tests

Cover:

- block parsing
- id parsing
- list splitting
- reference tokenization
- template bind resolution
- render profile merge logic

### 18.2 Snapshot tests

Snapshot:

- normalized AST
- resolved AST
- resolved render options
- HTML output
- SVG output for stable fixtures

### 18.3 Golden file tests

Use fixture-driven tests for end-to-end compilation.

### 18.4 Recommended first fixture set

- minimal experiment
- reaction + result + template use
- duplicate ids
- unresolved references
- selected render profile
- render profile override
- invalid profile name fallback

---

## 19. Performance Expectations

For v0.1, performance goals are modest:

- parsing should feel instant for single-entry notebook files
- profile resolution should be trivial compared to rendering
- repeated molecule renders may later benefit from caching by `(structure input + render profile id + export format)`

---

## 20. Security Considerations

### 20.1 Markdown safety

Raw HTML handling should be explicit and sanitized in preview contexts.

### 20.2 Template safety

No arbitrary code execution. No filesystem access from template bodies.

### 20.3 Export safety

Ensure SVG generation avoids unsanitized foreign content injection if any external text or metadata enters the SVG tree.

---

## 21. Implementation Sequence

### Phase 1: Core parser

- frontmatter
- block parsing
- inline `:chem[...]`
- semantic AST

### Phase 2: Resolver

- object index
- references
- templates
- diagnostics

### Phase 3: Render profile package

- profile schema
- default profile registry
- profile selection resolution
- generic render options

### Phase 4: JSON and HTML

- resolved JSON
- preview HTML
- basic profile-aware HTML rendering

### Phase 5: Molecule and reaction SVG rendering

- RDKit.js adapter
- profile-aware structure rendering
- profile-aware reaction rendering

### Phase 6: Playground

- source editor
- preview pane
- diagnostics pane
- profile switcher
- JSON pane

### Phase 7: DOCX bridge

- export-oriented HTML/Markdown
- Pandoc bridge integration

---

## 22. Acceptance Criteria for v0.1

A v0.1 system is acceptable if it can:

1. parse the language spec canonical example
2. resolve `@meta`, `@id`, `@id.field`, and alias-based template references
3. expand templates into final AST
4. select a render profile and produce resolved render options
5. render molecule/reaction output without embedding style fields into semantic nodes
6. emit JSON, diagnostics, and HTML

---

## 23. Example End-to-End Flow

```text
source experiment.md
  -> parse frontmatter (includes render_profile)
  -> parse semantic blocks and references
  -> build semantic AST
  -> resolve template and references
  -> resolve render profile to RenderOptions
  -> render molecule SVG with RDKit adapter options
  -> render HTML preview
  -> export JSON and optional DOCX bridge payload
```

---

## 24. Future Compatibility Notes

This architecture intentionally leaves room for:

- project-level template registries
- richer render profiles
- Ketcher-assisted editing/export
- more advanced reaction layout engines
- multiple export presets for ELN, publication, slides, and Word

---

## 25. Final Recommendation

The agent should implement `chemd` v0.1 as three clean layers:

1. **semantic language layer**
2. **resolution/template layer**
3. **render profile + renderer adapter layer**

Do not collapse these layers into one package or one AST. That separation is what will keep the system maintainable once rendering quality and export requirements grow.
