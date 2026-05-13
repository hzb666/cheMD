import type {
  CreateEmbeddingVectorsInputItem,
  CreateEmbeddingVectorsResult,
  EmbeddingProviderStatus,
  PgvectorDistanceMetric,
  PostgresRagEmbeddingBackfillItem,
  PostgresRagEmbeddingBackfillRequest,
  PostgresStatus
} from "../desktop-contracts";
import type { DesktopWorkspaceRagResult } from "./desktop-rag-citation-gate";

export type DesktopPostgresRagBackfillMode = "sample" | "workspace";

export type DesktopPostgresRagBackfillDisabledReason =
  | "not_workspace_mode"
  | "postgres_not_configured"
  | "postgres_not_ready"
  | "pgvector_not_ready"
  | "schema_not_ready"
  | "embedding_unavailable"
  | "embedding_model_missing"
  | "local_rag_empty"
  | "runner_unavailable";

export interface DesktopPostgresRagBackfillReadinessInput {
  mode: DesktopPostgresRagBackfillMode;
  postgresStatus: PostgresStatus;
  embeddingStatus: EmbeddingProviderStatus;
  localResults: readonly DesktopWorkspaceRagResult[];
  runnerAvailable: boolean;
}

export interface DesktopPostgresRagBackfillReadiness {
  disabled: boolean;
  disabledReasons: DesktopPostgresRagBackfillDisabledReason[];
  message: string;
}

export interface DesktopPostgresRagBackfillEmbeddingPlanItem {
  id: string;
  revisionId: string;
  chunkId: string;
  text: string;
}

export interface DesktopPostgresRagBackfillEmbeddingPlan {
  items: DesktopPostgresRagBackfillEmbeddingPlanItem[];
  embeddingItems: CreateEmbeddingVectorsInputItem[];
  skippedDuplicateCount: number;
  skippedBlankTextCount: number;
}

export interface DesktopPostgresRagBackfillRequestBuildInput {
  plan: DesktopPostgresRagBackfillEmbeddingPlan;
  embeddingResult: CreateEmbeddingVectorsResult;
  embeddingModel: string;
  fallbackEmbeddingDim: number | null;
  distanceMetric?: PgvectorDistanceMetric;
}

export interface DesktopPostgresRagBackfillRequestBuildResult {
  request: PostgresRagEmbeddingBackfillRequest | null;
  readyItemCount: number;
  skippedEmbeddingCount: number;
  message: string;
}

export interface DesktopPostgresRagBackfillCompletionMessageInput {
  detail: string;
  fallback: string;
  skippedDuplicateCount: number;
  skippedBlankTextCount: number;
  skippedEmbeddingCount: number;
}

const readinessMessage: Record<DesktopPostgresRagBackfillDisabledReason, string> = {
  not_workspace_mode: "Open a workspace before backfilling connected RAG embeddings.",
  postgres_not_configured: "Configure Postgres before backfilling connected RAG embeddings.",
  postgres_not_ready: "Postgres must be ready before backfilling connected RAG embeddings.",
  pgvector_not_ready: "pgvector must be installed before backfilling connected RAG embeddings.",
  schema_not_ready: "Run shared schema migrations before backfilling connected RAG embeddings.",
  embedding_unavailable: "Configure a ready embedding provider before backfilling local RAG chunks.",
  embedding_model_missing: "Embedding provider status must include a model before backfill can run.",
  local_rag_empty: "No local citation-backed RAG chunks are available for backfill.",
  runner_unavailable: "Desktop RAG backfill runner is unavailable."
};

const nonBlank = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && value.trim().length > 0;

const chunkKey = (result: DesktopWorkspaceRagResult): string =>
  `${result.revisionId}\n${result.chunkId}`;

