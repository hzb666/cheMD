#![cfg_attr(test, allow(dead_code))]

use crate::postgres_runtime_persist::json_param;
use crate::postgres_runtime_types::{PersistRuntimeGraphRagInput, RuntimeRagChunkCitationRecord};
use postgres::{Error, Transaction};
use serde_json::{json, Value};

pub(crate) fn upsert_runtime_core_records(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), Error> {
    upsert_experiment(tx, records)?;
    upsert_revision(tx, records)?;
    upsert_citation_chunks(tx, records)
}

fn upsert_experiment(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<u64, Error> {
    let created_at = runtime_created_at(records);
    let title = metadata_text(records, "documentName")
        .or_else(|| metadata_text(records, "documentPath"))
        .unwrap_or_else(|| records.graph_snapshot.experiment_id.clone());
    let experiment_date = created_at.get(0..10).unwrap_or("1970-01-01");
    tx.execute(
        "INSERT INTO chemd_experiments (
           experiment_id, title, experiment_date, tags, created_at, updated_at
         ) VALUES ($1, $2, $3::date, ARRAY['desktop-runtime']::text[], $4::timestamptz, $4::timestamptz)
         ON CONFLICT (experiment_id) DO UPDATE SET
           title = EXCLUDED.title,
           updated_at = EXCLUDED.updated_at",
        &[
            &records.graph_snapshot.experiment_id,
            &title,
            &experiment_date,
            &created_at,
        ],
    )
}

fn upsert_revision(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<u64, Error> {
    let revision_id = &records.graph_snapshot.source_revision_ids[0];
    let raw_source = metadata_text(records, "sourceText").unwrap_or_default();
    let source_hash = metadata_text(records, "sourceHash");
    let source_uri =
        metadata_text(records, "documentUri").or_else(|| metadata_text(records, "documentPath"));
    tx.execute(
        "INSERT INTO chemd_experiment_revisions (
           revision_id, experiment_id, source_kind, raw_source, source_hash,
           source_uri, created_at
         ) VALUES ($1, $2, 'desktop_runtime', $3, $4, $5, $6::timestamptz)
         ON CONFLICT (revision_id) DO UPDATE SET
           raw_source = EXCLUDED.raw_source,
           source_hash = EXCLUDED.source_hash,
           source_uri = EXCLUDED.source_uri",
        &[
            revision_id,
            &records.graph_snapshot.experiment_id,
            &raw_source,
            &source_hash,
            &source_uri,
            &runtime_created_at(records),
        ],
    )
}

fn upsert_citation_chunks(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<(), Error> {
    for citation in &records.citation_candidates {
        upsert_citation_chunk(tx, citation)?;
    }
    Ok(())
}

fn upsert_citation_chunk(
    tx: &mut Transaction<'_>,
    citation: &RuntimeRagChunkCitationRecord,
) -> Result<u64, Error> {
    let source_entity_ids = citation.entity_id.iter().cloned().collect::<Vec<String>>();
    let metadata = json_param(&json!({
        "source": "desktop_runtime_persistence",
        "citation": citation.citation,
        "quality": citation.quality
    }));
    let text = citation_text(citation);
    tx.execute(
        "INSERT INTO chemd_rag_chunks (
           chunk_id, revision_id, experiment_id, chunk_type, source_entity_ids,
           text, metadata
         ) VALUES ($1, $2, $3, 'desktop_runtime_citation', $4::text[], $5, $6::jsonb)
         ON CONFLICT (revision_id, chunk_id) DO UPDATE SET
           experiment_id = EXCLUDED.experiment_id,
           chunk_type = EXCLUDED.chunk_type,
           source_entity_ids = EXCLUDED.source_entity_ids,
           text = EXCLUDED.text,
           metadata = EXCLUDED.metadata",
        &[
            &citation.chunk_id,
            &citation.revision_id,
            &citation.experiment_id,
            &source_entity_ids,
            &text,
            &metadata,
        ],
    )
}

fn runtime_created_at(records: &PersistRuntimeGraphRagInput) -> String {
    records
        .created_at
        .clone()
        .unwrap_or_else(|| records.graph_snapshot.created_at.clone())
}

fn metadata_text(records: &PersistRuntimeGraphRagInput, key: &str) -> Option<String> {
    records
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_str)
        .map(str::to_owned)
}

fn citation_text(citation: &RuntimeRagChunkCitationRecord) -> String {
    citation
        .citation
        .get("documentUri")
        .and_then(Value::as_str)
        .map(|uri| {
            format!(
                "Desktop runtime citation for {} in {uri}",
                citation.chunk_id
            )
        })
        .unwrap_or_else(|| format!("Desktop runtime citation for {}", citation.chunk_id))
}
