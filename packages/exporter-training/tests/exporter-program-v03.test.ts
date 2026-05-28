import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "@chemd/parser";
import { typecheckProgram } from "@chemd/typechecker";

import {
  buildRagExportFromTrainingRecord,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument
} from "../src/index";

const programSource = `module exp_training_v03

/// Module narrative for RAG only.
meta {
  id: "exp-training-v03"
  title: "Training v0.3"
  date: "2026-05-29"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

molecule mol_start {
  name: "aryl bromide"
  role: substrate
}

molecule mol_product {
  name: "biaryl"
  role: product
}

material mat_start {
  molecule: @mol_start
  supplier: "Aldrich"
}

batch bat_start {
  molecule: @mol_start
  mass: 20 mg
}

/// Selected program reaction.
reaction rxn_main {
  reactants: [@mol_start]
  products: [@mol_product]
  solvent: "MeCN"
  temperature: 40 C
}

result res_main for @rxn_main {
  product: @mol_product
  status: success
  yield: 78%
}

sample sam_main {
  name: "isolated product"
  derived_from: @rxn_main
  purity: 95%
}

artifact art_nmr {
  kind: nmr_spectrum
  ref: @res_main
  path: "data/nmr.pdf"
}

analysis ana_main for @res_main {
  type: nmr
  artifact: [@art_nmr]
  notes: "clean spectrum"
}

condition_screen screen_main for @rxn_main {
  standard: @rxn_main
  factor: [solvent, temperature]
  outcome: [yield]
  notes: "screened declaration facts"
}

procedure proc_main for @rxn_main {
  evidence: [@res_main]
  step charge = charge(inputs: [@mol_start], outputs: [@mol_product])
  step heat = heat(duration: 2 h, depends_on: [charge])
}

trace trace_main for @proc_main {
  mode: observed
}

agent run repair_001 {
  goal: "validate selected result"
  status: completed
  target_files: ["screen.chemd"]
  evidence: [@rxn_main, @res_main]

  tool compile_current_file {
    status: ok
  }

  patch proposed {
    title: "bind result"
    edit meta.primary_result = @res_main
  }

  decision approved {
    patch: "proposed"
    rationale: "selected result is explicit"
  }

  timeline completed {
    at: "2026-05-29T00:00:00Z"
    actor: "codex"
    summary: "validated"
    tool: "compile_current_file"
    patch: "proposed"
    evidence: [@res_main]
  }
}
`;

describe("program training export v0.3", () => {
  it("exports program-native source, declaration facts, docs, agent audit, and tagged RAG chunks", () => {
    const program = parseChemdProgram(programSource);
    const checked = typecheckProgram(program);
    const record = exportTrainingRecordFromDocument(program, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      exportedAt: "2026-05-29T00:00:00.000Z"
    });
    const rag = buildRagExportFromTrainingRecord(record);
    const understanding = buildTrainingUnderstandingFromRecord(record);

    expect(checked.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(record.schema_version).toBe("chemd-training-export/v0.3");
    expect(record.source_layer).not.toHaveProperty("raw_children");
    expect(record.source_layer.program).toMatchObject({
      schema_version: "chemd-program-ast/v1",
      source_language: "chemd/program-v1"
    });
    expect(record.source_layer.module.name).toBe("exp_training_v03");
    expect(record.source_layer.declarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ declaration_kind: "reaction", declaration_id: "rxn_main" }),
      expect.objectContaining({ declaration_kind: "agent_run", declaration_id: "repair_001" })
    ]));
    expect(record.source_layer.doc_comments[0]).toMatchObject({
      attachment_kind: "file",
      raw_markdown: "Module narrative for RAG only."
    });

    expect(record.semantic_layer).not.toHaveProperty("markdown_blocks");
    expect(record.semantic_layer.molecules).toHaveLength(2);
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      original_id: "rxn_main",
      reactants: [expect.objectContaining({ target_original_id: "mol_start" })]
    });
    expect(record.semantic_layer.results[0]).toMatchObject({
      original_id: "res_main",
      reaction_ref_raw: "@rxn_main",
      status_label: "success"
    });
    expect(record.semantic_layer.condition_screens[0]).toMatchObject({
      original_id: "screen_main",
      reaction_ref_raw: "@rxn_main",
      factors: ["solvent", "temperature"]
    });
    expect(record.semantic_layer.procedures[0]).toMatchObject({
      original_id: "proc_main",
      target_ref_raw: "@rxn_main",
      steps: [
        expect.objectContaining({ step_id: "charge", family: "charge" }),
        expect.objectContaining({ step_id: "heat", family: "heat" })
      ]
    });
    expect(record.semantic_layer.agent_runs[0]).toMatchObject({
      original_id: "repair_001",
      status: "completed",
      tool_calls: [expect.objectContaining({ name: "compile_current_file", status: "ok" })],
      audit_timeline: [expect.objectContaining({ event: "completed" })]
    });
    expect(record.semantic_layer.documentation_blocks[0]).toMatchObject({
      attachment_kind: "file",
      fact_status: "narrative_only"
    });
    expect(record.semantic_layer.links.map((link) => link.relation_type)).toEqual(expect.arrayContaining([
      "reaction_uses_molecule",
      "reaction_produces_molecule",
      "result_describes_reaction",
      "condition_screen_targets_reaction",
      "procedure_targets_reaction",
      "agent_run_references_declaration"
    ]));

    expect(record.learning_layer.retrieval_chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        chunk_type: "reaction_summary",
        chunk_kind: "semantic_fact",
        truth_source: "declaration"
      }),
      expect.objectContaining({
        chunk_type: "documentation",
        chunk_kind: "narrative_doc",
        truth_source: "doc_comment"
      }),
      expect.objectContaining({
        chunk_type: "agent_audit",
        chunk_kind: "agent_audit",
        truth_source: "agent_run"
      }),
      expect.objectContaining({
        chunk_type: "runtime_trace",
        chunk_kind: "runtime_trace",
        truth_source: "trace"
      })
    ]));
    expect(rag.chunks.every((chunk) => "chunk_kind" in chunk && "truth_source" in chunk)).toBe(true);
    expect(understanding.entities.narrative_blocks[0]).toMatchObject({
      entity_id: expect.stringMatching(/^doc_/)
    });
  });
});
