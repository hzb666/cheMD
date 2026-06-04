import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildProcedureState, compileChemd } from "../src/index";

interface FixtureCase {
  file: string;
  expectedDeclarationKinds: string[];
}

const fixtureCases: FixtureCase[] = [
  {
    file: "program-golden-suzuki-screen.chemd",
    expectedDeclarationKinds: ["molecule", "reaction", "result", "procedure"]
  },
  {
    file: "program-route.chemd",
    expectedDeclarationKinds: ["reaction"]
  },
  {
    file: "program-doc-comments.chemd",
    expectedDeclarationKinds: ["molecule", "reaction", "analysis"]
  },
  {
    file: "program-agent-audit.chemd",
    expectedDeclarationKinds: ["reaction", "result", "agent_run"]
  },
  {
    file: "program-language-core.chemd",
    expectedDeclarationKinds: ["molecule", "reaction", "result", "analysis", "procedure"]
  }
];

const readFixture = (file: string): string =>
  readFileSync(new URL(`../fixtures/${file}`, import.meta.url), "utf8");

describe("program fixture matrix", () => {
  it.each(fixtureCases)("$file compiles without error diagnostics", ({ file, expectedDeclarationKinds }) => {
    const result = compileChemd(readFixture(file));
    const declarationKinds = result.program.declarations.map((node) => node.kind);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), file).toEqual([]);
    for (const kind of expectedDeclarationKinds) {
      expect(declarationKinds, file).toContain(kind);
    }
  });

  it("keeps the language core fixture semantic features executable", () => {
    const result = compileChemd(readFixture("program-language-core.chemd"));
    const controls = result.stepGraph.controls ?? [];
    const heat = result.stepGraph.steps.find((step) => step.stepId === "heat");
    const state = buildProcedureState(result.stepGraph.steps);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(controls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        controlId: "operator_gate",
        condition: expect.objectContaining({ kind: "runtime_reference" }),
        dynamic: true
      }),
      expect.objectContaining({
        controlId: "overheated",
        condition: expect.objectContaining({ kind: "binary", op: ">" }),
        dynamic: true
      }),
      expect.objectContaining({
        controlId: "tlc_clear",
        condition: expect.objectContaining({ kind: "binary", op: "==" }),
        dynamic: true
      })
    ]));
    expect(heat).toMatchObject({
      family: "heat",
      effects: expect.arrayContaining(["changes_temperature"])
    });
    expect(state.finalState.conditions).toMatchObject({
      duration: "1 h",
      temperature: "80 C"
    });
    expect(state.finalState.stateTags).toEqual(expect.arrayContaining([
      "mixture_present",
      "quenched",
      "biphasic"
    ]));
    expect(result.runtimePreflight.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_RUNTIME_CONTROL_DYNAMIC", controlId: "operator_gate" }),
      expect.objectContaining({ code: "E_RUNTIME_CONTROL_DYNAMIC", controlId: "overheated" }),
      expect.objectContaining({ code: "E_RUNTIME_CONTROL_DYNAMIC", controlId: "tlc_clear" })
    ]));
  });
});
