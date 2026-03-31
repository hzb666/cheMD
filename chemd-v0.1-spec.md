# chemd v0.1 Language Specification

Status: Draft for implementation  
Audience: parser / resolver / renderer / editor / export agent  
Scope: v0.1 MVP

---

## 1. Purpose

`chemd` is a Markdown-based domain language for chemistry-focused electronic lab notebooks (ELN).

The design goals of v0.1 are:

1. Keep daily authoring close to normal Markdown.
2. Represent chemical and experimental data as structured blocks instead of loose prose.
3. Support lightweight references and field reads inside documents.
4. Support reusable Markdown templates with parameter injection and automatic field binding.
5. Make `.md` the source of truth and allow downstream rendering to HTML, JSON, SVG, and DOCX.
6. Keep chemical rendering style configurable without polluting the core experiment syntax.

`chemd` v0.1 is **not** a full ChemDraw replacement and is **not** a general-purpose programming language.

---

## 2. File Model

A `chemd` document consists of four layers:

1. YAML frontmatter
2. Normal Markdown body
3. `chemd` inline and block syntax
4. Optional render profile selection metadata

Recommended filename extensions:

- `.md`
- `.chemd.md`

File encoding MUST be UTF-8.

---

## 3. Core Design Principles

1. Daily users should mainly write Markdown and a few structured blocks.
2. Template complexity should be isolated from ordinary experiment writing.
3. Repeated information should be declared once and referenced elsewhere.
4. Fields should use stable names and standard units.
5. Unknown syntax should degrade gracefully where possible.
6. Semantic content and rendering style MUST remain separate.

---

## 4. Frontmatter

Each experiment document SHOULD start with YAML frontmatter.

Example:

```yaml
---
entry_type: experiment
id: exp-2026-03-30-001
title: Ethanol oxidation to acetic acid
author: zhibin hu
date: 2026-03-30
project: oxidation-study
status: completed
primary_reaction: rxn-main
primary_result: res-main
render_profile: eln-default
tags:
  - oxidation
  - copper
---
```

### 4.1 Recommended keys

| Key | Type | Required | Meaning |
|---|---|---:|---|
| `entry_type` | string | yes | Usually `experiment` |
| `id` | string | yes | Unique document id |
| `title` | string | yes | Experiment title |
| `author` | string | no | Record author |
| `date` | string | yes | `YYYY-MM-DD` |
| `project` | string | no | Project or topic |
| `status` | string | no | `planned`, `running`, `completed`, `failed`, `abandoned` |
| `tags` | string[] | no | Labels |
| `primary_reaction` | string | no | Default reaction object id |
| `primary_result` | string | no | Default result object id |
| `primary_product` | string | no | Default product/molecule object id |
| `primary_sample` | string | no | Default sample object id |
| `render_profile` | string | no | Default render profile id |

### 4.2 Rules

- `id` SHOULD be unique across the project space.
- `date` SHOULD use ISO date format `YYYY-MM-DD`.
- `primary_*` values MUST refer to valid block ids if present.
- `render_profile` refers to a render profile identifier defined outside the language document, typically in a profile registry or project config.

---

## 5. Semantic vs Rendering Style

### 5.1 Required separation

`chemd` v0.1 separates:

- **semantic content**: molecules, reactions, results, analysis, samples, references, templates
- **rendering style**: bond length, bond line width, multiple bond spacing, hash spacing, font sizing, monochrome/color mode, export margins, image resolution

### 5.2 Consequence

Rendering-style parameters MUST NOT be modeled as core language fields on `molecule`, `reaction`, `result`, `analysis`, or `sample` blocks.

Invalid example:

```md
:::molecule #mol-1
smiles: CC(=O)O
bond_length: 32
bond_line_width: 1.4
:::
```

Valid approach:

```yaml
---
render_profile: publication-acs
---
```

### 5.3 Allowed profile hooks in language docs

Language documents MAY select or override style through these frontmatter keys:

- `render_profile`
- `render_overrides` (optional, implementation-defined in v0.1)

If `render_overrides` is implemented, it MUST only affect rendering and MUST NOT alter core semantic AST.

---

## 6. Inline Syntax

### 6.1 `:chem[...]`

`chemd` provides one required inline syntax in v0.1:

```md
:chem[H2O]
:chem[SO4^2-]
:chem[2H2 + O2 -> 2H2O]
```

### 6.2 Intended use

Use `:chem[...]` for:

- molecular formulas
- ionic formulas
- simple reaction equations
- short in-text chemistry expressions

### 6.3 Restrictions

- `:chem[...]` is display-oriented.
- It SHOULD NOT carry complex metadata.
- Nested `:chem[...]` is invalid.

---

## 7. Block Syntax

### 7.1 General form

All `chemd` blocks use fenced directive-style syntax:

