#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const MANAGED_MIGRATION_ID: &str = "managed-postgres-runtime-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedMigrationStateFile {
    pub(crate) migration_id: String,
    pub(crate) state: String,
    pub(crate) detail: String,
    pub(crate) updated_at: String,
}

pub(crate) fn migration_state_from_schema(
    vector_installed: bool,
    schema_ready: bool,
    found_table_count: usize,
) -> String {
    match (vector_installed, schema_ready, found_table_count) {
        (true, true, _) => "applied".into(),
        (_, false, 0) => "pending".into(),
        _ => "failed".into(),
    }
}

pub(crate) fn read_migration_state(path: &Path) -> Option<ManagedMigrationStateFile> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub(crate) fn write_migration_state(path: &Path, state: &str, detail: &str) -> Result<(), String> {
    let file = ManagedMigrationStateFile {
        migration_id: MANAGED_MIGRATION_ID.into(),
        state: state.into(),
        detail: detail.into(),
        updated_at: unix_timestamp_ms(),
    };
    let content = serde_json::to_string_pretty(&file).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

/// Mirrors the shared `@chemd/storage-postgres` core and graph/RAG migrations.
///
/// The managed desktop runtime owns only PostgreSQL process lifecycle. Its
/// database schema must stay identical to the shared product schema.
pub(crate) fn managed_migration_sql() -> &'static str {
    r#"
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chemd_experiments (
  experiment_id text PRIMARY KEY,
  title text NOT NULL,
  experiment_date date NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  primary_molecule_id text,
  primary_reaction_id text,
  primary_result_id text,
  primary_analysis_id text,
  primary_sample_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_experiment_revisions (
  revision_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  parent_revision_id text REFERENCES chemd_experiment_revisions(revision_id),
  source_kind text NOT NULL,
  raw_source text NOT NULL,
  source_hash text,
  source_uri text,
  commit_sha text,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_compile_runs (
  compile_run_id text PRIMARY KEY,
  revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  compiler_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'warning', 'error')),
  schema_versions jsonb NOT NULL,
  diagnostic_counts jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_compile_artifacts (
  compile_run_id text PRIMARY KEY REFERENCES chemd_compile_runs(compile_run_id),
  training_export jsonb NOT NULL,
  training_understanding jsonb NOT NULL,
  rag_export jsonb NOT NULL,
  lnf jsonb
);

CREATE TABLE IF NOT EXISTS chemd_semantic_entities (
  revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  entity_id text NOT NULL,
  entity_type text NOT NULL,
  original_id text,
  payload jsonb NOT NULL,
  PRIMARY KEY (revision_id, entity_id)
);

CREATE TABLE IF NOT EXISTS chemd_semantic_relations (
  revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  relation_id text NOT NULL,
  relation_type text NOT NULL,
  from_entity_id text NOT NULL,
  to_entity_id text NOT NULL,
  role text,
  confidence double precision,
  PRIMARY KEY (revision_id, relation_id)
);

CREATE TABLE IF NOT EXISTS chemd_field_evidence (
  revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  subject_entity_id text NOT NULL,
  field text NOT NULL,
  value jsonb,
  raw_value text,
  value_node_id text NOT NULL,
  raw_value_node_id text,
  normalized boolean,
  evidence_entity_ids text[] NOT NULL DEFAULT '{}',
  source_relation_ids text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (revision_id, subject_entity_id, field, value_node_id)
);

CREATE TABLE IF NOT EXISTS chemd_rag_chunks (
  chunk_id text NOT NULL,
  revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  chunk_type text NOT NULL,
  source_entity_ids text[] NOT NULL DEFAULT '{}',
  text text NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (revision_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS chemd_embedding_models (
  embedding_model text PRIMARY KEY,
  embedding_dim integer NOT NULL,
  distance_metric text NOT NULL DEFAULT 'cosine',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_rag_chunk_embeddings (
  revision_id text NOT NULL,
  chunk_id text NOT NULL,
  embedding_model text NOT NULL REFERENCES chemd_embedding_models(embedding_model),
  embedding vector NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (revision_id, chunk_id, embedding_model),
  FOREIGN KEY (revision_id, chunk_id)
    REFERENCES chemd_rag_chunks(revision_id, chunk_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chemd_semantic_diffs (
  semantic_diff_id text PRIMARY KEY,
  before_revision_id text REFERENCES chemd_experiment_revisions(revision_id),
  after_revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  diff jsonb NOT NULL,
  quality jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_training_experience_events (
  event_id text PRIMARY KEY,
  semantic_diff_id text REFERENCES chemd_semantic_diffs(semantic_diff_id),
  event_type text NOT NULL,
  reaction_family text,
  before_value jsonb,
  after_value jsonb,
  evidence jsonb NOT NULL DEFAULT '{}',
  training_uses text[] NOT NULL DEFAULT '{}',
  quality jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_correction_patterns (
  pattern_id text PRIMARY KEY,
  reaction_family text,
  source_field text,
  old_role text,
  new_role text,
  evidence_phrase_pattern text,
  support_count integer NOT NULL DEFAULT 0,
  confidence double precision,
  promoted_to_rule boolean NOT NULL DEFAULT false,
  training_uses text[] NOT NULL DEFAULT '{}',
  quality_tier text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_experiment_pattern_memory (
  experiment_pattern_id text PRIMARY KEY,
  pattern_scope text NOT NULL,
  reaction_family text,
  mechanism_family text,
  step_sequence_signature text,
  canonical_roles jsonb NOT NULL DEFAULT '{}',
  canonical_phase_roles jsonb NOT NULL DEFAULT '{}',
  common_field_corrections jsonb NOT NULL DEFAULT '[]',
  common_diagnostics jsonb NOT NULL DEFAULT '[]',
  controlled_variables jsonb NOT NULL DEFAULT '[]',
  high_value_variables jsonb NOT NULL DEFAULT '[]',
  outcome_delta_patterns jsonb NOT NULL DEFAULT '[]',
  failure_mode_patterns jsonb NOT NULL DEFAULT '[]',
  evidence_event_ids text[] NOT NULL DEFAULT '{}',
  support_count integer NOT NULL DEFAULT 0,
  confidence double precision,
  training_uses text[] NOT NULL DEFAULT '{}',
  promotion_targets text[] NOT NULL DEFAULT '{}',
  quality_tier text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_dataset_projections (
  dataset_projection_id text PRIMARY KEY,
  source_kind text NOT NULL,
  source_ids text[] NOT NULL DEFAULT '{}',
  dataset_type text NOT NULL,
  schema_version text NOT NULL,
  payload jsonb NOT NULL,
  quality jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chemd_reaction_graph_snapshots (
  graph_snapshot_id text PRIMARY KEY,
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  source_revision_ids jsonb NOT NULL,
  graph_kind text NOT NULL,
  node_count integer NOT NULL,
  edge_count integer NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_reaction_graph_nodes (
  node_id text PRIMARY KEY,
  graph_snapshot_id text NOT NULL REFERENCES chemd_reaction_graph_snapshots(graph_snapshot_id),
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  entity_id text NOT NULL,
  block_id text,
  reaction_family text,
  route_id text,
  source_range jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_reaction_graph_edges (
  edge_id text PRIMARY KEY,
  graph_snapshot_id text NOT NULL REFERENCES chemd_reaction_graph_snapshots(graph_snapshot_id),
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  from_node_id text NOT NULL,
  to_node_id text NOT NULL,
  edge_type text NOT NULL,
  confidence text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_rag_chunk_citations (
  revision_id text NOT NULL,
  chunk_id text NOT NULL,
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  entity_id text,
  block_id text,
  source_range jsonb NOT NULL DEFAULT '{}'::jsonb,
  citation jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (revision_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS chemd_agent_runs (
  agent_run_id text PRIMARY KEY,
  experiment_id text REFERENCES chemd_experiments(experiment_id),
  revision_id text REFERENCES chemd_experiment_revisions(revision_id),
  status text NOT NULL,
  goal text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS chemd_agent_tool_calls (
  tool_call_id text PRIMARY KEY,
  agent_run_id text NOT NULL REFERENCES chemd_agent_runs(agent_run_id),
  tool_name text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_patch_proposals (
  patch_proposal_id text PRIMARY KEY,
  agent_run_id text REFERENCES chemd_agent_runs(agent_run_id),
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  base_revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  validation_result jsonb,
  created_at timestamptz NOT NULL,
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS chemd_revisions_experiment_idx
  ON chemd_experiment_revisions (experiment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chemd_entities_type_idx
  ON chemd_semantic_entities (entity_type);

CREATE INDEX IF NOT EXISTS chemd_relations_type_idx
  ON chemd_semantic_relations (relation_type);

CREATE INDEX IF NOT EXISTS chemd_rag_chunks_metadata_idx
  ON chemd_rag_chunks USING gin (metadata);

CREATE INDEX IF NOT EXISTS chemd_training_events_condition_pattern_idx
  ON chemd_training_experience_events (
    event_type,
    reaction_family,
    (after_value->>'field'),
    (before_value->>'value'),
    (after_value->>'value')
  );

CREATE INDEX IF NOT EXISTS chemd_training_events_semantic_diff_idx
  ON chemd_training_experience_events (semantic_diff_id);

CREATE INDEX IF NOT EXISTS chemd_reaction_graph_nodes_family_idx
  ON chemd_reaction_graph_nodes (experiment_id, reaction_family);

CREATE INDEX IF NOT EXISTS chemd_reaction_graph_nodes_route_idx
  ON chemd_reaction_graph_nodes (experiment_id, route_id);

CREATE INDEX IF NOT EXISTS chemd_reaction_graph_edges_snapshot_idx
  ON chemd_reaction_graph_edges (graph_snapshot_id);

CREATE INDEX IF NOT EXISTS chemd_rag_chunk_citations_citation_idx
  ON chemd_rag_chunk_citations USING gin (citation);

CREATE INDEX IF NOT EXISTS chemd_agent_tool_calls_run_idx
  ON chemd_agent_tool_calls (agent_run_id, created_at);
"#
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
