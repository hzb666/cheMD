import type { RagChunkRecord } from "@chemd/storage-postgres";

import { readStringArray } from "./request-parsers";

export const MAX_RAG_ROUTE_LIMIT = 100;
export const MAX_RAG_SEARCH_EMBEDDING_DIM = 4096;
export const MAX_RAG_QUERY_LENGTH = 2000;

const chunkTypes = new Set<string>([
  "markdown",
  "reaction_summary",
  "result_notes",
  "analysis_notes",
  "sample_notes",
  "artifact_notes",
  "condition_variation",
  "condition_variation_attempt",
  "document_summary"
]);

export const readOptionalRagLimit = (value: unknown): number | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value <= 0 ||
    value > MAX_RAG_ROUTE_LIMIT
  ) {
    return null;
  }
  return value;
};

export const readRagChunkTypes = (
  value: unknown
): readonly RagChunkRecord["chunkType"][] | undefined | null => {
  if (value === undefined) {
    return undefined;
  }
  const values = readStringArray(value);
  if (!values || values.some((chunkType) => !chunkTypes.has(chunkType))) {
    return null;
  }
  return values as RagChunkRecord["chunkType"][];
};
