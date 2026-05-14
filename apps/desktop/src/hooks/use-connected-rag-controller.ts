import { useEffect, useMemo, useState } from "react";

import type {
  CreateEmbeddingVectorResult,
  EmbeddingProviderStatus,
  PostgresRagQueryResult,
  PostgresStatus,
  WorkspaceFileEntry,
  WorkspaceHandle
} from "../desktop-contracts";
import type { DocumentMode, RagQueryOperationState } from "../desktop-types";
import { getCommandErrorMessage, invokeDesktop } from "../desktop-utils";
import type { DesktopWorkspaceIndexViewModel } from "../workspace-index/desktop-workspace-index";
import {
  buildDesktopPostgresRagQueryControllerState,
  type DesktopPostgresRagQueryControllerState
} from "../workspace-index/desktop-postgres-rag-query-controller";
import {
  buildDesktopPostgresRagBackfillEmbeddingPlan,
  buildDesktopPostgresRagBackfillReadiness,
  buildDesktopPostgresRagBackfillRequest,
  formatDesktopPostgresRagBackfillCompletionMessage
} from "../workspace-index/desktop-postgres-rag-backfill-controller";

const initialEmbeddingProviderStatus: EmbeddingProviderStatus = {
  state: "offline",
  configured: false,
  providerKind: "http_env",
  model: null,
  embeddingDim: null,
  distanceMetric: null,
  baseUrlHost: null,
  timeoutMs: null,
  apiKeyConfigured: false,
  detail: "Embedding provider status has not been loaded."
};