export const buildDesktopPostgresRagBackfillReadiness = ({
  mode,
  postgresStatus,
  embeddingStatus,
  localResults,
  runnerAvailable
}: DesktopPostgresRagBackfillReadinessInput): DesktopPostgresRagBackfillReadiness => {
  const disabledReasons: DesktopPostgresRagBackfillDisabledReason[] = [];
  if (mode !== "workspace") disabledReasons.push("not_workspace_mode");
  if (!postgresStatus.configured) disabledReasons.push("postgres_not_configured");
  if (postgresStatus.state !== "ready") disabledReasons.push("postgres_not_ready");
  if (!postgresStatus.vectorInstalled) disabledReasons.push("pgvector_not_ready");
  if (!postgresStatus.schemaReady || postgresStatus.migrationState !== "ready") {
    disabledReasons.push("schema_not_ready");
  }
  if (embeddingStatus.state !== "ready" || !embeddingStatus.configured) {
    disabledReasons.push("embedding_unavailable");
  }
  if (!nonBlank(embeddingStatus.model)) disabledReasons.push("embedding_model_missing");
  if (localResults.length === 0) disabledReasons.push("local_rag_empty");
  if (!runnerAvailable) disabledReasons.push("runner_unavailable");

  const firstReason = disabledReasons[0];
  return {
    disabled: disabledReasons.length > 0,
    disabledReasons,
    message: firstReason ? readinessMessage[firstReason] : "Connected RAG embedding backfill is ready."
  };
};

export const buildDesktopPostgresRagBackfillEmbeddingPlan = (
  localResults: readonly DesktopWorkspaceRagResult[]
): DesktopPostgresRagBackfillEmbeddingPlan => {
  const seen = new Set<string>();
  const items: DesktopPostgresRagBackfillEmbeddingPlanItem[] = [];
  let skippedDuplicateCount = 0;
  let skippedBlankTextCount = 0;

  localResults.forEach((result) => {
    const key = chunkKey(result);
    if (seen.has(key)) {
      skippedDuplicateCount += 1;
      return;
    }
    seen.add(key);
    const text = result.text.trim();
    if (!text) {
      skippedBlankTextCount += 1;
      return;
    }
    items.push({
      id: result.id,
      revisionId: result.revisionId,
      chunkId: result.chunkId,
      text
    });
  });

  return {
    items,
    embeddingItems: items.map((item) => ({ id: item.id, text: item.text })),
    skippedDuplicateCount,
    skippedBlankTextCount
  };
};

export const buildDesktopPostgresRagBackfillRequest = ({
  plan,
  embeddingResult,
  embeddingModel,
  fallbackEmbeddingDim,
  distanceMetric
}: DesktopPostgresRagBackfillRequestBuildInput): DesktopPostgresRagBackfillRequestBuildResult => {
  const planItemsById = new Map(plan.items.map((item) => [item.id, item]));
  const readyItems: PostgresRagEmbeddingBackfillItem[] = [];
  let skippedEmbeddingCount = 0;
  let embeddingDim = embeddingResult.dimension ?? fallbackEmbeddingDim ?? undefined;

  embeddingResult.items.forEach((item) => {
    const planItem = planItemsById.get(item.id);
    if (!planItem || item.state !== "ready" || !item.embedding || item.embedding.length === 0) {
      skippedEmbeddingCount += 1;
      return;
    }
    embeddingDim = item.dimension ?? embeddingDim;
    readyItems.push({
      revisionId: planItem.revisionId,
      chunkId: planItem.chunkId,
      embedding: item.embedding
    });
  });

  if (readyItems.length === 0) {
    return {
      request: null,
      readyItemCount: 0,
      skippedEmbeddingCount,
      message: "Embedding provider did not return any usable chunk vectors."
    };
  }

  return {
    request: {
      embeddingModel,
      ...(embeddingDim === undefined ? {} : { embeddingDim }),
      ...(distanceMetric === undefined ? {} : { distanceMetric }),
      items: readyItems
    },
    readyItemCount: readyItems.length,
    skippedEmbeddingCount,
    message: `${readyItems.length} chunk embedding${readyItems.length === 1 ? "" : "s"} ready for Postgres backfill.`
  };
};

export const formatDesktopPostgresRagBackfillCompletionMessage = ({
  detail,
  fallback,
  skippedDuplicateCount,
  skippedBlankTextCount,
  skippedEmbeddingCount
}: DesktopPostgresRagBackfillCompletionMessageInput): string => {
  const skippedCount = skippedDuplicateCount + skippedBlankTextCount + skippedEmbeddingCount;
  const skippedCopy = skippedCount > 0
    ? ` ${skippedCount} chunk${skippedCount === 1 ? "" : "s"} skipped.`
    : "";
  return `${detail || fallback}${skippedCopy}`;
};
