# Phase 9: Exporter training diagnostic evidence

## Goal

Preserve compiler/typechecker diagnostic source evidence in exporter-training
source-layer outputs.

## Scope

- Include diagnostic source layer, source node metadata, source field,
  source span, and facts where available.
- Keep existing exported diagnostic fields compatible.
- Do not read or depend on docs/spec files.

## Validation

- exporter-training targeted tests
- exporter-training typecheck
- compiler fixture matrix
- Trellis context validation
- git diff --check
