import { describe, expect, it } from "vitest";

import { linkChemdModules } from "../src/index";

describe("linkChemdModules", () => {
  it("links provided modules and validates imported symbols", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

result res_entry for @solvents.rxn_shared {
  yield: 78%
}
`
      },
      {
        path: "./shared-solvents.chemd",
        source: `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared solvents"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`
      }
    ]);

    expect(result.entry.moduleName).toBe("exp_entry");
    expect(result.modules.map((item) => item.moduleName)).toEqual([
      "exp_entry",
      "shared_solvents"
    ]);
    expect(result.importGraph.edges).toEqual([
      expect.objectContaining({
        fromModule: "exp_entry",
        toModule: "shared_solvents",
        importModuleName: "shared_solvents",
        importFrom: "./shared-solvents.chemd",
        status: "resolved"
      })
    ]);
    expect(result.diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("diagnoses missing modules, cycles, and missing imported symbols", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

import shared_solvents as solvents from "./shared-solvents.chemd"
import missing_mod from "./missing.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

result res_entry for @solvents.rxn_missing {
  yield: 78%
}
`
      },
      {
        path: "./shared-solvents.chemd",
        source: `module shared_solvents

import exp_entry from "entry.chemd"

meta {
  id: "shared-solvents"
  title: "Shared solvents"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`
      }
    ]);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_MODULE_IMPORT_NOT_FOUND",
        sourceLayer: "module-linker",
        facts: expect.objectContaining({
          moduleName: "missing_mod",
          from: "./missing.chemd"
        })
      }),
      expect.objectContaining({
        code: "E_MODULE_IMPORT_CYCLE",
        sourceLayer: "module-linker",
        facts: expect.objectContaining({
          cycle: ["exp_entry", "shared_solvents", "exp_entry"]
        })
      }),
      expect.objectContaining({
        code: "E_MODULE_SYMBOL_NOT_FOUND",
        sourceLayer: "module-linker",
        facts: expect.objectContaining({
          moduleName: "shared_solvents",
          target: "rxn_missing"
        })
      })
    ]));
  });

  it("diagnoses a missing entry module without silently selecting it", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}
`
      }
    ], { entry: "missing.chemd" });

    expect(result.entry.moduleName).toBe("exp_entry");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_MODULE_ENTRY_NOT_FOUND",
        sourceLayer: "module-linker",
        facts: expect.objectContaining({ entry: "missing.chemd" })
      })
    );
  });

  it("materializes cross-module reference target kinds in linked typed graphs", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

result res_entry for @solvents.rxn_shared {
  yield: 78%
}
`
      },
      {
        path: "./shared-solvents.chemd",
        source: `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared solvents"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`
      }
    ]);
    const entryResult = result.entry.coreResult.typedSemanticGraph.nodes.find(
      (node) => node.nodeId === "res_entry"
    );

    expect(entryResult).toMatchObject({
      kind: "result",
      reaction: {
        kind: "reference",
        refId: "shared_solvents.rxn_shared",
        targetKind: "reaction",
        resolved: true
      }
    });
  });

  it("accepts linked module references in procedure control conditions", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

procedure proc_1 {
  until wait_shared(condition: "@solvents.rxn_shared.status == clean", max_iterations: 2) {
    step observe_1 = observe()
  }
}
`
      },
      {
        path: "./shared-solvents.chemd",
        source: `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared solvents"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`
      }
    ]);

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "E_PROCEDURE_CONTROL_CONDITION",
      facts: expect.objectContaining({ ref: "solvents.rxn_shared.status" })
    }));
    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "E_MODULE_SYMBOL_NOT_FOUND"
    }));
  });

  it("diagnoses missing linked module references in procedure control conditions", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

procedure proc_1 {
  until wait_shared(condition: "@solvents.missing_rxn.status == clean", max_iterations: 2) {
    step observe_1 = observe()
  }
}
`
      },
      {
        path: "./shared-solvents.chemd",
        source: `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared solvents"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`
      }
    ]);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_MODULE_SYMBOL_NOT_FOUND",
      facts: expect.objectContaining({
        alias: "solvents",
        target: "missing_rxn",
        reference: "@solvents.missing_rxn.status"
      })
    }));
  });

  it("materializes cross-module field references in source-level step IO", () => {
    const result = linkChemdModules([
      {
        path: "entry.chemd",
        source: `module exp_entry

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

procedure proc_1 {
  step charge = charge(inputs: [@solvents.rxn_shared.name])
}
`
      },
      {
        path: "./shared-solvents.chemd",
        source: `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared solvents"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`
      }
    ]);
    const charge = result.entry.coreResult.typedSemanticGraph.nodes.find(
      (node) => node.kind === "step" && node.nodeId === "charge"
    );

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "E_UNRESOLVED_PROGRAM_REFERENCE"
    }));
    expect(charge).toMatchObject({
      inputs: [
        expect.objectContaining({
          raw: "@solvents.rxn_shared.name",
          reference: expect.objectContaining({
            refId: "shared_solvents.rxn_shared.name",
            targetKind: "reaction",
            resolved: true
          })
        })
      ]
    });
  });
});
