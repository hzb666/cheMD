import type { StorageMigration } from "./schema";

export const postgresGraphRagExtensionMigration: StorageMigration = {
  id: "0002_graph_rag_agent_extensions",
  description: "Add shared reaction graph, RAG citation, and agent audit contracts.",
  sql: `
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
  source_range jsonb NOT NULL,
  payload jsonb NOT NULL,
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
  evidence jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_rag_chunk_citations (
  revision_id text NOT NULL,
  chunk_id text NOT NULL,
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  entity_id text,
  block_id text,
  source_range jsonb NOT NULL,
  citation jsonb NOT NULL,
  quality jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL,
  PRIMARY KEY (revision_id, chunk_id),
  FOREIGN KEY (revision_id, chunk_id)
    REFERENCES chemd_rag_chunks(revision_id, chunk_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chemd_agent_runs (
  agent_run_id text PRIMARY KEY,
  experiment_id text REFERENCES chemd_experiments(experiment_id),
  revision_id text REFERENCES chemd_experiment_revisions(revision_id),
  status text NOT NULL,
  goal text NOT NULL,
  audit_timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL,
  finished_at timestamptz
);

ALTER TABLE chemd_agent_runs
  ADD COLUMN IF NOT EXISTS audit_timeline jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS chemd_agent_tool_calls (
  tool_call_id text PRIMARY KEY,
  agent_run_id text NOT NULL REFERENCES chemd_agent_runs(agent_run_id),
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS chemd_patch_proposals (
  patch_proposal_id text PRIMARY KEY,
  agent_run_id text REFERENCES chemd_agent_runs(agent_run_id),
  experiment_id text NOT NULL REFERENCES chemd_experiments(experiment_id),
  base_revision_id text NOT NULL REFERENCES chemd_experiment_revisions(revision_id),
  patch jsonb NOT NULL,
  status text NOT NULL,
  validation_result jsonb,
  created_at timestamptz NOT NULL,
  applied_at timestamptz
);

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
`
};

export const getPostgresGraphRagExtensionSchemaSql = (): string =>
  postgresGraphRagExtensionMigration.sql.trim();
