import type {
  PgvectorDistanceMetric,
  PostgresRagQueryRequest,
  PostgresRagQueryResult,
  PostgresStatus
} from "../contracts";
import type { WorkspaceRagResult } from "./rag-citation-gate";
import {
  mergeWorkspaceRagResults,
  type ConnectedRagMergeResult
} from "./connected-rag-results";
import {
  buildPostgresRagQueryView,
  type PostgresRagQueryView
} from "./postgres-rag-query-view";

export type PostgresRagQueryMode = "sample" | "workspace";

export type PostgresRagQueryDisabledReason =
  | "not_workspace_mode"
  | "empty_query"
  | "postgres_not_configured"
  | "postgres_not_ready"
  | "pgvector_not_ready"
  | "schema_not_ready"
  | "embedding_unavailable"
  | "runner_unavailable";

export type PostgresRagQueryControllerStateName =
  | "disabled"
  | "ready"
  | "degraded";

export interface PostgresRagEmbeddingState {
  providerAvailable: boolean;
  vector?: readonly number[] | null;
  model?: string | null;
  distanceMetric?: PgvectorDistanceMetric;
}

export interface PostgresRagQueryReadinessInput {
  mode: PostgresRagQueryMode;
  query: string;
  postgresStatus: PostgresStatus;
  embedding: PostgresRagEmbeddingState;
  runnerAvailable: boolean;
}

export interface PostgresRagQueryReadiness {
  disabled: boolean;
  disabledReason: PostgresRagQueryDisabledReason | null;
  disabledReasons: PostgresRagQueryDisabledReason[];
  message: string;
}

export interface PostgresRagQueryControllerInput
  extends PostgresRagQueryReadinessInput {
  localResults?: readonly WorkspaceRagResult[];
  commandResult?: PostgresRagQueryResult | null;
  limit?: number;
  workspaceId?: string;
  documentId?: string;
  revisionId?: string;
}

export interface PostgresRagQueryControllerState {
  state: PostgresRagQueryControllerStateName;
  query: string;
  disabled: boolean;
  degraded: boolean;
  readiness: PostgresRagQueryReadiness;
  commandView: PostgresRagQueryView | null;
  merged: ConnectedRagMergeResult;
  request: PostgresRagQueryRequest | null;
  message: string;
}

export const postgresRagQueryDisabledReasonMessages: Record<
  PostgresRagQueryDisabledReason,
  string
> = {
  not_workspace_mode: "Switch to workspace mode before running connected RAG.",
  empty_query: "Enter a query before running connected RAG.",
  postgres_not_configured: "Configure Postgres before running connected RAG.",
  postgres_not_ready: "Postgres is not ready; local citation-backed results remain available.",
  pgvector_not_ready: "pgvector is not ready for connected RAG.",
  schema_not_ready: "The shared Graph/RAG schema is not ready.",
  embedding_unavailable: "An embedding provider is required for connected RAG.",
  runner_unavailable: "The connected RAG runner is unavailable in this runtime."
};

const disabledReasonPriority: readonly PostgresRagQueryDisabledReason[] = [
  "not_workspace_mode",
  "empty_query",
  "postgres_not_configured",
  "postgres_not_ready",
  "pgvector_not_ready",
  "schema_not_ready",
  "embedding_unavailable",
  "runner_unavailable"
];

const normalizedQuery = (query: string): string => query.trim();

const nonBlank = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value.trim().length > 0;

const hasUsableEmbeddingProvider = (embedding: PostgresRagEmbeddingState): boolean =>
  embedding.providerAvailable
  && nonBlank(embedding.model);

const hasUsableEmbeddingVector = (embedding: PostgresRagEmbeddingState): boolean =>
  hasUsableEmbeddingProvider(embedding)
  && Array.isArray(embedding.vector)
  && embedding.vector.length > 0
  && embedding.vector.every((value) => Number.isFinite(value));

const addReason = (
  reasons: PostgresRagQueryDisabledReason[],
  reason: PostgresRagQueryDisabledReason
): void => {
  if (!reasons.includes(reason)) reasons.push(reason);
};

