import { describe, expect, it } from "vitest";

import {
  buildWorkspaceTrainingGraphIndex,
  linkChemdModules
} from "../src/index";

describe("buildWorkspaceTrainingGraphIndex", () => {
  it("extends the training graph with cross-document reaction semantics", () => {
    const linked = linkChemdModules([
      {
        path: "shared.chemd",
        source: `module shared_lib

meta {
  id: "shared-lib"
  title: "Shared library"
  date: "2026-06-04"
}

molecule mol_halide {
  name: "aryl halide"
}

molecule mol_product {
  name: "coupled product"
}

reaction_template tpl_suzuki {
  name: "Suzuki template"
}
`
      },
      {
        path: "seed.chemd",
        source: `module seed_route

import shared_lib as shared from "./shared.chemd"

meta {
  id: "seed-route"
  title: "Seed reaction"
  date: "2026-06-04"
  primary_reaction: @rxn_seed
}

reaction rxn_seed {
  name: "Seed"
  products: [@shared.mol_halide]
}
`
      },
      {
        path: "entry.chemd",
        source: `module entry_route

import shared_lib as shared from "./shared.chemd"
import seed_route as seed from "./seed.chemd"

meta {
  id: "entry-route"
  title: "Entry reaction"
  date: "2026-06-04"
  primary_reaction: @rxn_entry
}

reaction rxn_entry {
  name: "Entry"
  template: @shared.tpl_suzuki
  prev: [@seed.rxn_seed]
  reactants: [@shared.mol_halide]
  products: [@shared.mol_product]
}

condition_screen screen_entry {
  reaction: @rxn_entry
  standard: @seed.rxn_seed
  factor: [temperature]
  outcome: [yield]
}

procedure proc_entry for @rxn_entry {
  abort_if overheated(condition: "sensor.temperature > 130 C")
}

result res_entry for @rxn_entry {
  status: success
  yield: 82%
}
`
      }
    ]);

    const graph = buildWorkspaceTrainingGraphIndex(linked);
    const edgeTypes = graph.edges.map((edge) => edge.edge_type);

    expect(graph.schema_version).toBe("chemd-training-graph-index/v0.1");
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node_id: "template::shared-lib::tpl_suzuki",
        node_type: "reaction_template"
      })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "document_imports_document",
        from_node_id: "doc::entry-route",
        to_node_id: "doc::shared-lib"
      }),
      expect.objectContaining({
        edge_type: "reaction_uses_imported_molecule",
        from_node_id: "rxn::entry-route::rxn_entry",
        to_node_id: "mol::shared-lib::mol_halide"
      }),
      expect.objectContaining({
        edge_type: "reaction_has_previous_reaction",
        from_node_id: "rxn::entry-route::rxn_entry",
        to_node_id: "rxn::seed-route::rxn_seed"
      }),
      expect.objectContaining({
        edge_type: "reaction_precedes_reaction",
        from_node_id: "rxn::seed-route::rxn_seed",
        to_node_id: "rxn::entry-route::rxn_entry"
      }),
      expect.objectContaining({
        edge_type: "reaction_instantiates_template",
        from_node_id: "rxn::entry-route::rxn_entry",
        to_node_id: "template::shared-lib::tpl_suzuki"
      }),
      expect.objectContaining({
        edge_type: "condition_screen_compares_reaction",
        from_node_id: "condition_screen::entry-route::screen_entry",
        to_node_id: "rxn::entry-route::rxn_entry"
      }),
      expect.objectContaining({
        edge_type: "condition_screen_uses_standard",
        from_node_id: "condition_screen::entry-route::screen_entry",
        to_node_id: "rxn::seed-route::rxn_seed"
      }),
      expect.objectContaining({
        edge_type: "control_reads_runtime_signal",
        from_node_id: "control::entry-route::proc_entry::overheated",
        to_node_id: "runtime::entry-route::sensor.temperature"
      })
    ]));
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node_id: "runtime::entry-route::sensor.temperature",
        node_type: "runtime_symbol"
      })
    ]));
    expect(edgeTypes).toContain("result_describes_reaction");
  });

  it("connects procedure steps to shared reagents and preserves agent run nodes", () => {
    const linked = linkChemdModules([
      {
        path: "shared.chemd",
        source: `module shared_reagents

meta {
  id: "shared-reagents"
  title: "Shared reagents"
  date: "2026-06-09"
}

molecule mol_k3po4 {
  name: "potassium phosphate"
}

material cat_pd_pph3 {
  supplier: "demo inventory"
  notes: "Pd(PPh3)4"
}
`
      },
      {
        path: "entry.chemd",
        source: `module entry_route

import shared_reagents as shared from "./shared.chemd"

meta {
  id: "entry-route"
  title: "Entry reaction"
  date: "2026-06-09"
  primary_reaction: @rxn_entry
  primary_result: @res_entry
}

reaction rxn_entry {
  reactants: ["aryl bromide", "boronic acid"]
  products: ["biaryl"]
  reagents: @shared.mol_k3po4
  catalyst: @shared.cat_pd_pph3
}

procedure proc_entry for @rxn_entry {
  step add_base = add(materials: "K3PO4", inputs: [@shared.mol_k3po4])
  step add_catalyst = add(materials: "Pd(PPh3)4", inputs: [@shared.cat_pd_pph3], depends_on: [add_base])
}

result res_entry for @rxn_entry {
  status: success
}

agent run audit_entry {
  goal: "verify graph links"
  status: completed
  evidence: [@rxn_entry, @res_entry]
}
`
      }
    ]);

    const graph = buildWorkspaceTrainingGraphIndex(linked);

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node_id: "agent::entry-route::audit_entry",
        node_type: "agent_run"
      })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "procedure_step_uses_molecule",
        from_node_id: "step::entry-route::proc_entry::add_base",
        to_node_id: "mol::shared-reagents::mol_k3po4"
      }),
      expect.objectContaining({
        edge_type: "procedure_step_uses_material",
        from_node_id: "step::entry-route::proc_entry::add_catalyst",
        to_node_id: "mat::shared-reagents::cat_pd_pph3"
      }),
      expect.objectContaining({
        edge_type: "reaction_uses_imported_molecule",
        from_node_id: "rxn::entry-route::rxn_entry",
        to_node_id: "mol::shared-reagents::mol_k3po4"
      }),
      expect.objectContaining({
        edge_type: "reaction_uses_imported_material",
        from_node_id: "rxn::entry-route::rxn_entry",
        to_node_id: "mat::shared-reagents::cat_pd_pph3"
      }),
      expect.objectContaining({
        edge_type: "agent_run_references_declaration",
        from_node_id: "agent::entry-route::audit_entry",
        to_node_id: "rxn::entry-route::rxn_entry"
      })
    ]));
  });

  it("does not infer reaction similarity from unknown family alone", () => {
    const linked = linkChemdModules([
      {
        path: "first.chemd",
        source: `module first_route

meta {
  id: "first-route"
  title: "First route"
  date: "2026-06-09"
}

reaction rxn_first {
  reactants: ["substrate a"]
  products: ["product a"]
}
`
      },
      {
        path: "second.chemd",
        source: `module second_route

meta {
  id: "second-route"
  title: "Second route"
  date: "2026-06-09"
}

reaction rxn_second {
  reactants: ["substrate b"]
  products: ["product b"]
}
`
      }
    ]);

    const graph = buildWorkspaceTrainingGraphIndex(linked);

    expect(graph.reaction_similarity_edges).toEqual([]);
    expect(graph.reaction_clusters).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        basis: "reaction_family",
        key: "unknown"
      })
    ]));
  });

  it("adds directed runtime trace and state-stack edges to the workspace graph", () => {
    const linked = linkChemdModules([{
      path: "runtime.chemd",
      source: `module runtime_route

meta {
  id: "runtime-route"
  title: "Runtime route"
  date: "2026-06-04"
  primary_reaction: @rxn_runtime
}

reaction rxn_runtime {
  name: "Runtime reaction"
}

procedure proc_runtime for @rxn_runtime {
  step charge = add(material: "aryl halide")
  step heat = heat(temp: 90 C, duration: 2 h, depends_on: [charge])
  abort_if overheated(condition: "sensor.temperature > 130 C")
}
`
    }]);

    const graph = buildWorkspaceTrainingGraphIndex(linked, {
      runtimeTraces: [{
        runId: "run-1",
        stepIds: ["charge", "heat"],
        events: [
          {
            eventId: "e1",
            runId: "run-1",
            timestamp: "2026-06-04T10:00:00.000Z",
            type: "run_started"
          },
          {
            eventId: "e2",
            runId: "run-1",
            timestamp: "2026-06-04T10:01:00.000Z",
            type: "step_started",
            stepId: "charge"
          },
          {
            eventId: "e3",
            runId: "run-1",
            timestamp: "2026-06-04T10:02:00.000Z",
            type: "step_completed",
            stepId: "charge"
          },
          {
            eventId: "e4",
            runId: "run-1",
            timestamp: "2026-06-04T10:03:00.000Z",
            type: "control_entered",
            controlId: "overheated"
          }
        ]
      }]
    });

    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node_id: "trace_event::run-1::e2",
        node_type: "runtime_trace_event"
      }),
      expect.objectContaining({
        node_id: "runtime_state::run-1::e2",
        node_type: "runtime_state_snapshot"
      })
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "trace_event_precedes_event",
        from_node_id: "trace_event::run-1::e2",
        to_node_id: "trace_event::run-1::e3"
      }),
      expect.objectContaining({
        edge_type: "runtime_state_precedes_state",
        from_node_id: "runtime_state::run-1::e2",
        to_node_id: "runtime_state::run-1::e3"
      }),
      expect.objectContaining({
        edge_type: "trace_event_targets_step",
        from_node_id: "trace_event::run-1::e2",
        to_node_id: "step::runtime-route::proc_runtime::charge"
      }),
      expect.objectContaining({
        edge_type: "trace_event_targets_control",
        from_node_id: "trace_event::run-1::e4",
        to_node_id: "control::runtime-route::proc_runtime::overheated"
      })
    ]));
  });

  it("uses scoped runtime trace targets when step ids repeat across documents", () => {
    const linked = linkChemdModules([
      {
        path: "first.chemd",
        source: `module first_runtime

meta {
  id: "first-runtime"
  title: "First runtime"
  date: "2026-06-04"
}

reaction rxn_first {}

procedure proc_first for @rxn_first {
  step charge = add(material: "first")
}
`
      },
      {
        path: "second.chemd",
        source: `module second_runtime

meta {
  id: "second-runtime"
  title: "Second runtime"
  date: "2026-06-04"
}

reaction rxn_second {}

procedure proc_second for @rxn_second {
  step charge = add(material: "second")
}
`
      }
    ]);

    const graph = buildWorkspaceTrainingGraphIndex(linked, {
      runtimeTraces: [{
        runId: "run-scoped",
        events: [{
          documentId: "second-runtime",
          eventId: "evt-scoped",
          runId: "run-scoped",
          stepId: "charge",
          timestamp: "2026-06-04T11:00:00.000Z",
          type: "step_started"
        }]
      }]
    });

    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "trace_event_targets_step",
        from_node_id: "trace_event::run-scoped::evt-scoped",
        to_node_id: "step::second-runtime::proc_second::charge"
      })
    ]));
    expect(graph.edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "trace_event_targets_step",
        from_node_id: "trace_event::run-scoped::evt-scoped",
        to_node_id: "step::first-runtime::proc_first::charge"
      })
    ]));
  });
});
