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

The graph workspace also includes real SI-derived Suzuki-Miyaura source records
from RSC and Nature Communications papers. These records are intentionally
source-first: shared catalysts, bases, solvents, reactions, procedures, results,
analyses, and comparison screens are Chemd declarations, not JSON sidecars.

The files are language demos, not operating procedures for wet-lab execution.

## Files

- `shared-reagents.chemd` defines the shared reagent, Pd catalyst, base,
  solvent, and product library used by the synthetic demo and SI-derived
  records.
- `suzuki-pyrimidine.chemd` models the Pd-catalyzed Suzuki route, catalyst
  screen inputs, controls, result, analysis, and agent audit.
- `amidation-benzylamide.chemd` models the direct amidation route, release
  criteria, result, analysis, and agent audit.
- `screen-comparison.chemd` links both routes into condition screens.
- `si-rsc-2009-aqueous-suzuki.chemd` captures an aqueous RSC Suzuki SI record.
- `si-rsc-2011-neat-water-suzuki.chemd` captures a neat-water RSC Suzuki
  protocol with `rt` as a symbolic temperature.
- `si-rsc-2019-continuous-flow.chemd` captures a continuous-flow
  Pd-beta-cyclodextrin Suzuki kinetics SI record.
- `si-nature-2024-ptc-suzuki.chemd` and `si-nature-2024-ptc-tbab.chemd`
  capture the standard and TBAB phase-transfer variants from a Nature
  Communications Suzuki SI.
- `real-si-comparison.chemd` links the real SI-derived records into
  cross-document condition screens.
- `broken-demo.chemd` intentionally demonstrates diagnostics.
- `suzuki-before.chemd` and `suzuki-after.chemd` demonstrate semantic diff.

## Run The Demo

Use the local CLI from the repository root:

```bash
node packages/cli/bin/chemd.mjs check \
  examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd \
  examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd \
  examples/source-first-demo/reaction-flight-deck/amidation-benzylamide.chemd \
  examples/source-first-demo/reaction-flight-deck/screen-comparison.chemd \
  examples/source-first-demo/reaction-flight-deck/si-rsc-2009-aqueous-suzuki.chemd \
  examples/source-first-demo/reaction-flight-deck/si-rsc-2011-neat-water-suzuki.chemd \
  examples/source-first-demo/reaction-flight-deck/si-rsc-2019-continuous-flow.chemd \
  examples/source-first-demo/reaction-flight-deck/si-nature-2024-ptc-suzuki.chemd \
  examples/source-first-demo/reaction-flight-deck/si-nature-2024-ptc-tbab.chemd \
  examples/source-first-demo/reaction-flight-deck/real-si-comparison.chemd \
  --target validate --format text
```

Actual output:

```text
Chemd check (validate)
  files: 10
  totals: 0 error(s), 0 warning(s), 0 info
examples\source-first-demo\reaction-flight-deck\amidation-benzylamide.chemd: 0 error(s), 0 warning(s), 0 info (5 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\real-si-comparison.chemd: 0 error(s), 0 warning(s), 0 info (7 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\screen-comparison.chemd: 0 error(s), 0 warning(s), 0 info (5 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\shared-reagents.chemd: 0 error(s), 0 warning(s), 0 info (39 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\si-nature-2024-ptc-suzuki.chemd: 0 error(s), 0 warning(s), 0 info (6 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\si-nature-2024-ptc-tbab.chemd: 0 error(s), 0 warning(s), 0 info (6 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\si-rsc-2009-aqueous-suzuki.chemd: 0 error(s), 0 warning(s), 0 info (8 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\si-rsc-2011-neat-water-suzuki.chemd: 0 error(s), 0 warning(s), 0 info (6 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\si-rsc-2019-continuous-flow.chemd: 0 error(s), 0 warning(s), 0 info (7 declaration(s), 0 doc comment(s))
examples\source-first-demo\reaction-flight-deck\suzuki-pyrimidine.chemd: 0 error(s), 0 warning(s), 0 info (5 declaration(s), 0 doc comment(s))
```