const sortReasons = (
  reasons: PostgresRagQueryDisabledReason[]
): PostgresRagQueryDisabledReason[] =>
  disabledReasonPriority.filter((reason) => reasons.includes(reason));

export const buildPostgresRagQueryReadiness = (
  input: PostgresRagQueryReadinessInput
): PostgresRagQueryReadiness => {
  const reasons: PostgresRagQueryDisabledReason[] = [];
  if (input.mode !== "workspace") addReason(reasons, "not_workspace_mode");
  if (!nonBlank(input.query)) addReason(reasons, "empty_query");
  if (!input.postgresStatus.configured) addReason(reasons, "postgres_not_configured");
  if (input.postgresStatus.configured && input.postgresStatus.state !== "ready") {
    addReason(reasons, "postgres_not_ready");
  }
  if (input.postgresStatus.configured && input.postgresStatus.vectorInstalled !== true) {
    addReason(reasons, "pgvector_not_ready");
  }
  if (input.postgresStatus.configured && (
    input.postgresStatus.schemaReady !== true
    || input.postgresStatus.migrationState !== "ready"
  )) {
    addReason(reasons, "schema_not_ready");
  }
  if (!hasUsableEmbeddingProvider(input.embedding)) addReason(reasons, "embedding_unavailable");
  if (!input.runnerAvailable) addReason(reasons, "runner_unavailable");

  const disabledReasons = sortReasons(reasons);
  const disabledReason = disabledReasons[0] ?? null;
  return {
    disabled: disabledReason !== null,
    disabledReason,
    disabledReasons,
    message: disabledReason
      ? postgresRagQueryDisabledReasonMessages[disabledReason]
      : "Connected RAG query is ready."
  };
};

export const buildPostgresRagQueryRequest = (
  input: PostgresRagQueryControllerInput
): PostgresRagQueryRequest | null => {
  const readiness = buildPostgresRagQueryReadiness(input);
  const vector = input.embedding.vector;
  if (readiness.disabled || !hasUsableEmbeddingVector(input.embedding) || !vector || !input.embedding.model) {
    return null;
  }

  return {
    query: normalizedQuery(input.query),
    embedding: [...vector],
    embeddingModel: input.embedding.model.trim(),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
    ...(input.revisionId === undefined ? {} : { revisionId: input.revisionId })
  };
};

const stateForController = (
  readiness: PostgresRagQueryReadiness,
  commandView: PostgresRagQueryView | null,
  merged: ConnectedRagMergeResult
): PostgresRagQueryControllerStateName => {
  if (readiness.disabled) return "disabled";
  if (
    commandView?.summary.degraded
    || commandView?.summary.disabled
    || commandView?.summary.adapter.blockedCount
    || merged.blocked.count > 0
  ) {
    return "degraded";
  }
  return "ready";
};

const messageForController = (
  state: PostgresRagQueryControllerStateName,
  readiness: PostgresRagQueryReadiness,
  commandView: PostgresRagQueryView | null
): string => {
  if (readiness.disabled) return readiness.message;
  if (commandView) return commandView.summary.message;
  return state === "degraded"
    ? "Connected RAG query is degraded; local citation-backed results remain available."
    : "Connected RAG query is ready.";
};

export const buildPostgresRagQueryControllerState = (
  input: PostgresRagQueryControllerInput
): PostgresRagQueryControllerState => {
  const readiness = buildPostgresRagQueryReadiness(input);
  const commandView = input.commandResult
    ? buildPostgresRagQueryView(input.commandResult)
    : null;
  const merged = mergeWorkspaceRagResults({
    localResults: input.localResults ?? [],
    connectedRows: commandView?.connectedRows ?? []
  });
  const state = stateForController(readiness, commandView, merged);

  return {
    state,
    query: normalizedQuery(input.query),
    disabled: readiness.disabled,
    degraded: state === "degraded",
    readiness,
    commandView,
    merged,
    request: buildPostgresRagQueryRequest(input),
    message: messageForController(state, readiness, commandView)
  };
};
