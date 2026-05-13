#![cfg_attr(test, allow(dead_code))]

use crate::postgres_runtime_core::upsert_runtime_core_records;
use crate::postgres_runtime_graph_cleanup::{delete_missing_edges, delete_missing_nodes};
use crate::postgres_runtime_persist::{json_param, optional_json_param};
use crate::postgres_runtime_types::{
    PersistRuntimeGraphRagInput, RuntimeAgentRunRecord, RuntimeAgentToolCallRecord,
    RuntimeGraphEdgeRecord, RuntimeGraphNodeRecord, RuntimeGraphSnapshotRecord,
    RuntimePatchProposalRecord, RuntimeRagChunkCitationRecord,
};
use postgres::{Client, Error, Transaction};

pub(crate) fn persist_runtime_graph_rag_records(
    client: &mut Client,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), Error> {
    let mut tx = client.transaction()?;
    if let Err(error) = execute_records(&mut tx, records) {
        let _ = tx.rollback();
        return Err(error);
    }
    tx.commit()
}

fn execute_records(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), Error> {
    upsert_runtime_core_records(tx, records)?;
    upsert_snapshot(tx, &records.graph_snapshot)?;
    delete_missing_edges(tx, records)?;
    delete_missing_nodes(tx, records)?;
    for node in &records.nodes {
        upsert_node(tx, node)?;
    }
    for edge in &records.edges {
        upsert_edge(tx, edge)?;
    }
    for citation in &records.citation_candidates {
        upsert_citation(tx, citation)?;
    }
    for run in &records.agent_runs {
        upsert_agent_run(tx, run)?;
    }
    for call in &records.agent_tool_calls {
        upsert_tool_call(tx, call)?;
    }
    for proposal in &records.patch_proposals {
        upsert_patch_proposal(tx, proposal)?;
    }
    Ok(())
}

fn upsert_snapshot(
    tx: &mut Transaction<'_>,
    record: &RuntimeGraphSnapshotRecord,
) -> Result<u64, Error> {
    let source_revision_ids =
        serde_json::to_string(&record.source_revision_ids).expect("Vec<String> should serialize");
    tx.execute(
        "INSERT INTO chemd_reaction_graph_snapshots (
           graph_snapshot_id, experiment_id, source_revision_ids, graph_kind,
           node_count, edge_count, created_at
         ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::timestamptz)
         ON CONFLICT (graph_snapshot_id) DO UPDATE SET
           experiment_id = EXCLUDED.experiment_id,
           source_revision_ids = EXCLUDED.source_revision_ids,
           graph_kind = EXCLUDED.graph_kind,
           node_count = EXCLUDED.node_count,
           edge_count = EXCLUDED.edge_count,
           created_at = EXCLUDED.created_at",
        &[
            &record.graph_snapshot_id,
            &record.experiment_id,
            &source_revision_ids,
            &record.graph_kind,
            &record.node_count,
            &record.edge_count,
            &record.created_at,
        ],
    )
}

fn upsert_node(tx: &mut Transaction<'_>, record: &RuntimeGraphNodeRecord) -> Result<u64, Error> {
    let source_range = json_param(&record.source_range);
    let payload = json_param(&record.payload);
    tx.execute(
        "INSERT INTO chemd_reaction_graph_nodes (
           node_id, graph_snapshot_id, experiment_id, revision_id, entity_id,
           block_id, reaction_family, route_id, source_range, payload, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::timestamptz)
         ON CONFLICT (node_id) DO UPDATE SET
           graph_snapshot_id = EXCLUDED.graph_snapshot_id,
           experiment_id = EXCLUDED.experiment_id,
           revision_id = EXCLUDED.revision_id,
           entity_id = EXCLUDED.entity_id,
           block_id = EXCLUDED.block_id,
           reaction_family = EXCLUDED.reaction_family,
           route_id = EXCLUDED.route_id,
           source_range = EXCLUDED.source_range,
           payload = EXCLUDED.payload,
           created_at = EXCLUDED.created_at",
        &[
            &record.node_id,
            &record.graph_snapshot_id,
            &record.experiment_id,
            &record.revision_id,
            &record.entity_id,
            &record.block_id,
            &record.reaction_family,
            &record.route_id,
            &source_range,
            &payload,
            &record.created_at,
        ],
    )
}

