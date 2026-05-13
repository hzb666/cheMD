import {
  buildRecordAgentRunQuery,
  buildRecordAgentToolCallQuery,
  buildRecordPatchProposalQuery,
  buildUpsertGraphSnapshotQueries,
  buildUpsertRagChunkCitationQuery
} from "./graph-rag-repository";
import {
  executePostgresGraphRagQuery,
  executePostgresGraphRagTransaction
} from "./graph-rag-executor";
import { buildPostgresRuntimeGraphRagRecords } from "./graph-rag-runtime-adapters";
import type {
  BuildPostgresRuntimeGraphRagInput,
  PostgresRuntimeGraphRagRecords
} from "./graph-rag-runtime-types";
import type { PostgresGraphRagClient, PostgresGraphRagQuery } from "./graph-rag-types";

export type PersistPostgresRuntimeGraphRagInput =
  | PostgresRuntimeGraphRagRecords
  | BuildPostgresRuntimeGraphRagInput;

export interface PersistPostgresRuntimeGraphRagResult {
  records: PostgresRuntimeGraphRagRecords;
}

const isRuntimeGraphRagRecords = (
  input: PersistPostgresRuntimeGraphRagInput
): input is PostgresRuntimeGraphRagRecords =>
  "graphSnapshotInput" in input;

const toRuntimeGraphRagRecords = (
  input: PersistPostgresRuntimeGraphRagInput
): PostgresRuntimeGraphRagRecords =>
  isRuntimeGraphRagRecords(input)
    ? input
    : buildPostgresRuntimeGraphRagRecords(input);

const executeQueries = async (
  client: PostgresGraphRagClient,
  queries: readonly PostgresGraphRagQuery[]
): Promise<void> => {
  for (const item of queries) {
    await executePostgresGraphRagQuery(client, item);
  }
};

export const persistPostgresRuntimeGraphRagRecords = async (
  client: PostgresGraphRagClient,
  input: PersistPostgresRuntimeGraphRagInput
): Promise<PersistPostgresRuntimeGraphRagResult> => {
  const records = toRuntimeGraphRagRecords(input);

  await executePostgresGraphRagTransaction(client, async () => {
    await executeQueries(client, buildUpsertGraphSnapshotQueries(records.graphSnapshotInput));
    await executeQueries(client, records.ragChunkCitations.map(buildUpsertRagChunkCitationQuery));
    await executeQueries(client, records.agentRuns.map(buildRecordAgentRunQuery));
    await executeQueries(client, records.agentToolCalls.map(buildRecordAgentToolCallQuery));
    await executeQueries(client, records.patchProposals.map(buildRecordPatchProposalQuery));
  });

  return { records };
};