The shorter commands below demonstrate linking, incremental compilation, diff,
and runtime-preflight behavior on the original four-document flight deck.

```bash
node packages/cli/bin/chemd.mjs link \
  examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd \
  examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd \
  examples/source-first-demo/reaction-flight-deck/amidation-benzylamide.chemd \
  examples/source-first-demo/reaction-flight-deck/screen-comparison.chemd \
  --changed examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd
```

Actual output:

```text
Chemd module link
  entry: demo_shared_reagents (demo-shared-reagents)
  modules: 4
  imports: 4
  affected: 4
  diagnostics: 0 error(s), 0 warning(s), 0 info
  - demo_shared_reagents (demo-shared-reagents) examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd
  - demo_suzuki_pyrimidine (demo-suzuki-pyrimidine) examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd
  - demo_amidation_benzylamide (demo-amidation-benzylamide) examples/source-first-demo/reaction-flight-deck/amidation-benzylamide.chemd
  - demo_screen_comparison (demo-screen-comparison) examples/source-first-demo/reaction-flight-deck/screen-comparison.chemd
  import demo_suzuki_pyrimidine: ./shared-reagents.chemd [resolved] -> demo_shared_reagents
  import demo_amidation_benzylamide: ./shared-reagents.chemd [resolved] -> demo_shared_reagents
  import demo_screen_comparison: ./suzuki-pyrimidine.chemd [resolved] -> demo_suzuki_pyrimidine
  import demo_screen_comparison: ./amidation-benzylamide.chemd [resolved] -> demo_amidation_benzylamide
  affected modules: demo_shared_reagents, demo_amidation_benzylamide, demo_suzuki_pyrimidine, demo_screen_comparison
```

```bash
node packages/cli/bin/chemd.mjs incremental \
  examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd \
  examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd \
  examples/source-first-demo/reaction-flight-deck/amidation-benzylamide.chemd
```

Actual output:

```text
Chemd incremental compile
  files: 3
  diagnostics: 0 error(s), 0 warning(s), 0 info
  - examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd: cold rev=1 0 error(s), 0 warning(s)
  - examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd: changed rev=2 0 error(s), 0 warning(s)
  - examples/source-first-demo/reaction-flight-deck/amidation-benzylamide.chemd: changed rev=3 0 error(s), 0 warning(s)
```

```bash
node packages/cli/bin/chemd.mjs diff \
  examples/source-first-demo/reaction-flight-deck/suzuki-before.chemd \
  examples/source-first-demo/reaction-flight-deck/suzuki-after.chemd
```

Actual output:

```text
~ meta #demo-suzuki-diff
  ~ fields.title: {"type":"string","value":"Suzuki diff before"} -> {"type":"string","value":"Suzuki diff after"}
  ~ title: "Suzuki diff before" -> "Suzuki diff after"
~ module #module
  ~ name: "demo_suzuki_diff_before" -> "demo_suzuki_diff_after"
+ control #proc_suzuki.overheated
  + condition: {"kind":"binary","left":{"kind":"runtime_reference","namespace":"sensor","path":"temperature","raw":"sensor.temperature"},"op":">","raw":"sensor.temperature > 130 C","right":{"kind":"quantity","raw":"130 C","unit":"C","value":130}}
  + controlPath: ["overheated"]
  + dynamic: true
  + kind: "abort_if"
  + params: {"condition":"sensor.temperature > 130 C"}
  + procedureId: "proc_suzuki"
~ procedure #proc_suzuki
  ~ children: [{"args":{"materials":{"type":"string","value":"heteroaryl partners"}},"family":"charge","id":"charge","kind":"step"},{"args":{"condition":{"type":"string","value":"operator.confirmed"}},"children":[],"condition":{"kind":"runtime_reference","namespace":"operator","path":"confirmed","raw":"operator.confirmed"},"controlKind":"wait","id":"operator_gate","kind":"control"},{"args":{"depends_on":{"items":[{"name":"charge","type":"identifier"},{"name":"operator_gate","type":"identifier"}],"type":"list"},"duration":{"type":"quantity","unit":"h","value":12},"temperature":{"type":"quantity","unit":"C","value":100}},"dependsOn":["charge","operator_gate"],"family":"heat","id":"heat","kind":"step"}] -> [{"args":{"materials":{"type":"string","value":"heteroaryl partners"}},"family":"charge","id":"charge","kind":"step"},{"args":{"condition":{"type":"string","value":"operator.confirmed"}},"children":[],"condition":{"kind":"runtime_reference","namespace":"operator","path":"confirmed","raw":"operator.confirmed"},"controlKind":"wait","id":"operator_gate","kind":"control"},{"args":{"condition":{"type":"string","value":"sensor.temperature > 130 C"}},"children":[],"condition":{"kind":"binary","left":{"kind":"runtime_reference","namespace":"sensor","path":"temperature","raw":"sensor.temperature"},"op":">","raw":"sensor.temperature > 130 C","right":{"kind":"quantity","raw":"130 C","unit":"C","value":130}},"controlKind":"abort_if","id":"overheated","kind":"control"},{"args":{"depends_on":{"items":[{"name":"charge","type":"identifier"},{"name":"operator_gate","type":"identifier"}],"type":"list"},"duration":{"type":"quantity","unit":"h","value":12},"temperature":{"type":"quantity","unit":"C","value":120}},"dependsOn":["charge","operator_gate"],"family":"heat","id":"heat","kind":"step"}]
~ procedure_state_step #proc_suzuki.heat
  ~ conditions: {"duration":"12 h","temperature":"100 C"} -> {"duration":"12 h","temperature":"120 C"}
~ reaction #rxn_suzuki_pyrimidine
  ~ fields.temperature: {"type":"quantity","unit":"C","value":100} -> {"type":"quantity","unit":"C","value":120}
~ result #res_suzuki
  ~ fields.purity: {"type":"percent","value":92} -> {"type":"percent","value":97}
  ~ fields.status: {"name":"partial","type":"identifier"} -> {"name":"success","type":"identifier"}
  ~ fields.yield: {"type":"percent","value":64} -> {"type":"percent","value":86}
+ run_control #overheated
  + controlPath: ["overheated"]
  + dynamic: true
  + kind: "abort_if"
  + params: {"condition":"sensor.temperature > 130 C"}
~ run_step #heat
  ~ params: {"depends_on":"[charge, operator_gate]","duration":{"canonicalUnit":"h","canonicalValue":12,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"duration","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"time","raw":"12 h","sourceField":"duration","sourceNodeId":"heat","unit":"h","value":12,"valueKind":"scalar"},"temperature":{"canonicalUnit":"C","canonicalValue":100,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"temperature","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"temperature","raw":"100 C","sourceField":"temperature","sourceNodeId":"heat","unit":"C","value":100,"valueKind":"scalar"}} -> {"depends_on":"[charge, operator_gate]","duration":{"canonicalUnit":"h","canonicalValue":12,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"duration","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"time","raw":"12 h","sourceField":"duration","sourceNodeId":"heat","unit":"h","value":12,"valueKind":"scalar"},"temperature":{"canonicalUnit":"C","canonicalValue":120,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"temperature","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"temperature","raw":"120 C","sourceField":"temperature","sourceNodeId":"heat","unit":"C","value":120,"valueKind":"scalar"}}
~ typed:reaction #rxn_suzuki_pyrimidine
  ~ temperature: {"kind":"quantity","quantityClass":"amount","raw":"100 C","sourceField":"temperature","sourceNodeId":"rxn_suzuki_pyrimidine","unit":"C","value":100,"valueKind":"scalar"} -> {"kind":"quantity","quantityClass":"amount","raw":"120 C","sourceField":"temperature","sourceNodeId":"rxn_suzuki_pyrimidine","unit":"C","value":120,"valueKind":"scalar"}
~ typed:result #res_suzuki
  ~ purity: {"kind":"quantity","quantityClass":"percent","raw":"92%","sourceField":"purity","sourceNodeId":"res_suzuki","unit":"%","value":92,"valueKind":"scalar"} -> {"kind":"quantity","quantityClass":"percent","raw":"97%","sourceField":"purity","sourceNodeId":"res_suzuki","unit":"%","value":97,"valueKind":"scalar"}
  ~ status: "partial" -> "success"
  ~ yield: {"kind":"quantity","quantityClass":"percent","raw":"64%","sourceField":"yield","sourceNodeId":"res_suzuki","unit":"%","value":64,"valueKind":"scalar"} -> {"kind":"quantity","quantityClass":"percent","raw":"86%","sourceField":"yield","sourceNodeId":"res_suzuki","unit":"%","value":86,"valueKind":"scalar"}
~ typed:step #heat
  ~ params: {"depends_on":"[charge, operator_gate]","duration":{"canonicalUnit":"h","canonicalValue":12,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"duration","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"time","raw":"12 h","sourceField":"duration","sourceNodeId":"heat","unit":"h","value":12,"valueKind":"scalar"},"temperature":{"canonicalUnit":"C","canonicalValue":100,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"temperature","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"temperature","raw":"100 C","sourceField":"temperature","sourceNodeId":"heat","unit":"C","value":100,"valueKind":"scalar"}} -> {"depends_on":"[charge, operator_gate]","duration":{"canonicalUnit":"h","canonicalValue":12,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"duration","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"time","raw":"12 h","sourceField":"duration","sourceNodeId":"heat","unit":"h","value":12,"valueKind":"scalar"},"temperature":{"canonicalUnit":"C","canonicalValue":120,"kind":"quantity","provenance":{"confidence":1,"origin":"normalized","ruleId":"quantity.unit_normalization","sourceField":"temperature","sourceNodeId":"heat","sourceNodeType":"step"},"quantityClass":"temperature","raw":"120 C","sourceField":"temperature","sourceNodeId":"heat","unit":"C","value":120,"valueKind":"scalar"}}
```