export const useEmbeddingProviderController = () => {
  const [status, setStatus] = useState<EmbeddingProviderStatus>(initialEmbeddingProviderStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const nextStatus = await invokeDesktop("read_embedding_provider_status", undefined);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError: unknown) {
      setStatus(initialEmbeddingProviderStatus);
      setError(getCommandErrorMessage(nextError, "Embedding provider status unavailable"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    loading,
    error,
    refresh: () => void refresh()
  };
};

export const useConnectedRagQueryController = ({
  mode,
  file,
  workspace,
  postgresStatus,
  embeddingStatus,
  localResults
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  workspace: WorkspaceHandle;
  postgresStatus: PostgresStatus;
  embeddingStatus: EmbeddingProviderStatus;
  localResults: DesktopWorkspaceIndexViewModel["ragResults"];
}) => {
  const [query, setQueryValue] = useState("");
  const [operation, setOperation] = useState<RagQueryOperationState>("idle");
  const [message, setMessage] = useState("Connected RAG needs a configured embedding provider before it can query Postgres.");
  const [commandResult, setCommandResult] = useState<PostgresRagQueryResult | null>(null);
  const [embeddingResult, setEmbeddingResult] = useState<{
    query: string;
    result: CreateEmbeddingVectorResult;
  } | null>(null);
  const [backfillOperation, setBackfillOperation] = useState<RagQueryOperationState>("disabled");
  const [backfillMessage, setBackfillMessage] = useState("Connected RAG embedding backfill needs a ready workspace, Postgres, and embedding provider.");
  const normalizedQuery = query.trim();
  const activeEmbeddingResult = embeddingResult?.query === normalizedQuery ? embeddingResult.result : null;

  const backfillReadiness = useMemo(() => buildDesktopPostgresRagBackfillReadiness({
    mode,
    postgresStatus,
    embeddingStatus,
    localResults,
    runnerAvailable: true
  }), [embeddingStatus, localResults, mode, postgresStatus]);

  const state: DesktopPostgresRagQueryControllerState = useMemo(() => buildDesktopPostgresRagQueryControllerState({
    mode,
    query,
    postgresStatus,
    embedding: {
      providerAvailable: embeddingStatus.state === "ready",
      vector: activeEmbeddingResult?.state === "ready" ? activeEmbeddingResult.embedding : null,
      model: activeEmbeddingResult?.model ?? embeddingStatus.model,
      distanceMetric: embeddingStatus.distanceMetric ?? undefined
    },
    runnerAvailable: true,
    localResults,
    commandResult,
    workspaceId: workspace.workspaceId,
    documentId: file.path,
    limit: 8
  }), [activeEmbeddingResult, commandResult, embeddingStatus, file.path, localResults, mode, postgresStatus, query, workspace.workspaceId]);

  useEffect(() => {
    setCommandResult(null);
    setEmbeddingResult(null);
    setOperation(normalizedQuery ? "idle" : "disabled");
    setMessage(normalizedQuery
      ? state.message
      : "Enter a query to search connected RAG when an embedding vector is available.");
  }, [embeddingStatus, file.id, mode, postgresStatus, query, workspace.workspaceId]);

  useEffect(() => {
    setBackfillOperation(backfillReadiness.disabled ? "disabled" : "idle");
    setBackfillMessage(backfillReadiness.message);
  }, [backfillReadiness, file.id, workspace.workspaceId]);

  const setQuery = (nextQuery: string) => setQueryValue(nextQuery);

  const run = async () => {
    if (operation === "pending") return;
    if (state.readiness.disabled) {
      setOperation("disabled");
      setMessage(state.message);
      return;
    }
    const queryText = state.query;
    setOperation("pending");
    setMessage("Creating query embedding vector.");
    try {
      const embedding = await invokeDesktop("create_embedding_vector", {
        input: { text: queryText }
      });
      setEmbeddingResult({ query: queryText, result: embedding });
      if (embedding.state !== "ready" || embedding.embedding.length === 0 || !embedding.model) {
        setOperation("failure");
        setMessage(embedding.detail || "Embedding provider did not return a usable vector.");
        return;
      }
      const readyState = buildDesktopPostgresRagQueryControllerState({
        mode,
        query: queryText,
        postgresStatus,
        embedding: {
          providerAvailable: true,
          vector: embedding.embedding,
          model: embedding.model,
          distanceMetric: embeddingStatus.distanceMetric ?? undefined
        },
        runnerAvailable: true,
        localResults,
        commandResult: null,
        workspaceId: workspace.workspaceId,
        documentId: file.path,
        limit: 8
      });
      if (!readyState.request) {
        setOperation("failure");
        setMessage(readyState.message);
        return;
      }
      setMessage("Querying connected Postgres RAG.");
      const result = await invokeDesktop("query_postgres_rag", { input: readyState.request });
      setCommandResult(result);
      setOperation(result.state === "ready" ? "success" : "failure");
      setMessage(result.detail || readyState.message);
    } catch (error: unknown) {
      setOperation("failure");
      setMessage(getCommandErrorMessage(error, "Connected RAG query failed"));
    }
  };

  const backfill = async () => {
    if (backfillOperation === "pending") return;
    if (backfillReadiness.disabled) {
      setBackfillOperation("disabled");
      setBackfillMessage(backfillReadiness.message);
      return;
    }
    const plan = buildDesktopPostgresRagBackfillEmbeddingPlan(localResults);
    if (plan.embeddingItems.length === 0) {
      setBackfillOperation("failure");
      setBackfillMessage("No local RAG chunks include full text for embedding backfill.");
      return;
    }
    const model = embeddingStatus.model?.trim();
    if (!model) {
      setBackfillOperation("failure");
      setBackfillMessage("Embedding provider status must include a model before backfill can run.");
      return;
    }
    setBackfillOperation("pending");
    setBackfillMessage(`Creating embedding vectors for ${plan.embeddingItems.length} local RAG chunk${plan.embeddingItems.length === 1 ? "" : "s"}.`);
    try {
      const embeddingBatch = await invokeDesktop("create_embedding_vectors", {
        input: { items: plan.embeddingItems }
      });
      const requestBuild = buildDesktopPostgresRagBackfillRequest({
        plan,
        embeddingResult: embeddingBatch,
        embeddingModel: embeddingBatch.model ?? model,
        fallbackEmbeddingDim: embeddingStatus.embeddingDim,
        distanceMetric: embeddingStatus.distanceMetric ?? undefined
      });
      if (!requestBuild.request) {
        setBackfillOperation("failure");
        setBackfillMessage(requestBuild.message);
        return;
      }
      setBackfillMessage("Writing connected RAG embedding vectors to Postgres.");
      const result = await invokeDesktop("backfill_postgres_rag_embeddings", {
        input: requestBuild.request
      });
      setBackfillOperation(result.state === "ready" ? "success" : "failure");
      setBackfillMessage(formatDesktopPostgresRagBackfillCompletionMessage({
        detail: result.detail,
        fallback: requestBuild.message,
        skippedDuplicateCount: plan.skippedDuplicateCount,
        skippedBlankTextCount: plan.skippedBlankTextCount,
        skippedEmbeddingCount: requestBuild.skippedEmbeddingCount
      }));
    } catch (error: unknown) {
      setBackfillOperation("failure");
      setBackfillMessage(getCommandErrorMessage(error, "Connected RAG embedding backfill failed"));
    }
  };

  return {
    query,
    setQuery,
    state,
    operation,
    message,
    backfillOperation,
    backfillMessage,
    run: () => void run(),
    backfill: () => void backfill()
  };
};

