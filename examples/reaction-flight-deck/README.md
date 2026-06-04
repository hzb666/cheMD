# Chemd Reaction Flight Deck

This demo shows Chemd as a chemistry programming language: source files are
parsed, typechecked, linked across modules, checked before runtime, and compared
with semantic diffs.

The demo is intentionally built around two real reaction classes:

- Suzuki-Miyaura heteroaryl coupling:
  `5-bromopyrimidine + 3-furanylboronic acid -> 5-(furan-3-yl)pyrimidine`.
  Source pattern: Organic Syntheses v93p0306,
  https://www.orgsyn.org/demo.aspx?prep=v93p0306.
- Direct amide formation:
  `4-phenylbutyric acid + benzylamine -> N-benzyl-4-phenylbutyramide`.
  Source pattern: Organic Syntheses v81p0262,
  https://www.orgsyn.org/demo.aspx?prep=v81p0262.

The files are language demos, not operating procedures for wet-lab execution.

## Files

- `shared-reagents.chemd` defines the shared reagent and product library.
- `suzuki-pyrimidine.chemd` models the Suzuki route, controls, result, analysis,
  and agent audit.
- `amidation-benzylamide.chemd` models the direct amidation route, release
  criteria, result, analysis, and agent audit.
- `screen-comparison.chemd` links both routes into condition screens.
- `broken-demo.chemd` intentionally demonstrates diagnostics.
- `suzuki-before.chemd` and `suzuki-after.chemd` demonstrate semantic diff.

## Run The Demo

Use the local CLI from the repository root:

```bash
node packages/cli/bin/chemd.mjs check \
  examples/reaction-flight-deck/shared-reagents.chemd \
  examples/reaction-flight-deck/suzuki-pyrimidine.chemd \
  examples/reaction-flight-deck/amidation-benzylamide.chemd \
  examples/reaction-flight-deck/screen-comparison.chemd \
  examples/reaction-flight-deck/suzuki-before.chemd \
  examples/reaction-flight-deck/suzuki-after.chemd
```

Expected result: all six valid files report `0 error(s), 0 warning(s)`.

```bash
node packages/cli/bin/chemd.mjs link \
  examples/reaction-flight-deck/shared-reagents.chemd \
  examples/reaction-flight-deck/suzuki-pyrimidine.chemd \
  examples/reaction-flight-deck/amidation-benzylamide.chemd \
  examples/reaction-flight-deck/screen-comparison.chemd \
  --changed examples/reaction-flight-deck/shared-reagents.chemd
```

Expected result: the linker resolves four modules, reports no diagnostics, and
marks all dependent modules as affected by the shared reagent change.

```bash
node packages/cli/bin/chemd.mjs incremental \
  examples/reaction-flight-deck/shared-reagents.chemd \
  examples/reaction-flight-deck/suzuki-pyrimidine.chemd \
  examples/reaction-flight-deck/amidation-benzylamide.chemd
```

Expected result: incremental compile reports cache state per file and no
diagnostics.

```bash
node packages/cli/bin/chemd.mjs diff \
  examples/reaction-flight-deck/suzuki-before.chemd \
  examples/reaction-flight-deck/suzuki-after.chemd
```

Expected result: semantic diff reports the Suzuki temperature increase, result
status/yield/purity changes, and the added `abort_if` runtime control.

```bash
node packages/cli/bin/chemd.mjs preflight \
  examples/reaction-flight-deck/suzuki-pyrimidine.chemd \
  --mode human-run
```

Expected result: the run is non-blocking, while safety and dynamic-control
warnings identify steps requiring confirmation and controls requiring runtime
decisions.

## Diagnostic Scene

```bash
node packages/cli/bin/chemd.mjs link \
  examples/reaction-flight-deck/shared-reagents.chemd \
  examples/reaction-flight-deck/broken-demo.chemd
```

Expected result: the broken scene reports three intentional errors:

- `E301`: `agent run` is missing required `status`.
- `E_PROCEDURE_CONTROL_CONDITION`: malformed structured condition.
- `E_PROGRAM_REFERENCE_TARGET_KIND`: a molecule is used where a result reaction
  reference must target a reaction.

This is the strongest moment in the demo: Chemd catches a scientific reference
mistake that plain text experiment records cannot represent.
