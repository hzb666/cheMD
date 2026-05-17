#![cfg_attr(test, allow(dead_code))]

use crate::{
    postgres::connect,
    postgres_config::{
        load_postgres_config, load_postgres_config_for_workspace, redact_config_detail,
        PostgresRuntimeConfig,
    },
    postgres_runtime_sql::persist_runtime_graph_rag_records,
    postgres_runtime_types::{
        PersistRuntimeGraphRagCounts, PersistRuntimeGraphRagInput, PersistRuntimeGraphRagResult,
        PostgresTargetSummary, RuntimeGraphEdgeRecord, RuntimeGraphNodeRecord,
    },
    workspace::CommandError,
};
use serde_json::Value;
use std::collections::BTreeSet;

#[cfg(not(test))]
#[tauri::command]
pub async fn persist_runtime_graph_rag(
    payload: PersistRuntimeGraphRagInput,
) -> Result<PersistRuntimeGraphRagResult, CommandError> {
    match tauri::async_runtime::spawn_blocking(move || persist_runtime_graph_rag_impl(payload))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(CommandError::new(
            "postgres_runtime_task_failed",
            "Runtime persistence task failed",
            Some(error.to_string()),
        )),
    }
}

pub(crate) fn persist_runtime_graph_rag_impl(
    records: PersistRuntimeGraphRagInput,
) -> Result<PersistRuntimeGraphRagResult, CommandError> {
    validate_runtime_graph_rag_input(&records)?;
    let workspace_id = runtime_workspace_id(&records);
    let config = match workspace_id.as_deref() {
        Some(id) => load_postgres_config_for_workspace(Some(id))
            .ok_or_else(|| missing_workspace_config_error(id))?,
        None => load_postgres_config().ok_or_else(missing_config_error)?,
    };
    let mut client = connect(&config).map_err(|detail| {
        CommandError::new(
            "postgres_connect_failed",
            "Failed to connect to PostgreSQL",
            Some(detail),
        )
    })?;

    persist_runtime_graph_rag_records(&mut client, &records).map_err(|error| {
        CommandError::new(
            "postgres_runtime_persist_failed",
            "Failed to persist runtime Graph/RAG records",
            Some(redact_config_detail(&error.to_string(), &config)),
        )
    })?;

    Ok(success_result(records, &config))
}

fn runtime_workspace_id(records: &PersistRuntimeGraphRagInput) -> Option<String> {
    records
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("workspaceId"))
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn validate_runtime_graph_rag_input(
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), CommandError> {
    require_text(
        "graphSnapshot.graphSnapshotId",
        &records.graph_snapshot.graph_snapshot_id,
    )?;
    require_text(
        "graphSnapshot.experimentId",
        &records.graph_snapshot.experiment_id,
    )?;
    require_text(
        "graphSnapshot.graphKind",
        &records.graph_snapshot.graph_kind,
    )?;
    require_text(
        "graphSnapshot.createdAt",
        &records.graph_snapshot.created_at,
    )?;
    if records.graph_snapshot.source_revision_ids.is_empty() {
        return invalid_input("graphSnapshot.sourceRevisionIds must not be empty");
    }
    for (index, revision_id) in records
        .graph_snapshot
        .source_revision_ids
        .iter()
        .enumerate()
    {
        require_text(
            &format!("graphSnapshot.sourceRevisionIds[{index}]"),
            revision_id,
        )?;
    }
    require_optional_text("payload.createdAt", records.created_at.as_deref())?;
    if matches!(records.metadata.as_ref(), Some(Value::Null)) {
        return invalid_input("payload.metadata must not be null when provided");
    }

    let node_ids = records
        .nodes
        .iter()
        .map(|node| node.node_id.as_str())
        .collect::<BTreeSet<_>>();
    for node in &records.nodes {
        validate_node(node, records)?;
    }
    for edge in &records.edges {
        validate_edge(edge, records, &node_ids)?;
    }
    for citation in &records.citation_candidates {
        require_text("citationCandidate.revisionId", &citation.revision_id)?;
        require_text("citationCandidate.chunkId", &citation.chunk_id)?;
        require_text("citationCandidate.experimentId", &citation.experiment_id)?;
    }
    for run in &records.agent_runs {
        require_text("agentRun.agentRunId", &run.agent_run_id)?;
        require_text("agentRun.status", &run.status)?;
        require_text("agentRun.goal", &run.goal)?;
        require_text("agentRun.startedAt", &run.started_at)?;
        if !run.audit_timeline.is_array() {
            return invalid_input("agentRun.auditTimeline must be an array");
        }
        require_optional_text("agentRun.experimentId", run.experiment_id.as_deref())?;
        require_optional_text("agentRun.revisionId", run.revision_id.as_deref())?;
    }
    for call in &records.agent_tool_calls {
        require_text("agentToolCall.toolCallId", &call.tool_call_id)?;
        require_text("agentToolCall.agentRunId", &call.agent_run_id)?;
        require_text("agentToolCall.toolName", &call.tool_name)?;
        require_text("agentToolCall.status", &call.status)?;
        require_text("agentToolCall.createdAt", &call.created_at)?;
    }
    for proposal in &records.patch_proposals {
        require_text("patchProposal.patchProposalId", &proposal.patch_proposal_id)?;
        require_optional_text("patchProposal.agentRunId", proposal.agent_run_id.as_deref())?;
        require_text("patchProposal.experimentId", &proposal.experiment_id)?;
        require_text("patchProposal.baseRevisionId", &proposal.base_revision_id)?;
        require_text("patchProposal.status", &proposal.status)?;
        require_text("patchProposal.createdAt", &proposal.created_at)?;
    }
    Ok(())
}

