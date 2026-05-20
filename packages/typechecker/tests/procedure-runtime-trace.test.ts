import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

const check = (source: string) => typecheckDocument(resolveChemd(parseChemd(source)));

describe("procedure control flow and trace validation", () => {
  it("normalizes step schema aliases and expands repeat and parallel controls", () => {
    const result = check(`---
id: exp-procedure-runtime
title: Procedure Runtime
date: 2026-05-20
---

:::chemd #mol-a
smiles: CCO
:::

:::material #mat-a
molecule: @mol-a
:::

:::analysis #ana-tlc
type: tlc
result: complete
:::

:::procedure #proc-main
step: charge | id=s-charge | inputs=@mat-a | vessel=reactor-1
step: heat | id=s-heat | target_temperature=40 C | duration=30 min

repeat: wash-cycle | count=2 {
  step: wash | solvent=brine | volume=10 mL
}

parallel: parallel-workup {
  path: organic {
    step: dry | medium=Na2SO4
  }
  path: aqueous {
    step: store | location=waste
  }
}

wait: operator-approval | condition=operator.confirmed | timeout=30 min
:::

:::trace #run-main
plan: @proc-main
mode: human-run
event: run_started | at=2026-05-20T10:00:00Z
event: step_started | step=s-charge | at=2026-05-20T10:01:00Z
event: step_completed | step=s-charge | at=2026-05-20T10:02:00Z
event: control_entered | control=operator-approval | at=2026-05-20T10:03:00Z
event: deviation_recorded | step=s-heat | field=temperature | expected=40 C | actual=45 C
:::
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.stepGraph.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepId: "s-heat", params: expect.objectContaining({ temperature: expect.any(Object) }) }),
      expect.objectContaining({ stepId: "wash-cycle[1].wash", controlPath: ["wash-cycle"] }),
      expect.objectContaining({ stepId: "wash-cycle[2].wash", dependsOn: ["wash-cycle[1].wash"] }),
      expect.objectContaining({ stepId: "parallel-workup.organic.dry" }),
      expect.objectContaining({ stepId: "parallel-workup.aqueous.store" })
    ]));
    expect(result.stepGraph.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ controlId: "wash-cycle", kind: "repeat", dynamic: false }),
      expect.objectContaining({ controlId: "parallel-workup", kind: "parallel", dynamic: false }),
      expect.objectContaining({ controlId: "operator-approval", kind: "wait", dynamic: true })
    ]));
    expect(result.typedGraph.nodes).toContainEqual(expect.objectContaining({
      kind: "trace",
      nodeId: "run-main",
      eventCount: 5
    }));
  });

  it("fails closed for invalid control and trace boundaries", () => {
    const result = check(`---
id: exp-procedure-runtime-invalid
title: Procedure Runtime Invalid
date: 2026-05-20
---

:::procedure #proc-main
repeat: bad-repeat | count=0 {
}
branch: bad-branch {
  case: acidic | condition=@missing.status == complete {
    step: quench | inputs=@mat-base
  }
}
wait: wait-natural | condition=wait for operator
:::

:::trace #run-main
plan: @missing-plan
mode: replay-run
event: step_completed | step=missing-step | at=2026-05-20T10:02:00Z
event: run_started | at=2026-05-20T10:01:00Z
event: deviation_recorded | field=temperature | expected=40 C
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_COUNT" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_BODY" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_BRANCH" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_CONDITION" }),
      expect.objectContaining({ code: "E_TRACE_PLAN_REFERENCE" }),
      expect.objectContaining({ code: "E_TRACE_EVENT_REFERENCE" }),
      expect.objectContaining({ code: "E_TRACE_EVENT_TIME" }),
      expect.objectContaining({ code: "E_TRACE_EVENT_PAYLOAD" }),
      expect.objectContaining({ code: "W_TRACE_STEP_STATE", severity: "error" })
    ]));
  });

  it("keeps trace step references scoped to the referenced procedure plan", () => {
    const result = check(`---
id: exp-trace-plan-scope
title: Trace Plan Scope
date: 2026-05-20
---

:::procedure #proc-main
step: charge | id=s-main | inputs=A
:::

:::procedure #proc-other
step: mix | id=s-other
:::

:::trace #run-main
plan: @proc-main
mode: human-run
event: step_started | step=s-other | at=2026-05-20T10:00:00Z
:::
`);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_TRACE_EVENT_REFERENCE",
      facts: expect.objectContaining({ step_id: "s-other" })
    }));
  });
});