```md
:::block_name #optional-id
key: value
key: value
:::
```

### 7.2 Block header

Header grammar:

```text
:::<block_name> [#<id>] [extra-header-text disallowed in v0.1 except template/use shorthand]
```

### 7.3 ID rules

- If present, ids are introduced with `#` in the block header.
- Ids MUST match this regex:

```text
[a-zA-Z][a-zA-Z0-9_-]*
```

Examples:

- `#rxn-main`
- `#res-screen-03`
- `#sample_ethanol`

### 7.4 Key-value lines

Block bodies use simple `key: value` lines.

Rules:

- one field per line
- field names are case-sensitive
- field names SHOULD use lowercase snake_case or lowercase identifiers
- duplicate keys are invalid unless the block definition explicitly allows them

### 7.5 Simple list values

In v0.1, flat lists are represented with ` | ` separators.

Example:

```md
reactants: CCO | O=O
products: CC(=O)O
```

Parser rule:

- split on top-level `|`
- trim surrounding whitespace for each item
- empty list items are invalid

### 7.6 Unsupported nested YAML

Full nested YAML inside block bodies is out of scope for v0.1.

---

## 8. Standard Block Types

v0.1 requires support for the following block types:

- `molecule`
- `reaction`
- `result`
- `analysis`
- `sample`
- `template`
- `use`

---

## 9. `molecule` Block

Represents a single molecular object.

### 9.1 Minimal example

```md
:::molecule #mol-ethanol
smiles: CCO
:::
```

### 9.2 Extended example

```md
:::molecule #mol-ethanol
name: ethanol
smiles: CCO
role: reactant
caption: Ethanol
formula: C2H6O
:::
```

### 9.3 Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `smiles` | string | yes | Structure source in v0.1 |
| `name` | string | no | Human name |
| `role` | string | no | Role in experiment |
| `caption` | string | no | Display caption |
| `formula` | string | no | Molecular formula |
| `amount` | string | no | Human-readable amount |
| `equivalents` | string | no | Human-readable equivalents |

### 9.4 Validation

- `smiles` is required.
- Unknown extra fields produce a warning unless the implementation explicitly whitelists extensions.

---

## 10. `reaction` Block

Represents a reaction object.

### 10.1 Minimal example

```md
:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
:::
```

### 10.2 Recommended example

```md
:::reaction #rxn-main
name: ethanol oxidation
reactants: CCO | O=O
products: CC(=O)O
catalyst: Cu
solvent: none
temperature: 200 °C
time: 4 h
atmosphere: O2
caption: Oxidation of ethanol to acetic acid
:::
```

### 10.3 Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `reactants` | list[string] | yes | Reactant list |
| `products` | list[string] | yes | Product list |
| `name` | string | no | Reaction name |
| `reagents` | string | no | Free-text reagent info |
| `catalyst` | string | no | Catalyst |
| `solvent` | string | no | Solvent |
| `temperature` | string | no | Temperature |
| `time` | string | no | Reaction time |
| `pressure` | string | no | Pressure |
| `atmosphere` | string | no | Atmosphere |
| `yield` | string | no | Summary yield |
| `conversion` | string | no | Summary conversion |
| `selectivity` | string | no | Summary selectivity |
| `caption` | string | no | Display caption |

### 10.4 Validation

- `reactants` and `products` are required.
- Empty list items are invalid.
- v0.1 does not support nested reactant objects inside the block body.

---

## 11. `result` Block

Represents standardized experiment result metadata.

### 11.1 Example

```md
:::result #res-main
status: completed
yield: 63%
conversion: 78%
selectivity: 85%
isolated_mass: 1.24 g
product_state: colorless liquid
:::
```

### 11.2 Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `status` | string | no | Result state |
| `yield` | string | no | Yield |
| `conversion` | string | no | Conversion |
| `selectivity` | string | no | Selectivity |
| `isolated_mass` | string | no | Isolated mass |
| `product_state` | string | no | Product appearance/state |
| `purity` | string | no | Purity |
| `notes` | string | no | Notes |

---

## 12. `analysis` Block

Represents analytical characterization.

### 12.1 Example

```md
:::analysis #ana-nmr-1
type: 1H NMR
solvent: CDCl3
instrument: 400 MHz
data: 2.10 (s, 3H)
:::
```

### 12.2 Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `type` | string | yes | Analysis type |
| `instrument` | string | no | Instrument or settings |
| `solvent` | string | no | Solvent |
| `frequency` | string | no | Frequency |
| `method` | string | no | Method |
| `data` | string | yes | Human-readable analytical data |
| `notes` | string | no | Notes |

---

## 13. `sample` Block

Represents a sample, batch, or source material.

### 13.1 Example

```md
:::sample #sample-ethanol
name: ethanol
sample_id: S-ETH-001
batch: B20260330
purity: 99.5%
supplier: Aladdin
:::
```

