export interface StorageMigration {
  id: string;
  description: string;
  sql: string;
}

export const storagePostgresMigrations: StorageMigration[] = [
  {
    id: "0001_chemd_storage_core",
    description: "Create Chemd PostgreSQL storage contract with pgvector support.",
    sql: `
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
`
  }
];

export const getStoragePostgresSchemaSql = (): string =>
  storagePostgresMigrations.map((migration) => migration.sql.trim()).join("\n\n");
