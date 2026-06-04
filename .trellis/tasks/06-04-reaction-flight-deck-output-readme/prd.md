# PRD: Record Reaction Flight Deck Outputs

## Goal

Record the actual CLI outputs for the Reaction Flight Deck demo in the demo
README so the scenario can be replayed from the repository root.

## Scope

- Add actual command outputs for the valid check, module link, incremental
  compile, semantic diff, runtime preflight, and broken diagnostic scene.
- Preserve the existing demo source files and CLI behavior.
- Mark the broken diagnostic command as an expected non-zero result.

## Acceptance

- README contains actual outputs for every demo command.
- CLI commands are rerun against the current workspace.
- Final verification confirms the README-only update has no formatting or
  command drift.
