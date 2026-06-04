# Reaction Flight Deck Demo

## Goal

Add a runnable Chemd demo that shows a chemistry experiment as a compiled,
linked, diagnosable, and diffable program.

## Scope

- Create a root example under `examples/reaction-flight-deck`.
- Include shared reagents, Suzuki-Miyaura, direct amidation, and broken
  diagnostic scenarios.
- Include a README with exact CLI commands and source references.
- Validate the demo through the local Chemd CLI.

## Out of Scope

- Language-layer implementation changes.
- IDE work.
- Device control.
- Training export semantics.

## Acceptance

- Valid demo files pass `chemd check`.
- Valid demo modules pass `chemd link`.
- Broken demo reports intentional diagnostics.
- Incremental, diff, and preflight demo commands run.
