# Type Safety - @chemd/web

## Overview

Keep runtime input untrusted until it is narrowed. Shared contracts belong in DTO files or `@chemd/*` packages, not anonymous route-local object shapes.

## Request Boundaries

- Parse JSON with `parseJsonObjectBody` and related helpers from `src/server/chem/request-parsers.ts`.
- Read string arrays with `readStringArray` or `readOptionalStringArray`.
- Read files through `readFormDataFile` and validate them with `validateImageUpload`.
- Return `Response` early for invalid route input.

## DTOs

- Route payload and chemistry service contracts live in `apps/web/src/server/chem/dto.ts`.
- Use discriminated unions for molecule/reaction request and structure record shapes.
- Keep server-specific DTOs out of client component props unless the client actually consumes the same shape.

## Package Contracts

- Use public `@chemd/*` exports, not deep package internals.
- `compileChemd` returns the canonical compile result: document, diagnostics, render options, adapter payload, HTML, JSON, DOCX bridge, `typedSemanticGraph`, `stepGraph`, `runPlan`, `runtimePreflight`, `lnf`, and `trainingExport`.
- `compileChemd(...).authoringAssistance` is the canonical editor-authoring contract for minimal-set status, starter/companion templates, and conservative source patches.
- Diagnostics quick-fix types and compile artifacts must be consumed through public `@chemd/compiler` exports.
- Render option changes must stay aligned with `@chemd/render-profile` validators and adapter mapping.

## Examples

- `apps/web/src/app/api/chem/render/route.ts` narrows unknown request bodies before constructing typed render inputs.
- `apps/web/src/server/chem/dto.ts` models molecule/reaction render, save, OCR, and structure records.
- `packages/core/src/ast.ts` is the source of truth for Chemd document and node types.

## Common Mistakes

- Do not cast route bodies directly to DTOs.
- Do not use `any`; use `unknown` plus narrow helpers.
- Do not duplicate a package type in web code because the import path feels longer.

## Scenario: Chemd Web Boundary Contracts

### 1. Scope / Trigger

- Trigger: Web routes and editor helpers consume canonical `:::chemd` contracts, chem-service DTOs, and renderer SVG/JSON payloads.
- Applies when editing `apps/web/src/app/api/export/json/route.ts`, `apps/web/src/server/chem/json-export.ts`, `apps/web/src/server/chem/chem-service-client.ts`, OCR target selection helpers, render routes, or preview hydration helpers.
- This is cross-layer: parser diagnostics, compiler strict mode, chem-service responses, route envelopes, and browser hydration must agree on the same failure semantics.

### 2. Signatures

```typescript
compileJsonExport(source: string): JsonExportResult

export async function POST(request: Request): Promise<Response>

callChemServiceMoleculeRender(input: MoleculeRenderInput): Promise<MoleculeRenderResult>
callChemServiceReactionRender(input: ReactionRenderInput): Promise<ReactionRenderResult>

selectTargetMoleculeBlock(source: string): SelectedMoleculeBlock | null
selectTargetReactionBlock(source: string): SelectedReactionBlock | null

hydrateRenderedPreview(root: ParentNode, html: string): void
```

### 3. Contracts

JSON export route contract:

| Boundary | Required behavior |
|----------|-------------------|
| `Content-Type` | Accept JSON requests; reject non-JSON with `415` |
| `Content-Length` | Reject bodies over the configured route limit with `413` before compile |
| `source` | Require a string and enforce the route character limit |
| Compiler options | Use `compileChemd(source, { strictChemdKind: true })` |
| Diagnostics | Preserve missing/invalid `kind:` diagnostics in the response payload |

Canonical editor target contract:

| Helper | Required behavior |
|--------|-------------------|
| `selectTargetMoleculeBlock` | Return a target only for explicit `kind: molecule` |
| `selectTargetReactionBlock` | Return a target only for explicit `kind: reaction` |
| Kind-less `:::chemd` | Return `null`; migration or quick-fix flow owns conversion |

Chem-service client contract:

| Field / state | Required behavior |
|---------------|-------------------|
| `CHEM_SERVICE_TIMEOUT_MS` | Optional integer override for fetch timeout |
| Timeout | Abort request and throw `ChemServiceError` with status `504` and code `E_CHEM_SERVICE_TIMEOUT` |
| Empty reaction side | Allow intentionally empty `reactants` or `products` arrays for render/cache placeholder workflows |

