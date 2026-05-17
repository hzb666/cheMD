import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
  buildTrainingGraphIndexFromUnderstandings,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument
} from "../src/index";

const buildUnderstanding = (source: string) => {
  const document = resolveChemd(parseChemd(source));
  const checked = typecheckDocument(document);
  const record = exportTrainingRecordFromDocument(document, {
    typedGraph: checked.typedGraph,
    stepGraph: checked.stepGraph,
    exportedAt: "2026-04-26T00:00:00.000Z"
  });

  return buildTrainingUnderstandingFromRecord(record);
};

const routeSource = `---
id: exp-graph-route
title: Route Graph
date: 2026-04-26
---

:::chemd #rxn-step-1
kind: reaction
route: route-a
reactants: substrate-1
products: intermediate-1
:::

:::chemd #rxn-step-2
kind: reaction
route: route-a
prev: rxn-step-1
reactants: intermediate-1
products: product-1
:::
`;

const familySourceA = `---
id: exp-graph-family-a
title: Esterification A
date: 2026-04-21
---

:::chemd #rxn-a
kind: reaction
name: esterification of acid A
reactants: acid-a | alcohol
products: ester-a
reagents: catalytic H2SO4
:::

:::procedure #proc-a
step: add | materials=acid-a
step: add | materials=alcohol
step: hold | duration=12 h
step: concentrate
:::
`;

const familySourceB = `---
id: exp-graph-family-b
title: Esterification B
date: 2026-04-23
---

:::chemd #rxn-b
kind: reaction
name: esterification of acid B
reactants: acid-b | alcohol
products: ester-b
reagents: catalytic H2SO4
:::

:::procedure #proc-b
step: add | materials=acid-b
step: add | materials=alcohol
step: hold | duration=12 h
step: concentrate
:::
`;

describe("training graph index projection", () => {
  it("indexes route, semantic clusters, and inferred reaction similarities", () => {
    const route = buildUnderstanding(routeSource);
    const familyA = buildUnderstanding(familySourceA);
    const familyB = buildUnderstanding(familySourceB);
    const index = buildTrainingGraphIndexFromUnderstandings([route, familyA, familyB], {
      document_sources: [
        { document_id: "exp-graph-route", file_path: "route.chemd" },
        { document_id: "exp-graph-family-a", file_path: "family-a.chemd" },
        { document_id: "exp-graph-family-b", file_path: "family-b.chemd" }
      ]
    });

    const routeCluster = index.reaction_clusters.find((cluster) =>
      cluster.basis === "route" && cluster.key === "route-a"
    );
    const campaignCluster = index.reaction_clusters.find((cluster) =>
      cluster.basis === "campaign_trajectory" && cluster.trajectory_kind === "substrate_expansion"
    );
    const familySimilarity = index.reaction_similarity_edges.find((edge) =>
      edge.from_reaction_entity_id === "rxn::exp-graph-family-a::rxn-a"
      && edge.to_reaction_entity_id === "rxn::exp-graph-family-b::rxn-b"
    );

    expect(index.schema_version).toBe("chemd-training-graph-index/v0.1");
    expect(index.index_scope.sources).toContainEqual({
      document_id: "exp-graph-route",
      file_path: "route.chemd"
    });
    expect(routeCluster).toMatchObject({
      member_reaction_entity_ids: [
        "rxn::exp-graph-route::rxn-step-1",
        "rxn::exp-graph-route::rxn-step-2"
      ],
      confidence: "medium"
    });
    expect(campaignCluster).toMatchObject({
      reaction_family: "esterification",
      procedure_signature: "add>add>hold>concentrate"
    });
    expect(familySimilarity).toMatchObject({
      basis: expect.arrayContaining(["same_family_procedure"]),
      score: 0.85,
      warnings: ["semantic_similarity_without_computed_fingerprint"]
    });
    expect(index.reaction_features).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reaction_entity_id: "rxn::exp-graph-family-a::rxn-a",
        fingerprint_status: "not_available"
      })
    ]));
    expect(index.warnings).toContain("computed_reaction_fingerprints_not_available");
  });
});
