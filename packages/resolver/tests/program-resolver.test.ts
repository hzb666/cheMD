import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import type { ChemdPatchExpr, ChemdProgramDocument } from "@chemd/core";

import {
  buildProgramSymbolTable,
  resolveChemd,
  type ProgramSymbolTable
} from "../src/index";

const resolve = (source: string) => resolveChemd(parseChemd(source));

const findDeclaration = (
  document: ReturnType<typeof resolve>,
  id: string
) => document.declarations.find((declaration) => declaration.id === id);

const findAgentRun = (
  document: ChemdProgramDocument,
  id: string
) => document.declarations.find(
  (declaration) => declaration.kind === "agent_run" && declaration.id === id
);

describe("resolveChemd program references", () => {
  it("builds a program symbol table with declarations, qualified ids, aliases, and imports", () => {
    const parsed = parseChemd(`module exp_symbols

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-symbols"
  title: "Symbols"
  date: "2026-05-28"
  primary_reaction: @rxn_var1
}

reaction rxn_var1 {
  name: "local"
}
`);
    const diagnostics = [...parsed.diagnostics];
    const symbols: ProgramSymbolTable = buildProgramSymbolTable(parsed, diagnostics);

    expect(diagnostics).toEqual([]);
    expect(symbols.moduleName).toBe("exp_symbols");
    expect(symbols.declarationsById.get("rxn_var1")?.kind).toBe("reaction");
    expect(symbols.declarationsByQualifiedId.get("exp_symbols.rxn_var1")?.id).toBe("rxn_var1");
    expect(symbols.primaryAliases.get("primary_reaction")).toBe("rxn_var1");
    expect(symbols.imports.get("solvents")).toMatchObject({
      moduleName: "shared_solvents",
      from: "./shared-solvents.chemd"
    });
  });

  it("resolves local, field, current-module, imported-module, and external references", () => {
    const document = resolve(`module exp_refs

import shared_solvents as solvents from "./shared-solvents.chemd"

meta {
  id: "exp-refs"
  title: "References"
  date: "2026-05-28"
  primary_reaction: @rxn_var1
}

molecule mol_aryl {
  name: "aryl bromide"
}

reaction rxn_var1 {
  reactants: [@mol_aryl]
}

result res_var1 for @exp_refs.rxn_var1 {
  reaction: @rxn_var1
  imported: @solvents.rxn_shared
  external: @external_doc#rxn_step_01
  yield: 78%
}

analysis ana_var1 for @res_var1.yield {
  target_result: @res_var1
}
`);
    const reaction = findDeclaration(document, "rxn_var1");
    const result = findDeclaration(document, "res_var1");
    const analysis = findDeclaration(document, "ana_var1");

    expect(document.diagnostics).toEqual([]);
    expect(reaction?.kind === "reaction" ? reaction.fields.reactants : undefined)
      .toMatchObject({
        type: "list",
        items: [
          {
            refKind: "local",
            resolved: {
              status: "resolved",
              value: expect.objectContaining({ id: "mol_aryl" })
            }
          }
        ]
      });
    expect(result?.kind === "result" ? result.target?.resolved : undefined)
      .toMatchObject({
        status: "resolved",
        value: expect.objectContaining({ id: "rxn_var1" })
      });
    expect(result?.kind === "result" ? result.fields.imported : undefined)
      .toMatchObject({
        refKind: "module",
        resolved: {
          status: "resolved",
          value: expect.objectContaining({
            kind: "imported_module_reference",
            moduleName: "shared_solvents",
            target: "rxn_shared"
          })
        }
      });
    expect(result?.kind === "result" ? result.fields.external : undefined)
      .toMatchObject({
        refKind: "external_document",
        resolved: {
          status: "resolved",
          value: expect.objectContaining({
            kind: "external_document",
            externalDocumentId: "external_doc",
            target: "rxn_step_01"
          })
        }
      });
    expect(analysis?.kind === "analysis" ? analysis.target?.resolved : undefined)
      .toMatchObject({
        status: "resolved",
        value: expect.objectContaining({ type: "percent", value: 78 })
      });
  });

  it("resolves references nested inside patch expression values", () => {
    const parsed = parseChemd(`module exp_patch_value

meta {
  id: "exp-patch-value"
  title: "Patch value"
  date: "2026-05-28"
}

reaction rxn_var1 {
  yield: 77%
}

agent run run_patch {
  goal: "patch output"
  tool make_patch {
    status: ok
    output: "placeholder"
  }
}
`);
    const patchValue: ChemdPatchExpr = {
      type: "patch",
      raw: "patch(rxn_var1.yield = @rxn_var1.yield)",
      target: {
        kind: "declaration_field",
        declarationId: "rxn_var1",
        field: "yield"
      },
      value: {
        type: "reference",
        refKind: "field",
        raw: "@rxn_var1.yield",
        target: "rxn_var1",
        field: "yield",
        sourceSpan: {
          startLine: 15,
          startColumn: 13
        }
      },
      sourceSpan: {
        startLine: 15,
        startColumn: 5
      }
    };
    const document = resolveChemd({
      ...parsed,
      declarations: parsed.declarations.map((declaration) =>
        declaration.kind === "agent_run"
          ? {
              ...declaration,
              toolCalls: declaration.toolCalls.map((tool) => ({
                ...tool,
                output: patchValue
              }))
            }
          : declaration
      )
    });
    const agentRun = findAgentRun(document, "run_patch");
    const output = agentRun?.kind === "agent_run"
      ? agentRun.toolCalls[0]?.output
      : undefined;

    expect(document.diagnostics).toEqual([]);
    expect(output).toMatchObject({
      type: "patch",
      value: {
        type: "reference",
        resolved: {
          status: "resolved",
          value: expect.objectContaining({ type: "percent", value: 77 })
        }
      }
    });
  });

  it("reports unresolved declaration references as errors", () => {
    const document = resolve(`module exp_bad

meta {
  id: "exp-bad"
  title: "Bad"
  date: "2026-05-28"
  primary_reaction: @missing_rxn
}

result res_bad for @missing_rxn {
  yield: @missing_result.yield
}
`);

    expect(document.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_UNRESOLVED_PROGRAM_REFERENCE",
          severity: "error",
          nodeId: "missing_rxn"
        }),
        expect.objectContaining({
          code: "E_UNRESOLVED_PROGRAM_REFERENCE",
          severity: "error",
          nodeId: "missing_result"
        })
      ])
    );
  });

  it("resolves doc references without creating semantic facts and warns for unresolved tokens", () => {
    const document = resolve(`module exp_docs

meta {
  id: "exp-docs"
  title: "Docs"
  date: "2026-05-28"
}

/// Narrative mentions @rxn_var1.yield and @missing_doc_ref.
reaction rxn_var1 {
  yield: 77%
}
`);
    const doc = document.docs[0];

    expect(doc.references).toMatchObject([
      {
        raw: "@rxn_var1.yield",
        resolution: {
          status: "resolved",
          value: expect.objectContaining({ type: "percent", value: 77 })
        }
      },
      {
        raw: "@missing_doc_ref",
        resolution: {
          status: "unresolved"
        }
      }
    ]);
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_UNRESOLVED_DOC_REFERENCE",
        severity: "warning",
        sourceNodeId: doc.id
      })
    );
    expect(document.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "E_UNRESOLVED_PROGRAM_REFERENCE",
        nodeId: "missing_doc_ref"
      })
    );
  });

  it("ignores unresolved audit-only doc references", () => {
    const parsed = parseChemd(`module exp_audit_docs

meta {
  id: "exp-audit-docs"
  title: "Audit docs"
  date: "2026-05-28"
}

/// Audit note mentions @missing_audit_ref.
reaction rxn_var1 {
  name: "rxn"
}
`);
    const auditDoc = parsed.docs[0];
    const document = resolveChemd({
      ...parsed,
      docs: [
        {
          ...auditDoc,
          exportPolicy: "audit_only"
        }
      ]
    });

    expect(document.docs[0].references[0]?.resolution?.status).toBe("unresolved");
    expect(document.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "W_UNRESOLVED_DOC_REFERENCE" })
    );
  });

  it("reports duplicate declaration ids", () => {
    const document = resolve(`module exp_duplicates

meta {
  id: "exp-duplicates"
  title: "Duplicates"
  date: "2026-05-28"
}

molecule mol_a {
  name: "first"
}

reaction mol_a {
  name: "second"
}
`);

    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_DUPLICATE_DECLARATION",
        severity: "error",
        nodeId: "mol_a"
      })
    );
  });
});
