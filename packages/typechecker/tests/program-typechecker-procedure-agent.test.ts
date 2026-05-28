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
                  args: {},
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
