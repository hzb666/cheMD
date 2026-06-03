import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "@chemd/parser";

import { typecheckProgram } from "../src/index";

const parse = (source: string) => parseChemdProgram(source);

describe("program typechecker procedures and agents", () => {
  it("lowers procedure declarations into basic stepGraph steps", () => {
    const result = typecheckProgram(parse(`module exp_proc

meta {
  id: "exp-proc"
  title: "Procedure"
  date: "2026-05-28"
}

molecule mol_a {
  name: "aryl bromide"
}

reaction rxn_1 {
  reactants: [@mol_a]
}

procedure proc_1 for @rxn_1 {
  step charge = charge(inputs: [@mol_a])
  step heat = heat(duration: 2 h, depends_on: [charge])
}
`));

    expect(result.stepGraph.steps).toHaveLength(2);
    expect(result.stepGraph.steps[0]).toMatchObject({
      stepId: "charge",
      family: "charge",
      source: { sourceNodeId: "proc_1", sourceType: "explicit_step" }
    });
    expect(result.typedGraph.nodes.find((node) => node.nodeId === "heat")).toMatchObject({
      kind: "step",
      sourceMetadata: {
        sourceKind: "procedure_step",
        declarationKind: "procedure",
        declarationId: "proc_1"
      }
    });
  });

  it("recursively lowers procedure controls and nested steps", () => {
    const program = parse(`module exp_control

meta {
  id: "exp-control"
  title: "Control"
  date: "2026-05-28"
}

procedure proc_1 {
  step charge = charge(amount: 1 mmol)
}
`);
    const procedure = program.declarations.find((item) => item.kind === "procedure");
    if (procedure?.kind !== "procedure" || procedure.children[0]?.kind !== "step") {
      throw new Error("expected procedure step fixture");
    }
    const result = typecheckProgram({
      ...program,
      declarations: program.declarations.map((item) =>
        item.kind === "procedure"
          ? {
              ...item,
              children: [
                {
                  kind: "control",
                  id: "repeat_1",
                  controlKind: "repeat",
                  args: {
                    count: {
                      type: "number",
                      raw: "2",
                      value: 2,
                      sourceSpan: {}
                    }
                  },
                  children: [procedure.children[0]]
                }
              ]
            }
          : item
      )
    });

    expect(result.stepGraph.controls).toEqual([
      expect.objectContaining({ controlId: "repeat_1", kind: "repeat" })
    ]);
    expect(result.stepGraph.steps).toEqual([
      expect.objectContaining({ stepId: "charge", controlPath: ["repeat_1"] })
    ]);
    expect(result.typedGraph.quantities.map((item) => item.raw)).toContain("1 mmol");
  });

  it("parses and validates source-level procedure controls", () => {
    const result = typecheckProgram(parse(`module exp_control_source

meta {
  id: "exp-control-source"
  title: "Control source"
  date: "2026-06-04"
}

procedure proc_1 {
  repeat repeat_charge(count: 2) {
    step charge = charge(amount: 1 mmol)
  }

  until until_clear(condition: "sensor.ph > 7", max_iterations: 3) {
    step sample = sample(depends_on: [charge])
  }

  branch branch_workup {
    case acidic(condition: "sensor.ph < 7") {
      step neutralize = add(depends_on: [sample])
    }
    default {
      step hold = hold(depends_on: [neutralize])
    }
  }

  parallel parallel_workup {
    path organic {
      step extract = extract(depends_on: [hold])
    }
    path aqueous {
      step wash = wash(depends_on: [hold])
    }
  }

  wait operator_confirm(condition: "operator.confirmed")
  abort_if temp_high(condition: "sensor.temperature > 80")
}
`));

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      severity: "error"
    }));
    expect(result.stepGraph.controls).toEqual(expect.arrayContaining([
      expect.objectContaining({ controlId: "repeat_charge", kind: "repeat", dynamic: false }),
      expect.objectContaining({ controlId: "until_clear", kind: "until", dynamic: true }),
      expect.objectContaining({ controlId: "branch_workup", kind: "branch", dynamic: true }),
      expect.objectContaining({ controlId: "parallel_workup", kind: "parallel", dynamic: false }),
      expect.objectContaining({ controlId: "operator_confirm", kind: "wait", dynamic: true }),
      expect.objectContaining({ controlId: "temp_high", kind: "abort_if", dynamic: true })
    ]));
    expect(result.stepGraph.steps.find((step) => step.stepId === "neutralize")?.controlPath).toEqual([
      "branch_workup",
      "branch_workup.acidic"
    ]);
  });

  it("diagnoses invalid source-level procedure controls", () => {
    const result = typecheckProgram(parse(`module exp_control_invalid

meta {
  id: "exp-control-invalid"
  title: "Control invalid"
  date: "2026-06-04"
}

procedure proc_1 {
  repeat bad_repeat(count: 0) {
  }

  until bad_until {
    step observe_1 = observe()
  }

  branch bad_branch {
    case first {
      step branch_step = observe()
    }
  }

  parallel bad_parallel {
    path only {
    }
  }

  wait wait_bad
  abort_if abort_bad(condition: "lab.temperature")
}
`));

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_COUNT", sourceField: "repeat" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_BODY", sourceField: "repeat" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_CONDITION", sourceField: "until" }),
      expect.objectContaining({ code: "W_PROCEDURE_CONTROL_DYNAMIC", sourceField: "until" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_BRANCH", sourceField: "branch" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_PARALLEL", sourceField: "parallel" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_BODY", sourceField: "path" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_CONDITION", sourceField: "wait" }),
      expect.objectContaining({ code: "E_PROCEDURE_CONTROL_CONDITION", sourceField: "abort_if" })
    ]));
  });

  it("validates duplicate procedure step ids dependency refs and cycles", () => {
    const result = typecheckProgram(parse(`module exp_proc_invalid

meta {
  id: "exp-proc-invalid"
  title: "Procedure invalid"
  date: "2026-06-04"
}

procedure proc_1 {
  step charge = charge(depends_on: [heat])
  step charge = heat(depends_on: [charge])
}
`));

    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "E_STEP_ID_DUPLICATE",
        "E_STEP_DEPENDENCY_CYCLE"
      ])
    );
  });

  it("diagnoses missing explicit steps when procedureMode is explicit", () => {
    const result = typecheckProgram(parse(`module exp_proc_empty

meta {
  id: "exp-proc-empty"
  title: "Procedure empty"
  date: "2026-06-04"
}

procedure proc_1 {
}
`), { procedureMode: "explicit" });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E_STEP_MISSING_FIELD" })
    );
  });

  it("can emit lowered-only procedure graph nodes", () => {
    const result = typecheckProgram(parse(`module exp_proc_lowered

meta {
  id: "exp-proc-lowered"
  title: "Procedure lowered"
  date: "2026-06-04"
}

procedure proc_1 {
  step charge = charge(amount: 1 mmol)
}
`), { procedureMode: "lowered" });

    expect(result.typedGraph.nodes).toContainEqual(
      expect.objectContaining({ kind: "step", nodeId: "charge" })
    );
    expect(result.typedGraph.nodes).not.toContainEqual(
      expect.objectContaining({ kind: "procedure_narrative", nodeId: "proc_1" })
    );
  });

  it("validates agent tool patch decision and terminal status fields", () => {
    const result = typecheckProgram(parse(`module exp_agent

meta {
  id: "exp-agent"
  title: "Agent"
  date: "2026-05-28"
}

reaction rxn_1 {
  name: "screen"
}

agent run repair_1 {
  goal: "repair source"
  status: completed

  tool shell_command {
    status: ok
  }

  patch proposed {
    edit missing_decl.solvent = "THF"
  }

  decision approved {
    patch: "missing_patch"
  }
}
`));

    expect(result.typedGraph.nodes.find((node) => node.nodeId === "repair_1")).toMatchObject({
      kind: "agent_run",
      status: "completed",
      toolCalls: [{ id: "shell_command", name: "shell_command", status: "ok" }]
    });
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "E_AGENT_TOOL_UNKNOWN",
      "E_AGENT_PATCH_TARGET_UNRESOLVED",
      "E_AGENT_PATCH_DECISION_ORPHAN",
      "E_AGENT_RUN_STATUS_INCOMPLETE"
    ]));
  });

  it("accepts terminal agent runs with a matching audit timeline event", () => {
    const result = typecheckProgram(parse(`module exp_agent_terminal

meta {
  id: "exp-agent-terminal"
  title: "Agent terminal"
  date: "2026-05-28"
}

agent run repair_1 {
  goal: "repair source"
  status: completed

  timeline completed {
    at: "2026-05-28T15:00:00Z"
    actor: "codex"
  }
}
`));

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "E_AGENT_RUN_STATUS_INCOMPLETE"
    }));
  });
});
