#![cfg_attr(test, allow(dead_code))]

use crate::postgres_runtime_types::PersistRuntimeGraphRagInput;
use postgres::{Error, Transaction};

pub(crate) fn delete_missing_edges(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<u64, Error> {
    let edge_ids = records
        .edges
        .iter()
        .map(|edge| edge.edge_id.clone())
        .collect::<Vec<_>>();
    tx.execute(
        "DELETE FROM chemd_reaction_graph_edges
         WHERE graph_snapshot_id = $1
           AND NOT (edge_id = ANY($2::text[]))",
        &[&records.graph_snapshot.graph_snapshot_id, &edge_ids],
    )
}

pub(crate) fn delete_missing_nodes(
    tx: &mut Transaction<'_>,
    records: &PersistRuntimeGraphRagInput,
) -> Result<u64, Error> {
    let node_ids = records
        .nodes
        .iter()
        .map(|node| node.node_id.clone())
        .collect::<Vec<_>>();
    tx.execute(
        "DELETE FROM chemd_reaction_graph_nodes
         WHERE graph_snapshot_id = $1
           AND NOT (node_id = ANY($2::text[]))",
        &[&records.graph_snapshot.graph_snapshot_id, &node_ids],
    )
}