### 13.2 Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `name` | string | yes | Sample name |
| `sample_id` | string | no | Local sample id |
| `batch` | string | no | Batch id |
| `purity` | string | no | Purity |
| `supplier` | string | no | Supplier |
| `notes` | string | no | Notes |

---

## 14. Lightweight Reference Syntax

### 14.1 Object reference

`@id` references an object by id.

Example:

```md
See @rxn-main.
```

### 14.2 Object field reference

`@id.field` reads a field from an object.

Example:

```md
The isolated yield was @res-main.yield.
```

### 14.3 Meta reference

`@meta.key` reads a frontmatter key.

Example:

```md
Project: @meta.project
```

### 14.4 Reserved implicit aliases

The following aliases MAY be resolved by the resolver:

- `@reaction.*`
- `@result.*`
- `@product.*`
- `@sample.*`
- `@param.*`

These aliases depend on template binding and resolution rules.

### 14.5 Restrictions

- `@` references are lightweight value lookups, not general expressions.
- Chained nested object traversal beyond one dot after object id is out of scope for v0.1.

---

## 15. Template System Overview

The template system exists to reduce repeated writing in experiment documents.

Principles:

1. ordinary experiment authors SHOULD mainly call templates, not write template logic
2. template authors MAY use lightweight references in template bodies
3. template expansion happens before final rendering

---

## 16. `template` Block

### 16.1 Header syntax

```text
:::template <template_name>
```

A template block does not use `#id` in the v0.1 header. The template name in the header is the template identifier.

### 16.2 Example

```md
:::template quick-summary
bind: reaction=primary_reaction | result=primary_result

## Quick Summary

Experiment: @meta.title
Project: @meta.project
Temperature: @reaction.temperature
Time: @reaction.time
Yield: @result.yield
Conversion: @result.conversion
:::
```

### 16.3 Rules

- Template body is normal Markdown plus `chemd` lightweight references.
- Template body MAY include ordinary paragraphs, headings, lists, and references.
- Template body MUST NOT contain arbitrary scripting.

### 16.4 Optional fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `bind` | string | no | Alias binding expression |
| `params` | list[string] | no | Declared free parameters |
| `description` | string | no | Human description |

### 16.5 `bind` syntax

`bind` uses `alias=source` pairs separated by ` | `.

Example:

```md
bind: reaction=primary_reaction | result=primary_result
```

Allowed source forms in v0.1:

- `primary_reaction`
- `primary_result`
- `primary_product`
- `primary_sample`
- explicit object ids

---

## 17. `use` Block

### 17.1 Header syntax

```text
:::use <template_name>
```

### 17.2 Example with overrides

```md
:::use quick-summary
reaction: rxn-screen-03
result: res-screen-03
:::
```

### 17.3 Example with free parameters

```md
:::use wash-organic-layer
solvent: brine
times: 2
volume: 15 mL
:::
```

### 17.4 Rules

- `use` identifies which template to expand.
- All body fields are passed as either alias overrides or free parameters.
- Expansion result is normal AST content, not a runtime macro object.

### 17.5 Parameter classification rule

During resolution, `use` fields are classified as:

1. alias override if the key matches a template alias
2. free parameter otherwise

---

## 18. Template Value Syntax

### 18.1 Supported forms

Inside template bodies, v0.1 supports these lightweight forms:

- `@meta.key`
- `@param.key`
- `@alias.field`
- `@id.field`
- `@id`

### 18.2 Examples

```md
Experiment: @meta.title
Yield: @result.yield
Reaction object: @rxn-main
Product name: @param.product_name
```

### 18.3 Plain Markdown text

Text in template bodies that is not part of a recognized `@...` reference MUST remain literal Markdown text.

---

## 19. Resolution Rules

### 19.1 Object index

The resolver MUST build an object index from all blocks with ids.

### 19.2 Alias resolution order

When a template body uses `@reaction.field`, the resolver SHOULD attempt the following, in order:

1. explicit alias override from the current `use` block
2. template `bind` source
3. frontmatter `primary_reaction`
4. first object of the matching type in the document, if implementation enables fallback

### 19.3 Bound source mapping

`primary_reaction` and similar names map to frontmatter keys.

### 19.4 Explicit object field lookup

`@id.field` MUST resolve directly against the object index.

### 19.5 Meta lookup

`@meta.key` resolves from frontmatter.

### 19.6 Param lookup

`@param.key` resolves from free parameters passed in the `use` block.

---

## 20. Recommended Section Headings

The language does not require fixed section titles, but these headings are recommended:

- `## Objective`
- `## Reaction`
- `## Materials`
- `## Procedure`
- `## Observation`
- `## Workup`
- `## Result`
- `## Characterization`
- `## Discussion`
- `## Next Plan`