fn upsert_edge(tx: &mut Transaction<'_>, record: &RuntimeGraphEdgeRecord) -> Result<u64, Error> {
    let evidence = json_param(&record.evidence);
    tx.execute(
        "INSERT INTO chemd_reaction_graph_edges (
           edge_id, graph_snapshot_id, experiment_id, from_node_id, to_node_id,
           edge_type, confidence, evidence, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
         ON CONFLICT (edge_id) DO UPDATE SET
           graph_snapshot_id = EXCLUDED.graph_snapshot_id,
           experiment_id = EXCLUDED.experiment_id,
           from_node_id = EXCLUDED.from_node_id,
           to_node_id = EXCLUDED.to_node_id,
           edge_type = EXCLUDED.edge_type,
           confidence = EXCLUDED.confidence,
           evidence = EXCLUDED.evidence,
           created_at = EXCLUDED.created_at",
        &[
            &record.edge_id,
            &record.graph_snapshot_id,
            &record.experiment_id,
            &record.from_node_id,
            &record.to_node_id,
            &record.edge_type,
            &record.confidence,
            &evidence,
            &record.created_at,
        ],
    )
}

fn upsert_citation(
    tx: &mut Transaction<'_>,
    record: &RuntimeRagChunkCitationRecord,
) -> Result<u64, Error> {
    let source_range = json_param(&record.source_range);
    let citation = json_param(&record.citation);
    let quality = json_param(&record.quality);
    tx.execute(
        "INSERT INTO chemd_rag_chunk_citations (
           revision_id, chunk_id, experiment_id, entity_id, block_id,
           source_range, citation, quality, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::timestamptz)
         ON CONFLICT (revision_id, chunk_id) DO UPDATE SET
           experiment_id = EXCLUDED.experiment_id,
           entity_id = EXCLUDED.entity_id,
           block_id = EXCLUDED.block_id,
           source_range = EXCLUDED.source_range,
           citation = EXCLUDED.citation,
           quality = EXCLUDED.quality,
           created_at = EXCLUDED.created_at",
        &[
            &record.revision_id,
            &record.chunk_id,
            &record.experiment_id,
            &record.entity_id,
            &record.block_id,
            &source_range,
            &citation,
            &quality,
            &record.created_at,
        ],
    )
}

fn upsert_agent_run(
    tx: &mut Transaction<'_>,
    record: &RuntimeAgentRunRecord,
) -> Result<u64, Error> {
    tx.execute(
        "INSERT INTO chemd_agent_runs (
           agent_run_id, experiment_id, revision_id, status, goal, started_at,
           finished_at
         ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)
         ON CONFLICT (agent_run_id) DO UPDATE SET
           experiment_id = EXCLUDED.experiment_id,
           revision_id = EXCLUDED.revision_id,
           status = EXCLUDED.status,
           goal = EXCLUDED.goal,
           started_at = EXCLUDED.started_at,
           finished_at = EXCLUDED.finished_at",
        &[
            &record.agent_run_id,
            &record.experiment_id,
            &record.revision_id,
            &record.status,
            &record.goal,
            &record.started_at,
            &record.finished_at,
        ],
    )
}

fn upsert_tool_call(
    tx: &mut Transaction<'_>,
    record: &RuntimeAgentToolCallRecord,
) -> Result<u64, Error> {
    let input = json_param(&record.input);
    let output = optional_json_param(&record.output);
    tx.execute(
        "INSERT INTO chemd_agent_tool_calls (
           tool_call_id, agent_run_id, tool_name, input, output, status, created_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::timestamptz)
         ON CONFLICT (tool_call_id) DO UPDATE SET
           agent_run_id = EXCLUDED.agent_run_id,
           tool_name = EXCLUDED.tool_name,
           input = EXCLUDED.input,
           output = EXCLUDED.output,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at",
        &[
            &record.tool_call_id,
            &record.agent_run_id,
            &record.tool_name,
            &input,
            &output,
            &record.status,
            &record.created_at,
        ],
    )
}

fn upsert_patch_proposal(
    tx: &mut Transaction<'_>,
    record: &RuntimePatchProposalRecord,
) -> Result<u64, Error> {
    let patch = json_param(&record.patch);
    let validation_result = optional_json_param(&record.validation_result);
    tx.execute(
        "INSERT INTO chemd_patch_proposals (
           patch_proposal_id, agent_run_id, experiment_id, base_revision_id, patch,
           status, validation_result, created_at, applied_at
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::timestamptz, $9::timestamptz)
         ON CONFLICT (patch_proposal_id) DO UPDATE SET
           agent_run_id = EXCLUDED.agent_run_id,
           experiment_id = EXCLUDED.experiment_id,
           base_revision_id = EXCLUDED.base_revision_id,
           patch = EXCLUDED.patch,
           status = EXCLUDED.status,
           validation_result = EXCLUDED.validation_result,
           created_at = EXCLUDED.created_at,
           applied_at = EXCLUDED.applied_at",
        &[
            &record.patch_proposal_id,
            &record.agent_run_id,
            &record.experiment_id,
            &record.base_revision_id,
            &patch,
            &record.status,
            &validation_result,
            &record.created_at,
            &record.applied_at,
        ],
    )
}
