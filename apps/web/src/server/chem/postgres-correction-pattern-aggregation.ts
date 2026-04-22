import type { PostgresQueryClient } from "./postgres-storage";

export interface RecomputeCorrectionPatternsResult {
  recomputed: number;
  deleted: number;
  patternIds: string[];
}

interface RowsResult<Row> {
  rows: Row[];
}

interface RowCountResult {
  rowCount?: number | null;
}

interface CorrectionPatternRow {
  pattern_id: unknown;
}

const upsertAggregateCorrectionPatternsSql = `
WITH condition_events AS (
  SELECT
    event_id,
    COALESCE(NULLIF(reaction_family, ''), 'unknown') AS reaction_family,
    NULLIF(after_value->>'field', '') AS source_field,
    COALESCE(NULLIF(before_value->>'value', ''), 'missing') AS old_role,
    COALESCE(NULLIF(after_value->>'value', ''), 'missing') AS new_role,
    training_uses
  FROM chemd_training_experience_events
  WHERE event_type = 'condition_updated'
    AND after_value ? 'field'
    AND NULLIF(after_value->>'field', '') IS NOT NULL
),
grouped_patterns AS (
  SELECT
    reaction_family,
    source_field,
    old_role,
    new_role,
    COUNT(DISTINCT event_id)::integer AS support_count,
    array_remove(array_agg(DISTINCT uses.training_use), NULL)::text[] AS training_uses
  FROM condition_events
  LEFT JOIN LATERAL unnest(condition_events.training_uses) AS uses(training_use) ON true
  GROUP BY reaction_family, source_field, old_role, new_role
),
upserted_patterns AS (
  INSERT INTO chemd_correction_patterns (
    pattern_id, reaction_family, source_field, old_role, new_role,
    evidence_phrase_pattern, support_count, confidence, promoted_to_rule,
    training_uses, quality_tier
  )
  SELECT
    concat(
      'correction::aggregate::',
      md5(concat_ws('|', reaction_family, source_field, old_role, new_role))
    ) AS pattern_id,
    reaction_family,
    source_field,
    old_role,
    new_role,
    concat(source_field, ': ', old_role, ' -> ', new_role) AS evidence_phrase_pattern,
    support_count,
    LEAST(0.95, 0.5 + LN(support_count + 1.0) / 10.0) AS confidence,
    false AS promoted_to_rule,
    COALESCE(training_uses, ARRAY[]::text[]) AS training_uses,
    CASE
      WHEN support_count >= 10 THEN 'gold'
      WHEN support_count >= 3 THEN 'silver'
      ELSE 'bronze'
    END AS quality_tier
  FROM grouped_patterns
  ON CONFLICT (pattern_id) DO UPDATE SET
    reaction_family = EXCLUDED.reaction_family,
    source_field = EXCLUDED.source_field,
    old_role = EXCLUDED.old_role,
    new_role = EXCLUDED.new_role,
    evidence_phrase_pattern = EXCLUDED.evidence_phrase_pattern,
    support_count = EXCLUDED.support_count,
    confidence = EXCLUDED.confidence,
    training_uses = EXCLUDED.training_uses,
    quality_tier = EXCLUDED.quality_tier,
    updated_at = now()
  RETURNING pattern_id
)
SELECT pattern_id
FROM upserted_patterns
ORDER BY pattern_id`;

const deleteStaleAggregateCorrectionPatternsSql = `
DELETE FROM chemd_correction_patterns
WHERE pattern_id LIKE 'correction::aggregate::%'
  AND NOT (pattern_id = ANY($1::text[]))`;

const withTransaction = async <T>(
  client: PostgresQueryClient,
  operation: () => Promise<T>
): Promise<T> => {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const readRows = <Row>(result: unknown): Row[] => {
  if (
    typeof result !== "object" ||
    result === null ||
    !Array.isArray((result as { rows?: unknown }).rows)
  ) {
    throw new TypeError("Postgres query result must include rows");
  }
  return (result as RowsResult<Row>).rows;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
};

const readRowCount = (result: unknown): number => {
  if (typeof result !== "object" || result === null) {
    throw new TypeError("Postgres query result must include rowCount");
  }
  const rowCount = (result as RowCountResult).rowCount;
  if (typeof rowCount !== "number") {
    throw new TypeError("Postgres query result must include rowCount");
  }
  return rowCount;
};

export const recomputeCorrectionPatterns = async (
  client: PostgresQueryClient
): Promise<RecomputeCorrectionPatternsResult> => {
  return withTransaction(client, async () => {
    const result = await client.query(upsertAggregateCorrectionPatternsSql);
    const patternIds = readRows<CorrectionPatternRow>(result).map((row) =>
      requireString(row.pattern_id, "pattern_id")
    );
    const deleteResult = await client.query(
      deleteStaleAggregateCorrectionPatternsSql,
      [patternIds]
    );

    return {
      recomputed: patternIds.length,
      deleted: readRowCount(deleteResult),
      patternIds
    };
  });
};
