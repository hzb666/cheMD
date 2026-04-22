import { describe, expect, it } from "vitest";

import type { PostgresQueryClient } from "./postgres-storage";
import { recomputeCorrectionPatterns } from "./postgres-correction-pattern-aggregation";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const createClient = (
  rows: unknown[]
): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (sql.includes("RETURNING pattern_id")) {
        return { rows };
      }
      if (sql.includes("DELETE FROM chemd_correction_patterns")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
};

const normalizedSql = (call: QueryCall): string =>
  call.sql.replace(/\s+/g, " ").trim();

describe("postgres correction pattern aggregation", () => {
  it("recomputes aggregate correction pattern support from condition events", async () => {
    const client = createClient([
      { pattern_id: "correction::aggregate::abc" },
      { pattern_id: "correction::aggregate::def" }
    ]);

    const result = await recomputeCorrectionPatterns(client);
    const sql = normalizedSql(client.calls.find((call) =>
      call.sql.includes("RETURNING pattern_id")
    ) as QueryCall);

    expect(result).toEqual({
      recomputed: 2,
      deleted: 1,
      patternIds: [
        "correction::aggregate::abc",
        "correction::aggregate::def"
      ]
    });
    expect(client.calls.map(normalizedSql)).toContain("BEGIN");
    expect(client.calls.map(normalizedSql)).toContain("COMMIT");
    expect(sql).toContain("FROM chemd_training_experience_events");
    expect(sql).toContain("COUNT(DISTINCT event_id)::integer AS support_count");
    expect(sql).toContain("ON CONFLICT (pattern_id) DO UPDATE SET");
    expect(client.calls.some((call) =>
      normalizedSql(call).includes("pattern_id LIKE 'correction::aggregate::%'")
    )).toBe(true);
  });

  it("rejects malformed aggregate rows", async () => {
    const client = createClient([{ pattern_id: 42 }]);

    await expect(recomputeCorrectionPatterns(client)).rejects.toThrow(
      "pattern_id must be a string"
    );
    expect(client.calls.map(normalizedSql)).toContain("ROLLBACK");
  });
});