pub(crate) fn json_param(value: &Value) -> String {
    serde_json::to_string(value).expect("serde_json::Value should serialize")
}

pub(crate) fn optional_json_param(value: &Option<Value>) -> Option<String> {
    value.as_ref().map(json_param)
}

fn validate_node(
    node: &RuntimeGraphNodeRecord,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), CommandError> {
    require_text("node.nodeId", &node.node_id)?;
    require_text("node.graphSnapshotId", &node.graph_snapshot_id)?;
    require_text("node.experimentId", &node.experiment_id)?;
    require_text("node.revisionId", &node.revision_id)?;
    require_text("node.entityId", &node.entity_id)?;
    require_text("node.createdAt", &node.created_at)?;
    require_same_snapshot(&node.graph_snapshot_id, records)?;
    require_same_experiment(&node.experiment_id, records)
}

fn validate_edge(
    edge: &RuntimeGraphEdgeRecord,
    records: &PersistRuntimeGraphRagInput,
    node_ids: &BTreeSet<&str>,
) -> Result<(), CommandError> {
    require_text("edge.edgeId", &edge.edge_id)?;
    require_text("edge.graphSnapshotId", &edge.graph_snapshot_id)?;
    require_text("edge.experimentId", &edge.experiment_id)?;
    require_text("edge.fromNodeId", &edge.from_node_id)?;
    require_text("edge.toNodeId", &edge.to_node_id)?;
    require_text("edge.edgeType", &edge.edge_type)?;
    require_text("edge.confidence", &edge.confidence)?;
    require_text("edge.createdAt", &edge.created_at)?;
    require_same_snapshot(&edge.graph_snapshot_id, records)?;
    require_same_experiment(&edge.experiment_id, records)?;
    if !node_ids.contains(edge.from_node_id.as_str())
        || !node_ids.contains(edge.to_node_id.as_str())
    {
        return invalid_input("edge endpoints must reference nodes in the same payload");
    }
    Ok(())
}

fn require_same_snapshot(
    graph_snapshot_id: &str,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), CommandError> {
    if graph_snapshot_id != records.graph_snapshot.graph_snapshot_id {
        return invalid_input("record graphSnapshotId must match graphSnapshot.graphSnapshotId");
    }
    Ok(())
}

fn require_same_experiment(
    experiment_id: &str,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), CommandError> {
    if experiment_id != records.graph_snapshot.experiment_id {
        return invalid_input("record experimentId must match graphSnapshot.experimentId");
    }
    Ok(())
}

fn require_text(field: &str, value: &str) -> Result<(), CommandError> {
    if value.trim().is_empty() {
        return invalid_input(&format!("{field} must not be empty"));
    }
    Ok(())
}

fn require_optional_text(field: &str, value: Option<&str>) -> Result<(), CommandError> {
    if matches!(value, Some(text) if text.trim().is_empty()) {
        return invalid_input(&format!("{field} must not be empty when provided"));
    }
    Ok(())
}

fn invalid_input(detail: &str) -> Result<(), CommandError> {
    Err(CommandError::new(
        "postgres_runtime_invalid_input",
        "Invalid runtime Graph/RAG persistence input",
        Some(detail.into()),
    ))
}

fn missing_config_error() -> CommandError {
    CommandError::new(
        "postgres_config_missing",
        "PostgreSQL is not configured",
        Some(
            "Set CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL before persisting runtime records"
                .into(),
        ),
    )
}

fn missing_workspace_config_error(workspace_id: &str) -> CommandError {
    CommandError::new(
        "workspace_postgres_config_missing",
        "Workspace Postgres profile is missing",
        Some(format!(
            "Bind workspace {workspace_id} to a Postgres profile before persisting runtime records"
        )),
    )
}

fn success_result(
    records: PersistRuntimeGraphRagInput,
    config: &PostgresRuntimeConfig,
) -> PersistRuntimeGraphRagResult {
    PersistRuntimeGraphRagResult {
        state: "ready".into(),
        label: "Runtime persisted".into(),
        detail: format!(
            "Persisted runtime Graph/RAG records to {}",
            target_detail(config)
        ),
        graph_snapshot_id: records.graph_snapshot.graph_snapshot_id,
        experiment_id: records.graph_snapshot.experiment_id,
        counts: PersistRuntimeGraphRagCounts {
            snapshots: 1,
            nodes: records.nodes.len(),
            edges: records.edges.len(),
            citations: records.citation_candidates.len(),
            agent_runs: records.agent_runs.len(),
            agent_tool_calls: records.agent_tool_calls.len(),
            patch_proposals: records.patch_proposals.len(),
        },
        target: target_summary(config),
    }
}

fn target_summary(config: &PostgresRuntimeConfig) -> PostgresTargetSummary {
    PostgresTargetSummary {
        source: config.source.clone(),
        host: config.host.clone(),
        database: config.database.clone(),
        user: config.user.clone(),
        ssl: config.ssl.clone(),
        timeout_ms: config.timeout_ms,
        pool: config.pool.clone(),
    }
}

fn target_detail(config: &PostgresRuntimeConfig) -> String {
    let host = config.host.as_deref().unwrap_or("unknown host");
    let database = config.database.as_deref().unwrap_or("unknown database");
    let user = config.user.as_deref().unwrap_or("unknown user");
    format!("{host}/{database} as {user}")
}