SVG hydration contract:

| Payload | Required behavior |
|---------|-------------------|
| Root element | Must start as an SVG payload |
| `<script>` | Reject |
| Inline event handlers | Reject attributes such as `onload=` |
| `javascript:` URL | Reject |

### 4. Validation & Error Matrix

| Condition | Expected status / result | Test point |
|-----------|--------------------------|------------|
| JSON export request is not JSON | `415 unsupportedMediaType` | `apps/web/tests/json-export.test.ts` |
| JSON export body too large | `413 requestTooLarge` | `apps/web/tests/json-export.test.ts` |
| `:::chemd` has no explicit kind in strict export | Response contains strict kind diagnostic | `apps/web/tests/json-export.test.ts` |
| OCR target is kind-less | Selection returns `null` | `apps/web/tests/ocr-target-selection.test.ts` |
| Reaction target is kind-less | Selection returns `null` | `apps/web/tests/reaction-target-selection.test.ts` |
| Chem-service fetch aborts | `ChemServiceError.status === 504` | `apps/web/tests/chem-service-client.test.ts` |
| Dangerous SVG payload | Existing safe markup is not replaced | `apps/web/tests/rendered-preview-helpers.test.ts` |

### 5. Good/Base/Bad Cases

Good:

- Exporting `:::chemd kind: molecule` with `smiles` and `cas` returns molecule JSON with independent fields and any diagnostics preserved.
- Rendering a reaction with an intentionally empty side reaches the chem-service renderer instead of being rejected at the Web boundary.
- A timed-out chem-service call returns a typed 504 error that route code can serialize.

Base:

- Existing canonical documents still export JSON and hydrate safe SVG payloads.
- Web selection helpers can return `null`; callers must treat that as "no canonical editable target".

Bad:

- Do not infer a molecule or reaction target from fields when the `kind:` header is missing.
- Do not accept script-bearing SVG into preview hydration.
- Do not swallow strict compiler diagnostics before serializing JSON export output.

### 6. Tests Required

- `apps/web/tests/json-export.test.ts`: strict kind diagnostics, request media type, body size, CAS/SMILES, and layout strategy.
- `apps/web/tests/ocr-target-selection.test.ts`: kind-less molecule block returns `null`.
- `apps/web/tests/reaction-target-selection.test.ts`: kind-less reaction block returns `null`.
- `apps/web/tests/chem-render-route.test.ts`: empty reaction side is accepted.
- `apps/web/tests/chem-service-client.test.ts`: timeout maps to status `504` and code `E_CHEM_SERVICE_TIMEOUT`.
- `apps/web/tests/rendered-preview-helpers.test.ts`: dangerous SVG does not replace safe rendered markup.

### 7. Wrong vs Correct

#### Wrong

```typescript
const document = compileChemd(source).document;
const target = findFirstBlockWithField(document, "smiles");
```

This treats field shape as author intent and bypasses strict `kind:` diagnostics.

#### Correct

```typescript
const result = compileChemd(source, { strictChemdKind: true });
const target = selectTargetMoleculeBlock(source);
```

Strict compiler diagnostics stay visible, and editor helpers only operate on explicit canonical targets.

## Scenario: Authoring Assistance Contract

### 1. Scope / Trigger

- Trigger: editor UI consumes `compileChemd(...).authoringAssistance` to reduce author writing burden.
- Applies when editing `apps/web/src/app/page.tsx`, `apps/web/src/features/editor/*`, or other compile result consumers.

### 2. Contracts

| Field | Required behavior |
|-------|-------------------|
| `minimal_sets` | Read-only status for authored vs inferable gaps |
| `templates` | Read-only starter/companion patches; UI may apply them, compiler never auto-applies them |
| `suggestions` | Conservative only: unique-target ref completion, baseline inheritance, and attempt/result pairing |

### 3. Wrong vs Correct

#### Wrong

```typescript
applySourceChange(compileResult.authoringAssistance.suggestions[0] as unknown as string);
```

This bypasses the compiler patch helper and loses the source-edit contract.

#### Correct

```typescript
const nextSource = applyAuthoringSuggestion(source, suggestion);
applySourceChange(nextSource);
```

The editor consumes only the public compiler patch helpers and keeps suggestion application explicit.