---

## 21. Unit Recommendations

Recommended units:

- temperature: `°C`
- time: `h`, `min`
- mass: `mg`, `g`
- volume: `mL`
- amount: `mmol`
- concentration: `M`
- yield/conversion/selectivity: `%`

These are recommendations, not parser-enforced scientific validation rules.

---

## 22. Validation and Error Handling

### 22.1 Unknown block type

Unknown block types SHOULD produce a warning and preserve raw content when possible.

### 22.2 Unknown field

Unknown fields SHOULD produce a warning.

### 22.3 Missing required field

Missing required fields MUST produce an error on that block.

### 22.4 Duplicate ids

Duplicate ids MUST produce an error.

### 22.5 Unknown references

Unresolved `@...` references MUST produce a warning or error depending on context.

### 22.6 Circular template expansion

Circular template use chains MUST produce an error and abort expansion of the cycle.

### 22.7 Invalid render profile selection

Unknown `render_profile` values SHOULD produce a warning and fall back to the implementation default profile.

---

## 23. Abstract Syntax Tree (AST)

### 23.1 Document node

```json
{
  "type": "document",
  "meta": {
    "entry_type": "experiment",
    "id": "exp-2026-03-30-001",
    "title": "Ethanol oxidation to acetic acid",
    "date": "2026-03-30",
    "project": "oxidation-study",
    "primary_reaction": "rxn-main",
    "primary_result": "res-main",
    "render_profile": "eln-default"
  },
  "children": []
}
```

### 23.2 Molecule node

```json
{
  "type": "molecule",
  "id": "mol-ethanol",
  "name": "ethanol",
  "smiles": "CCO",
  "role": "reactant",
  "caption": "Ethanol"
}
```

### 23.3 Reaction node

```json
{
  "type": "reaction",
  "id": "rxn-main",
  "name": "ethanol oxidation",
  "reactants": ["CCO", "O=O"],
  "products": ["CC(=O)O"],
  "catalyst": "Cu",
  "temperature": "200 °C",
  "time": "4 h"
}
```

### 23.4 Result node

```json
{
  "type": "result",
  "id": "res-main",
  "yield": "63%",
  "conversion": "78%",
  "selectivity": "85%"
}
```

### 23.5 Template node

```json
{
  "type": "template",
  "name": "quick-summary",
  "bind": {
    "reaction": "primary_reaction",
    "result": "primary_result"
  },
  "body": []
}
```

### 23.6 Use node

```json
{
  "type": "use",
  "template": "quick-summary",
  "overrides": {},
  "params": {}
}
```

### 23.7 Reference token

```json
{
  "type": "reference",
  "kind": "object_field",
  "source": "res-main",
  "field": "yield",
  "raw": "@res-main.yield"
}
```

### 23.8 Render settings placement

Render-style selections MUST NOT be stored on semantic block nodes. They belong in document-level render selection metadata and downstream render options objects.

---

## 24. JSON Export Requirements

A conforming implementation SHOULD support JSON export containing:

- frontmatter metadata
- normalized semantic blocks
- references after resolution status is known
- template expansion results or expansion plan
- diagnostics
- selected render profile id

Render profile values MAY be included as resolved render metadata, but MUST remain separate from semantic object fields.

---

## 25. Non-Goals for v0.1

The following are out of scope for v0.1:

- full graphical editing parity with ChemDraw
- storing fine-grained drawing style directly in semantic blocks
- nested object syntax inside block bodies
- arbitrary expressions in templates
- multi-step mechanism drawing language
- exact round-trip Word editing

---

## 26. Minimal Conformance Checklist

A minimal v0.1 implementation MUST:

1. parse frontmatter
2. parse `:chem[...]`
3. parse standard block types
4. support ids in block headers
5. resolve `@id.field` and `@meta.key`
6. support `template` and `use`
7. build a semantic AST
8. keep render profile selection separate from semantic block fields
9. expose diagnostics
10. render or export a normalized document model

---

## 27. Canonical Example

```md
---
entry_type: experiment
id: exp-2026-03-30-001
title: Ethanol oxidation to acetic acid
date: 2026-03-30
project: oxidation-study
status: completed
primary_reaction: rxn-main
primary_result: res-main
render_profile: eln-default
---

# Ethanol oxidation to acetic acid

## Reaction

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
temperature: 200 °C
time: 4 h
:::

## Result

:::result #res-main
yield: 63%
conversion: 78%
selectivity: 85%
:::

The experiment gave @res-main.yield isolated yield.

:::template quick-summary
bind: reaction=primary_reaction | result=primary_result

## Quick Summary

Experiment: @meta.title
Temperature: @reaction.temperature
Time: @reaction.time
Yield: @result.yield
Conversion: @result.conversion
:::

:::use quick-summary
:::
```
