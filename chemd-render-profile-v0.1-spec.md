# chemd Render Profile v0.1 Specification

Status: Draft for implementation  
Audience: renderer / export / editor / profile registry agent  
Scope: v0.1 MVP

---

## 1. Purpose

A `chemd` render profile defines the visual rendering style for chemical structures and reactions without changing semantic document meaning.

The render profile system exists to control:

- on-screen ELN preview style
- export style for SVG/PNG/DOCX/PDF
- publication-oriented style presets
- future editor integration settings

The render profile system is separate from the `chemd` language syntax.

---

## 2. Design Principles

1. Render profiles MUST NOT encode chemistry meaning.
2. The same semantic document MUST be renderable under multiple profiles.
3. Profiles SHOULD be portable across projects.
4. Generic profile fields SHOULD be renderer-agnostic.
5. Renderer-specific mappings belong in adapter code, not in source documents.

---

## 3. Scope

v0.1 profiles cover:

- structure line geometry
- typography basics
- monochrome/color mode
- reaction layout spacing
- export image defaults

v0.1 profiles do not cover:

- user-defined per-bond styling
- arbitrary vector graphics overrides
- manual atom coordinate editing
- complete publication rule packs for every journal

---

## 4. Selection Model

A document may select a profile through frontmatter:

```yaml
---
render_profile: eln-default
---
```

Optionally, an implementation may support document-level overrides:

```yaml
---
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: 1.4
  export.margin: 12
---
```

`render_overrides` is optional in v0.1. If implemented, it MUST only affect rendering.

---

## 5. Canonical Profile Shape

The canonical profile object SHOULD have this shape:

```json
{
  "id": "eln-default",
  "extends": "base",
  "description": "Default notebook preview style",
  "structure": {
    "bondLength": 28,
    "bondLineWidth": 1.8,
    "multipleBondOffset": 0.15,
    "hashSpacing": 2.0,
    "fontSize": 11,
    "atomLabelPadding": 0.0,
    "monochrome": false,
    "backgroundColor": "#ffffff"
  },
  "reaction": {
    "arrowLength": 48,
    "componentGap": 16,
    "plusGap": 12,
    "showConditionsBelowArrow": true
  },
  "export": {
    "imageFormat": "svg",
    "margin": 8,
    "dpi": 300,
    "transparentBackground": false
  }
}
```

---

## 6. Profile Schema

### 6.1 Top-level fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `id` | string | yes | Profile id |
| `extends` | string | no | Parent profile id |
| `description` | string | no | Human description |
| `structure` | object | no | Structure styling |
| `reaction` | object | no | Reaction layout styling |
| `export` | object | no | Export defaults |

### 6.2 `structure` fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `bondLength` | number | no | Target bond length in renderer units/pixels depending on adapter |
| `bondLineWidth` | number | no | Bond line width |
| `multipleBondOffset` | number | no | Relative or adapter-mapped multiple-bond spacing |
| `hashSpacing` | number | no | Hashed/dashed bond spacing |
| `fontSize` | number | no | Base atom label font size |
| `atomLabelPadding` | number | no | Extra label padding |
| `monochrome` | boolean | no | Monochrome mode |
| `backgroundColor` | string | no | Background color |

### 6.3 `reaction` fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `arrowLength` | number | no | Preferred reaction arrow length |
| `componentGap` | number | no | Gap between components |
| `plusGap` | number | no | Gap around plus signs |
| `showConditionsBelowArrow` | boolean | no | Whether conditions should be placed below arrow when renderer supports it |

### 6.4 `export` fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `imageFormat` | string | no | `svg` or `png` |
| `margin` | number | no | Export margin |
| `dpi` | number | no | Raster export DPI |
| `transparentBackground` | boolean | no | Transparent export background |

---

## 7. Inheritance and Merge Rules

### 7.1 `extends`

A profile MAY inherit from another profile via `extends`.

### 7.2 Merge behavior

The resolved profile is produced by merging in this order:

1. built-in base defaults
2. parent profile chain via `extends`
3. selected profile fields
4. optional document-level overrides

Later values override earlier values.

### 7.3 Cycle handling

Profile inheritance cycles MUST produce an error.

---

## 8. Validation Rules

### 8.1 Required validation

Implementations SHOULD validate:

- `id` format
- recognized top-level sections
- numeric values are finite and positive where expected
- colors are valid CSS-compatible color strings if color parsing is supported
- `imageFormat` is one of the allowed values

### 8.2 Unknown fields

Unknown fields SHOULD produce warnings and be ignored.

### 8.3 Missing profile

Unknown selected profile ids SHOULD produce a warning and fall back to implementation default.

---

## 9. Semantic Separation Rule

Render profiles are not part of the semantic `chemd` block language.

