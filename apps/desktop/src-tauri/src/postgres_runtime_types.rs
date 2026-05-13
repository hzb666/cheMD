#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistRuntimeGraphRagInput {
    pub(crate) graph_snapshot: RuntimeGraphSnapshotRecord,
    #[serde(default)]
    pub(crate) nodes: Vec<RuntimeGraphNodeRecord>,
    #[serde(default)]
    pub(crate) edges: Vec<RuntimeGraphEdgeRecord>,
    #[serde(default)]
    pub(crate) citation_candidates: Vec<RuntimeRagChunkCitationRecord>,
    #[serde(default)]
    pub(crate) agent_runs: Vec<RuntimeAgentRunRecord>,
    #[serde(default)]
    pub(crate) agent_tool_calls: Vec<RuntimeAgentToolCallRecord>,
    #[serde(default)]
    pub(crate) patch_proposals: Vec<RuntimePatchProposalRecord>,
    pub(crate) metadata: Option<Value>,
    pub(crate) created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGraphSnapshotRecord {
    pub(crate) graph_snapshot_id: String,
    pub(crate) experiment_id: String,
    pub(crate) source_revision_ids: Vec<String>,
    pub(crate) graph_kind: String,
    pub(crate) node_count: i32,
    pub(crate) edge_count: i32,
    pub(crate) created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGraphNodeRecord {
    pub(crate) node_id: String,
    pub(crate) graph_snapshot_id: String,
    pub(crate) experiment_id: String,
    pub(crate) revision_id: String,
    pub(crate) entity_id: String,
    pub(crate) block_id: Option<String>,
    pub(crate) reaction_family: Option<String>,
    pub(crate) route_id: Option<String>,
    pub(crate) source_range: Value,
    pub(crate) payload: Value,
    pub(crate) created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeGraphEdgeRecord {
    pub(crate) edge_id: String,
    pub(crate) graph_snapshot_id: String,
    pub(crate) experiment_id: String,
    pub(crate) from_node_id: String,
    pub(crate) to_node_id: String,
    pub(crate) edge_type: String,
    pub(crate) confidence: String,
    pub(crate) evidence: Value,
    pub(crate) created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeRagChunkCitationRecord {
    pub(crate) revision_id: String,
    pub(crate) chunk_id: String,
    pub(crate) experiment_id: String,
    pub(crate) entity_id: Option<String>,
    pub(crate) block_id: Option<String>,
    pub(crate) source_range: Value,
    pub(crate) citation: Value,
    pub(crate) quality: Value,
    pub(crate) created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAgentRunRecord {
    pub(crate) agent_run_id: String,
    pub(crate) experiment_id: Option<String>,
    pub(crate) revision_id: Option<String>,
    pub(crate) status: String,
    pub(crate) goal: String,
    pub(crate) started_at: String,
    pub(crate) finished_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeAgentToolCallRecord {
    pub(crate) tool_call_id: String,
    pub(crate) agent_run_id: String,
    pub(crate) tool_name: String,
    pub(crate) input: Value,
    pub(crate) output: Option<Value>,
    pub(crate) status: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimePatchProposalRecord {
    pub(crate) patch_proposal_id: String,
    pub(crate) agent_run_id: Option<String>,
    pub(crate) experiment_id: String,
    pub(crate) base_revision_id: String,
    pub(crate) patch: Value,
    pub(crate) status: String,
    pub(crate) validation_result: Option<Value>,
    pub(crate) created_at: String,
    pub(crate) applied_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistRuntimeGraphRagResult {
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) graph_snapshot_id: String,
    pub(crate) experiment_id: String,
    pub(crate) counts: PersistRuntimeGraphRagCounts,
    pub(crate) target: PostgresTargetSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistRuntimeGraphRagCounts {
    pub(crate) snapshots: usize,
    pub(crate) nodes: usize,
    pub(crate) edges: usize,
    pub(crate) citations: usize,
    pub(crate) agent_runs: usize,
    pub(crate) agent_tool_calls: usize,
    pub(crate) patch_proposals: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresTargetSummary {
    pub(crate) source: String,
    pub(crate) host: Option<String>,
    pub(crate) database: Option<String>,
    pub(crate) user: Option<String>,
    pub(crate) ssl: String,
    pub(crate) timeout_ms: u64,
    pub(crate) pool: Option<String>,
}
