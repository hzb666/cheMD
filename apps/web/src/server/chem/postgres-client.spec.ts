import { describe, expect, it } from "vitest";

import {
  createPostgresPoolClient,
  createPostgresRuntimeClient,
  parsePostgresRuntimeConfig,
  type PostgresPoolConstructor,
  type PostgresPoolConnectionLike,
  type PostgresPoolLike,
  type PostgresRuntimeConfig
} from "./postgres-client";

interface QueryCall {
  sql: string;
  values?: readonly unknown[];
}

class FakePoolConnection implements PostgresPoolConnectionLike {
  readonly calls: QueryCall[] = [];
  released = false;

  async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
    this.calls.push({ sql, values });
    return { rows: [{ connection: true }] };
  }

  release(): void {
    this.released = true;
  }
}

class FakePool implements PostgresPoolLike {
  static instances: FakePool[] = [];

  readonly calls: QueryCall[] = [];
  readonly connections: FakePoolConnection[] = [];
  closed = false;

  constructor(readonly config: PostgresRuntimeConfig) {
    FakePool.instances.push(this);
  }

  async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
    this.calls.push({ sql, values });
    return { rows: [{ ok: true }] };
  }

  async connect(): Promise<PostgresPoolConnectionLike> {
    const connection = new FakePoolConnection();
    this.connections.push(connection);
    return connection;
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

const fakePoolConstructor = FakePool as unknown as PostgresPoolConstructor;

describe("postgres runtime client", () => {
  it("parses runtime config from Chemd-specific env keys", () => {
    const config = parsePostgresRuntimeConfig({
      CHEMD_POSTGRES_DATABASE_URL: " postgres://user:pass@localhost:5432/chemd ",
      CHEMD_POSTGRES_POOL_MAX: "7",
      CHEMD_POSTGRES_IDLE_TIMEOUT_MS: "30000",
      CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS: "2000",
      CHEMD_POSTGRES_ALLOW_EXIT_ON_IDLE: "true",
      CHEMD_POSTGRES_SSL: "false"
    });

    expect(config).toEqual({
      connectionString: "postgres://user:pass@localhost:5432/chemd",
      max: 7,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      allowExitOnIdle: true,
      ssl: false
    });
  });

  it("falls back to DATABASE_URL and rejects missing config", () => {
    expect(parsePostgresRuntimeConfig({
      DATABASE_URL: "postgres://localhost/fallback"
    })).toMatchObject({
      connectionString: "postgres://localhost/fallback"
    });

    expect(() => parsePostgresRuntimeConfig({})).toThrow(
      "CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required"
    );
  });

  it("rejects invalid numeric and boolean config", () => {
    expect(() => parsePostgresRuntimeConfig({
      DATABASE_URL: "postgres://localhost/chemd",
      CHEMD_POSTGRES_POOL_MAX: "0"
    })).toThrow("CHEMD_POSTGRES_POOL_MAX must be a positive integer");

    expect(() => parsePostgresRuntimeConfig({
      DATABASE_URL: "postgres://localhost/chemd",
      CHEMD_POSTGRES_SSL: "sometimes"
    })).toThrow("CHEMD_POSTGRES_SSL must be a boolean");
  });

  it("creates a pool-backed query client from injected runtime config", async () => {
    FakePool.instances = [];

    const client = createPostgresRuntimeClient({
      PoolConstructor: fakePoolConstructor,
      env: {
        CHEMD_POSTGRES_DATABASE_URL: "postgres://localhost/chemd",
        CHEMD_POSTGRES_POOL_MAX: "3"
      }
    });

    await client.query("SELECT $1::text AS name", ["chemd"]);
    await client.close();

    const pool = FakePool.instances[0] as FakePool;
    expect(pool.config).toEqual({
      connectionString: "postgres://localhost/chemd",
      max: 3
    });
    expect(pool.calls).toEqual([
      {
        sql: "SELECT $1::text AS name",
        values: ["chemd"]
      }
    ]);
    expect(pool.closed).toBe(true);
  });

  it("adapts an existing pool without owning config parsing", async () => {
    FakePool.instances = [];
    const pool = new FakePool({
      connectionString: "postgres://localhost/existing"
    });
    const client = createPostgresPoolClient(pool);

    const result = await client.query("SELECT 1");
    await client.close();

    expect(result).toEqual({ rows: [{ ok: true }] });
    expect(pool.calls).toEqual([{ sql: "SELECT 1", values: undefined }]);
    expect(pool.closed).toBe(true);
  });

  it("runs transactions on a single checked-out pool connection", async () => {
    const pool = new FakePool({
      connectionString: "postgres://localhost/existing"
    });
    const client = createPostgresPoolClient(pool);

    const { transaction } = client;
    if (!transaction) {
      throw new Error("expected pool client to expose transaction()");
    }

    const result = await transaction(async (transactionClient) => {
      await transactionClient.query("INSERT INTO chemd VALUES ($1)", ["ok"]);
      return "committed";
    });

    const connection = pool.connections[0] as FakePoolConnection;
    expect(result).toBe("committed");
    expect(pool.calls).toEqual([]);
    expect(connection.calls).toEqual([
      { sql: "BEGIN", values: undefined },
      { sql: "INSERT INTO chemd VALUES ($1)", values: ["ok"] },
      { sql: "COMMIT", values: undefined }
    ]);
    expect(connection.released).toBe(true);
  });
});