Therefore:

- profile values MUST NOT be copied into semantic object fields
- JSON exports SHOULD keep profile data in a separate render section
- changing profile values MUST NOT change semantic interpretation of `molecule`, `reaction`, `result`, `analysis`, or `sample`

---

## 10. Adapter Mapping

Generic profile fields are intentionally renderer-agnostic.

Each renderer adapter maps generic profile values to backend-specific values.

### 10.1 Example mapping targets

A RDKit.js adapter may map:

- `structure.bondLineWidth` -> RDKit `bondLineWidth`
- `structure.bondLength` -> RDKit `fixedBondLength`
- `structure.multipleBondOffset` -> RDKit `multipleBondOffset`
- `structure.fontSize` -> RDKit `fixedFontSize` or related font settings

A Ketcher-backed export flow may map:

- `structure.bondLineWidth` -> Ketcher settings or export image options
- `export.margin` -> image export margin
- `export.imageFormat` -> image export format

### 10.2 Adapter rule

If a backend cannot represent a profile field exactly, the adapter SHOULD apply the closest safe approximation and MAY emit an informational diagnostic.

---

## 11. Recommended Built-in Profiles

v0.1 SHOULD ship with at least three profiles.

### 11.1 `eln-default`

Purpose: balanced notebook preview.

Example:

```json
{
  "id": "eln-default",
  "description": "Balanced notebook preview style",
  "structure": {
    "bondLength": 28,
    "bondLineWidth": 1.8,
    "multipleBondOffset": 0.15,
    "hashSpacing": 2.0,
    "fontSize": 11,
    "monochrome": false,
    "backgroundColor": "#ffffff"
  },
  "reaction": {
    "arrowLength": 48,
    "componentGap": 16,
    "plusGap": 12,
    "showConditionsBelowArrow": true
  },
  "export": {
    "imageFormat": "svg",
    "margin": 8,
    "dpi": 300,
    "transparentBackground": false
  }
}
```

### 11.2 `publication-acs`

Purpose: publication-oriented monochrome profile.

Example:

```json
{
  "id": "publication-acs",
  "extends": "eln-default",
  "description": "Monochrome publication-oriented style",
  "structure": {
    "bondLength": 32,
    "bondLineWidth": 1.4,
    "multipleBondOffset": 0.18,
    "hashSpacing": 2.2,
    "fontSize": 10,
    "monochrome": true,
    "backgroundColor": "#ffffff"
  },
  "export": {
    "imageFormat": "svg",
    "margin": 12,
    "dpi": 600,
    "transparentBackground": false
  }
}
```

### 11.3 `slides-large`

Purpose: presentation slides with larger labels and spacing.

Example:

```json
{
  "id": "slides-large",
  "extends": "eln-default",
  "description": "Large-display presentation style",
  "structure": {
    "bondLength": 34,
    "bondLineWidth": 2.4,
    "multipleBondOffset": 0.18,
    "hashSpacing": 2.4,
    "fontSize": 14,
    "monochrome": false,
    "backgroundColor": "#ffffff"
  },
  "reaction": {
    "arrowLength": 64,
    "componentGap": 20,
    "plusGap": 16,
    "showConditionsBelowArrow": true
  },
  "export": {
    "imageFormat": "svg",
    "margin": 10,
    "dpi": 300,
    "transparentBackground": false
  }
}
```

---

## 12. JSON Export Recommendation

Resolved output SHOULD expose profile data separately, for example:

```json
{
  "document": { "id": "exp-2026-03-30-001" },
  "render": {
    "profileId": "publication-acs",
    "resolvedOptions": {
      "structure": {
        "bondLength": 32,
        "bondLineWidth": 1.4,
        "multipleBondOffset": 0.18,
        "hashSpacing": 2.2,
        "fontSize": 10,
        "monochrome": true,
        "backgroundColor": "#ffffff"
      },
      "reaction": {
        "arrowLength": 48,
        "componentGap": 16,
        "plusGap": 12,
        "showConditionsBelowArrow": true
      },
      "export": {
        "imageFormat": "svg",
        "margin": 12,
        "dpi": 600,
        "transparentBackground": false
      }
    }
  }
}
```

---

## 13. Minimal Conformance Checklist

A conforming render profile implementation for v0.1 MUST:

1. load a profile by id
2. fall back to a default profile if none is selected
3. validate the selected profile shape
4. support inheritance via `extends`
5. produce a resolved generic render options object
6. keep render data separate from semantic AST data

---

## 14. Final Recommendation

Treat render profiles as first-class configuration artifacts.

Do not let style parameters leak into experiment syntax. `chemd` documents should describe chemistry and experimental knowledge; render profiles should describe how that knowledge looks when rendered.
