import {
  buildListGraphSnapshotSummariesQuery,
  buildListPendingPatchProposalsQuery,
  buildLoadGraphDetailQueries,
  buildRecordAgentRunQuery,
  buildRecordAgentToolCallQuery,
  buildRecordPatchProposalQuery,
  buildUpsertGraphSnapshotQueries,
  buildUpsertRagChunkCitationQuery
} from "./graph-rag-repository";
import {
  mapPostgresGraphDetailRows,
  mapPostgresGraphSnapshotRow,
  mapPostgresPatchProposalRow,
  readPostgresGraphRagRows
} from "./graph-rag-row-mappers";
import type {
  ListPendingPostgresPatchProposalsInput,
  ListPostgresGraphSnapshotSummariesInput,
  LoadPostgresGraphDetailInput,
  PostgresAgentRunRecord,
  PostgresAgentToolCallRecord,
  PostgresGraphDetail,
  PostgresGraphRagClient,
  PostgresGraphRagQuery,
  PostgresPatchProposalRecord,
  PostgresRagChunkCitationRecord,
  PostgresReactionGraphSnapshotRecord,
  UpsertPostgresGraphSnapshotInput
} from "./graph-rag-types";

type GraphSnapshotMapperRow = Parameters<typeof mapPostgresGraphSnapshotRow>[0];
type PatchProposalMapperRow = Parameters<typeof mapPostgresPatchProposalRow>[0];

export const executePostgresGraphRagQuery = async (
  client: PostgresGraphRagClient,
  query: PostgresGraphRagQuery
): Promise<unknown> => client.query(query.sql, query.values);

const executePostgresGraphRagQueries = async (
  client: PostgresGraphRagClient,
  queries: readonly PostgresGraphRagQuery[]
): Promise<void> => {
  for (const item of queries) {
    await executePostgresGraphRagQuery(client, item);
  }
};

export const executePostgresGraphRagTransaction = async <T>(
  client: PostgresGraphRagClient,
  operation: () => Promise<T>
): Promise<T> => {
  await client.query("BEGIN", []);
  try {
    const result = await operation();
    await client.query("COMMIT", []);
    return result;
  } catch (error) {
    await client.query("ROLLBACK", []);
    throw error;
  }
};

export const executeUpsertGraphSnapshotTransactionPlan = async (
  client: PostgresGraphRagClient,
  input: UpsertPostgresGraphSnapshotInput
): Promise<void> => {
  const queries = buildUpsertGraphSnapshotQueries(input);
  await executePostgresGraphRagTransaction(client, async () => {
    await executePostgresGraphRagQueries(client, queries);
  });
};

export const listPostgresGraphSnapshotSummaries = async (
  client: PostgresGraphRagClient,
  input: ListPostgresGraphSnapshotSummariesInput = {}
): Promise<PostgresReactionGraphSnapshotRecord[]> => {
  const result = await executePostgresGraphRagQuery(
    client,
    buildListGraphSnapshotSummariesQuery(input)
  );
  return readPostgresGraphRagRows<GraphSnapshotMapperRow>(result)
    .map(mapPostgresGraphSnapshotRow);
};

export const loadPostgresGraphDetail = async (
  client: PostgresGraphRagClient,
  input: LoadPostgresGraphDetailInput
): Promise<PostgresGraphDetail> => {
  const queries = buildLoadGraphDetailQueries(input);
  const snapshot = await executePostgresGraphRagQuery(client, queries.snapshot);
  const nodes = await executePostgresGraphRagQuery(client, queries.nodes);
  const edges = await executePostgresGraphRagQuery(client, queries.edges);
  return mapPostgresGraphDetailRows(
    readPostgresGraphRagRows(snapshot),
    readPostgresGraphRagRows(nodes),
    readPostgresGraphRagRows(edges)
  );
};

export const upsertPostgresRagChunkCitation = async (
  client: PostgresGraphRagClient,
  record: PostgresRagChunkCitationRecord
): Promise<void> => {
  await executePostgresGraphRagQuery(client, buildUpsertRagChunkCitationQuery(record));
};

export const recordPostgresAgentRun = async (
  client: PostgresGraphRagClient,
  record: PostgresAgentRunRecord
): Promise<void> => {
  await executePostgresGraphRagQuery(client, buildRecordAgentRunQuery(record));
};

export const recordPostgresAgentToolCall = async (
  client: PostgresGraphRagClient,
  record: PostgresAgentToolCallRecord
): Promise<void> => {
  await executePostgresGraphRagQuery(client, buildRecordAgentToolCallQuery(record));
};

export const recordPostgresPatchProposal = async (
  client: PostgresGraphRagClient,
  record: PostgresPatchProposalRecord
): Promise<void> => {
  await executePostgresGraphRagQuery(client, buildRecordPatchProposalQuery(record));
};

export const listPendingPostgresPatchProposals = async (
  client: PostgresGraphRagClient,
  input: ListPendingPostgresPatchProposalsInput = {}
): Promise<PostgresPatchProposalRecord[]> => {
  const result = await executePostgresGraphRagQuery(
    client,
    buildListPendingPatchProposalsQuery(input)
  );
  return readPostgresGraphRagRows<PatchProposalMapperRow>(result)
    .map(mapPostgresPatchProposalRow);
};