```bash
node packages/cli/bin/chemd.mjs preflight \
  examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd \
  --mode human-run
```

Actual output:

```text
Chemd preflight (human-run)
  file: examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd
  blocking: no
  issues: 18
warning E_RUNTIME_SAFETY_TAG safety charge Step charge has safety tag: inventory
warning E_RUNTIME_SAFETY_TAG safety charge Step charge has safety tag: vessel
warning E_RUNTIME_SAFETY_CONFIRMATION safety add_base Step add_base requires manual confirmation.
warning E_RUNTIME_SAFETY_TAG safety add_base Step add_base has safety tag: hazardous_reagent
warning E_RUNTIME_SAFETY_CONFIRMATION safety add_catalyst Step add_catalyst requires manual confirmation.
warning E_RUNTIME_SAFETY_TAG safety add_catalyst Step add_catalyst has safety tag: hazardous_reagent
warning E_RUNTIME_SAFETY_CONFIRMATION safety heat Step heat requires manual confirmation.
warning E_RUNTIME_SAFETY_TAG safety heat Step heat has safety tag: exotherm
warning E_RUNTIME_SAFETY_CONFIRMATION safety quench Step quench requires manual confirmation.
warning E_RUNTIME_SAFETY_TAG safety quench Step quench has safety tag: quench
warning E_RUNTIME_SAFETY_TAG safety quench Step quench has safety tag: exotherm
warning E_RUNTIME_SAFETY_TAG safety quench Step quench has safety tag: gas_evolution
warning E_RUNTIME_SAFETY_TAG safety extract Step extract has safety tag: biphasic_system
warning E_RUNTIME_SAFETY_TAG safety split Step split has safety tag: biphasic_system
warning E_RUNTIME_CONTROL_DYNAMIC control operator_gate Control operator_gate requires runtime decision: wait
warning E_RUNTIME_CONTROL_DYNAMIC control overheated Control overheated requires runtime decision: abort_if
warning E_RUNTIME_CONTROL_DYNAMIC control clean_profile Control clean_profile requires runtime decision: until
warning E_RUNTIME_CONTROL_DYNAMIC control low_yield Control low_yield requires runtime decision: abort_if
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#charge] Step charge has safety tag: inventory
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#charge] Step charge has safety tag: vessel
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#add_base] Step add_base requires manual confirmation.
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#add_base] Step add_base has safety tag: hazardous_reagent
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#add_catalyst] Step add_catalyst requires manual confirmation.
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#add_catalyst] Step add_catalyst has safety tag: hazardous_reagent
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#heat] Step heat requires manual confirmation.
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#heat] Step heat has safety tag: exotherm
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#quench] Step quench requires manual confirmation.
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#quench] Step quench has safety tag: quench
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#quench] Step quench has safety tag: exotherm
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#quench] Step quench has safety tag: gas_evolution
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#extract] Step extract has safety tag: biphasic_system
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning W_RUNTIME_SAFETY [runtime_preflight step#split] Step split has safety tag: biphasic_system
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning E_RUNTIME_CONTROL [runtime_preflight procedure#operator_gate] Control operator_gate requires runtime decision: wait
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning E_RUNTIME_CONTROL [runtime_preflight procedure#overheated] Control overheated requires runtime decision: abort_if
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning E_RUNTIME_CONTROL [runtime_preflight procedure#clean_profile] Control clean_profile requires runtime decision: until
examples/source-first-demo/reaction-flight-deck/suzuki-pyrimidine.chemd warning E_RUNTIME_CONTROL [runtime_preflight procedure#low_yield] Control low_yield requires runtime decision: abort_if
```

