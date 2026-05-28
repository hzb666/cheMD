import { describe, expect, it, vi } from "vitest";

import { exportNormalizedJson } from "../src/server/chem/json-export";

const createPubChemResponse = (smiles: string): Response =>
  new Response(
    JSON.stringify({
      PropertyTable: {
        Properties: [{ SMILES: smiles }]
      }
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

describe("exportNormalizedJson", () => {
  it("resolves CAS values to smiles in JSON output without splitting multi-fragment salts", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes("/64-17-5/")) {
        return createPubChemResponse("CCO");
      }

      if (url.includes("/584-08-7/")) {
        return createPubChemResponse("O=C([O-])[O-].[K+].[K+]");
      }

      throw new Error(`Unexpected PubChem lookup: ${url}`);
    });

    const json = await exportNormalizedJson(
      `module exp_json_normalized

meta {
  id: "exp-json-normalized"
  title: "JSON Export Normalization"
  date: "2026-04-09"
}

molecule mol_main {
  cas: "64-17-5"
}

reaction rxn_main {
  reactants: ["64-17-5", "584-08-7"]
  products: ["CC(=O)O"]
}`,
      { fetchImpl }
    );

    const payload = JSON.parse(json) as {
      diagnostics?: Array<{ code: string }>;
      program: {
        declarations: {
          mol_main?: {
            fields: Record<string, { text?: string; value?: string; items?: Array<{ text?: string; value?: string; raw?: string }> }>;
          };
          rxn_main?: {
            fields: Record<string, { text?: string; items?: Array<{ text?: string; value?: string; raw?: string }> }>;
          };
        };
      };
      semantic: {
        typedGraph: {
          nodes: Array<{
            kind: string;
            nodeId: string;
            reactants?: Array<{ kind: string; raw: string }>;
          }>;
        };
      };
    };
    const reactionNode = payload.semantic.typedGraph.nodes.find(
      (node) => node.kind === "reaction" && node.nodeId === "rxn_main"
    );

    expect(payload.program.declarations.mol_main?.fields.smiles?.text).toBe("CCO");
    expect((payload.diagnostics ?? []).map((diagnostic) => diagnostic.code)).not.toContain(
      "W_CHEMD_KIND_AMBIGUOUS"
    );
    expect(payload.program.declarations.rxn_main?.fields.reactants?.items?.map((item) =>
      item.text ?? item.value ?? item.raw
    )).toEqual([
      "CCO",
      "O=C([O-])[O-].[K+].[K+]"
    ]);
    expect(payload.program.declarations.rxn_main?.fields.products?.items?.map((item) =>
      item.text ?? item.value ?? item.raw
    )).toEqual([
      "CC(=O)O"
    ]);
    expect(reactionNode?.reactants).toEqual([
      expect.objectContaining({ kind: "literal", raw: "CCO" }),
      expect.objectContaining({ kind: "literal", raw: "O=C([O-])[O-].[K+].[K+]" })
    ]);
    expect(payload.program.declarations.rxn_main?.fields).not.toHaveProperty("normalized_conditions");
  });

  it("serializes declarations without legacy layout wrappers", async () => {
    const json = await exportNormalizedJson(
      `module exp_json_declarations

meta {
  id: "exp-json-declarations"
  title: "JSON Declaration Serialization"
  date: "2026-04-11"
}

analysis ana_tlc {
  type: tlc
  data: "lane summary"
  p1: "sm 0.60 ^5(4)"
}

result res_main {
  yield: 63%
}`
    );

    const payload = JSON.parse(json) as {
      program: {
        declarations: Record<string, { kind?: string; fields?: Record<string, unknown> }>;
      };
    };

    expect(Object.keys(payload.program.declarations)).toEqual(["ana_tlc", "res_main"]);
    expect(payload.program).not.toHaveProperty("layout");
    expect(payload.program.declarations.ana_tlc).toMatchObject({
      kind: "analysis"
    });
    expect(payload.program.declarations.res_main).toMatchObject({
      kind: "result"
    });
    expect(json).not.toContain('"columns"');
  });
});

describe("POST /api/export/json", () => {
  it("rejects non-json request content types", async () => {
    const { POST } = await import("../src/app/api/export/json/route");
    const response = await POST(new Request("http://localhost/api/export/json", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: "source"
    }));

    expect(response.status).toBe(415);
  });

  it("rejects oversized json export request bodies before parsing", async () => {
    const { POST } = await import("../src/app/api/export/json/route");
    const response = await POST(new Request("http://localhost/api/export/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(300 * 1024)
      },
      body: "{}"
    }));

    expect(response.status).toBe(413);
  });
});

describe("exportNormalizedJson semantic output", () => {
  it("keeps analysis render fields and doc comments separate from semantic graph output", async () => {
    const json = await exportNormalizedJson(
      `module exp_json_tlc_markdown

/*md
Yield: @res_main.yield
*/
meta {
  id: "exp-json-tlc-markdown"
  title: "JSON TLC Markdown"
  date: "2026-04-11"
}

result res_main {
  yield: 63%
}

analysis ana_tlc {
  type: tlc
  p1: "sm 0.60 ^5(4)"
}`
    );

    const payload = JSON.parse(json) as {
      program: {
        declarations: Record<string, Record<string, unknown>>;
        documentation: Record<string, {
          markdown: string;
          references?: string[];
        }>;
      };
      semantic: {
        typedGraph: {
          nodes: Array<{
            kind: string;
            nodeId: string;
            normalizedTlc?: null | {
              lanes: Record<string, { lane_id: string; lane_role: string }>;
            };
          }>;
        };
      };
    };
    const analysisNode = payload.semantic.typedGraph.nodes.find(
      (node) => node.kind === "analysis"
    );

    expect(payload.program.declarations.ana_tlc).toMatchObject({
      kind: "analysis"
    });
    expect(payload.program.declarations.ana_tlc).not.toHaveProperty("normalized_tlc");
    expect(analysisNode).toMatchObject({ nodeId: "ana_tlc" });
    expect(analysisNode?.normalizedTlc).toBeNull();
    const doc = Object.values(payload.program.documentation)[0];
    expect(doc.markdown).toContain("@res_main.yield");
    expect(doc.references).toEqual(["@res_main.yield"]);
    expect(doc).not.toHaveProperty("start");
    expect(doc).not.toHaveProperty("startLine");
  });
});
