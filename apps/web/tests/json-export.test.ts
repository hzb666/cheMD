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
      `---
id: exp-json-normalized
title: JSON Export Normalization
date: 2026-04-09
---

:::chemd #mol-main
cas: 64-17-5
:::

:::chemd #rxn-main
reac: 64-17-5
reac: 584-08-7
prod: CC(=O)O
:::`,
      { fetchImpl }
    );

    const payload = JSON.parse(json) as {
      diagnostics?: Record<string, { code: string }>;
      document: {
        body: {
          "01_molecule": {
            smiles?: string;
          };
          "02_reaction": {
            reactants?: Record<string, string>;
            products?: Record<string, string>;
            normalized_conditions?: {
              reagents?: {
                normalized?: Record<string, string>;
              };
            };
          };
        };
      };
      semantic: {
        typedGraph: {
          nodes: Record<string, {
            kind: string;
            nodeId: string;
            reactants?: Record<string, { kind: string; raw: string }>;
          }>;
        };
      };
    };
    const reactionNode = Object.values(payload.semantic.typedGraph.nodes).find(
      (node) => node.kind === "reaction" && node.nodeId === "rxn-main"
    );

    expect(payload.document.body["01_molecule"]?.smiles).toBe("CCO");
    expect(Object.values(payload.diagnostics ?? {}).map((diagnostic) => diagnostic.code)).not.toContain(
      "W_CHEMD_KIND_AMBIGUOUS"
    );
    expect(payload.document.body["02_reaction"]?.reactants).toEqual({
      "01_reactant": "CCO",
      "02_reactant": "O=C([O-])[O-].[K+].[K+]"
    });
    expect(payload.document.body["02_reaction"]?.products).toEqual({
      "01_product": "CC(=O)O"
    });
    expect(reactionNode?.reactants).toMatchObject({
      "01_reactant": { kind: "literal", raw: "CCO" },
      "02_reactant": { kind: "literal", raw: "O=C([O-])[O-].[K+].[K+]" }
    });
    expect(payload.document.body["02_reaction"]).not.toHaveProperty("normalized_conditions.conditions_text");
  });

  it("omits col layout wrappers from normalized json output", async () => {
    const json = await exportNormalizedJson(
      `---
id: exp-json-col
title: JSON Col Flatten
date: 2026-04-11
---

:::col-2
col: {
:::analysis #ana-tlc
type: tlc
data: lane summary
p1: sm 0.60 ^5(4)
:::
}
col: {
:::result #res-main
yield: 63%
:::
}
:::`
    );

    const payload = JSON.parse(json) as {
      document: {
        layout?: {
          col_strategy?: string;
        };
        body: Record<string, { id?: string }>;
      };
    };

    expect(Object.keys(payload.document.body)).toEqual(["01_analysis", "02_result"]);
    expect(payload.document.layout?.col_strategy).toBe("flatten_children");
    expect(payload.document.body["01_analysis"]).toMatchObject({
      id: "ana-tlc"
    });
    expect(payload.document.body["02_result"]).toMatchObject({
      id: "res-main"
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
  it("adds normalized tlc fields and omits markdown token locations from normalized json output", async () => {
    const json = await exportNormalizedJson(
      `---
id: exp-json-tlc-markdown
title: JSON TLC Markdown
date: 2026-04-11
---

:::result #res-main
yield: 63%
:::

:::analysis
type: tlc
p1: sm 0.60 ^5(4)
:::

Yield: @res-main.yield`
    );

    const payload = JSON.parse(json) as {
      document: {
        body: {
          "01_result": {
            id?: string;
          };
          "02_analysis": {
            id?: string;
          };
          "03_markdown": {
            references: Record<string, Record<string, unknown>>;
          };
        };
      };
      semantic: {
        typedGraph: {
          nodes: Record<string, {
            kind: string;
            nodeId: string;
            normalizedTlc?: {
              lanes: Record<string, { lane_id: string; lane_role: string }>;
            };
          }>;
        };
      };
    };
    const analysisNode = Object.values(payload.semantic.typedGraph.nodes).find(
      (node) => node.kind === "analysis"
    );

    expect(payload.document.body["02_analysis"]).toMatchObject({
      id: "exp-json-tlc-markdown-analysis-1"
    });
    expect(payload.document.body["02_analysis"]).not.toHaveProperty("normalized_tlc");
    expect(analysisNode).toMatchObject({
      nodeId: "exp-json-tlc-markdown-analysis-1",
      normalizedTlc: {
        lanes: {
          "01_lane": { lane_id: "p1", lane_role: "starting_material" }
        }
      }
    });
    expect(payload.document.body["03_markdown"]?.references["01_reference"]).toMatchObject({
      type: "reference",
      raw: "@res-main.yield",
      source: "res-main",
      field: "yield",
      resolution: {
        status: "resolved",
        value: "63%"
      }
    });
    expect(payload.document.body["03_markdown"]?.references["01_reference"]).not.toHaveProperty("start");
    expect(payload.document.body["03_markdown"]?.references["01_reference"]).not.toHaveProperty("startLine");
  });
});