## Diagnostic Scene

```bash
node packages/cli/bin/chemd.mjs link \
  examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd \
  examples/source-first-demo/reaction-flight-deck/broken-demo.chemd
```

Actual output, with exit code `1`:

```text
Chemd module link
  entry: demo_shared_reagents (demo-shared-reagents)
  modules: 2
  imports: 1
  affected: 0
  diagnostics: 3 error(s), 0 warning(s), 0 info
  - demo_shared_reagents (demo-shared-reagents) examples/source-first-demo/reaction-flight-deck/shared-reagents.chemd
  - demo_broken_reaction_flight_deck (demo-broken-reaction-flight-deck) examples/source-first-demo/reaction-flight-deck/broken-demo.chemd
  import demo_broken_reaction_flight_deck: ./shared-reagents.chemd [resolved] -> demo_shared_reagents
  diagnostics:
  - error E301 agent_run.repair_missing_status.status: agent_run declaration 'repair_missing_status' is missing required field 'status'.
  - error E_PROCEDURE_CONTROL_CONDITION procedure.proc_broken.abort_if: Control condition could not be parsed: sensor.temperature > [120 C
  - error E_PROGRAM_REFERENCE_TARGET_KIND result.res_bad_reference.reaction: Field 'reaction' on result expected reference target reaction, got molecule.
```

The broken scene reports three intentional errors:

- `E301`: `agent run` is missing required `status`.
- `E_PROCEDURE_CONTROL_CONDITION`: malformed structured condition.
- `E_PROGRAM_REFERENCE_TARGET_KIND`: a molecule is used where a result reaction
  reference must target a reaction.

This is the strongest moment in the demo: Chemd catches a scientific reference
mistake that plain text experiment records cannot represent.
