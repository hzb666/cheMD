import type { PostgresGraphRagQuery } from "./graph-rag-types";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export const clampGraphRagListLimit = (limit: number | undefined): number => {
  if (limit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError("limit must be a positive integer");
  }
  return Math.min(limit, MAX_LIST_LIMIT);
};

export const pushGraphRagFilter = (
  clauses: string[],
  values: unknown[],
  column: string,
  value: unknown
): void => {
  if (value === undefined) {
    return;
  }
  values.push(value);
  clauses.push(`${column} = $${values.length}`);
};

export const graphRagWhereClause = (clauses: readonly string[]): string =>
  clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

export const toJsonParam = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);

export const query = (
  sql: string,
  values: readonly unknown[]
): PostgresGraphRagQuery => ({
  sql: sql.trim(),
  values
});
