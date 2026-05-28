import { describe, expect, it } from "vitest";

import {
  installChemdStorageSchema,
  saveCompiledExperiment,
  type PostgresQueryClient
} from "./postgres-storage";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

const source = `module exp_runtime_storage

meta {
  id: "exp-runtime-storage"
  title: "Runtime Storage"
  date: "2026-04-22"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

molecule mol_a {
  name: "ethanol"
  smiles: "CCO"
}

molecule product {
  name: "product"
}

reaction rxn_main {
  reactants: [@mol_a]
  products: [@product]
  solvent: "THF"
  yield: 81%
}

result res_main for @rxn_main {
  status: success
  yield: 80%
}
`;

const createClient = (failOn?: string): PostgresQueryClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (failOn && sql.includes(failOn)) {
        throw new Error(`failed on ${failOn}`);
      }
      return { rowCount: 1 };
    }
  };
};

const normalizedSql = (call: QueryCall): string => call.sql.replace(/\s+/g, " ").trim();

describe("postgres Chemd storage writer", () => {
  it("installs the storage schema through the injected client", async () => {
    const client = createClient();

    await installChemdStorageSchema(client);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
  });

  it("compiles and writes experiment records in one transaction", async () => {
    const client = createClient();

    const records = await saveCompiledExperiment({
      client,
      source,
      revisionId: "rev-runtime-1",
      commitSha: "commit-runtime"
    });

    const statements = client.calls.map(normalizedSql);
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.findIndex((sql) => sql.includes("chemd_experiments"))).toBeLessThan(
      statements.findIndex((sql) => sql.includes("chemd_experiment_revisions"))
    );
    expect(statements.some((sql) => sql.includes("chemd_compile_artifacts"))).toBe(true);
    expect(statements.some((sql) => sql.includes("chemd_semantic_entities"))).toBe(true);
    expect(statements.some((sql) => sql.includes("chemd_rag_chunks"))).toBe(true);
    expect(records.revision).toMatchObject({
      revisionId: "rev-runtime-1",
      commitSha: "commit-runtime"
    });
  });

  it("rolls back and rethrows when a write fails", async () => {
    const client = createClient("chemd_semantic_entities");

    await expect(saveCompiledExperiment({
      client,
      source,
      revisionId: "rev-runtime-failure"
    })).rejects.toThrow("failed on chemd_semantic_entities");

    const statements = client.calls.map(normalizedSql);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });
});
