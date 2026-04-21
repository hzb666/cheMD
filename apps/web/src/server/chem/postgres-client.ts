import { Pool } from "pg";

import type { PostgresQueryClient } from "./postgres-storage";

export interface PostgresRuntimeEnv {
  [key: string]: string | undefined;
  CHEMD_POSTGRES_DATABASE_URL?: string;
  DATABASE_URL?: string;
  CHEMD_POSTGRES_POOL_MAX?: string;
  CHEMD_POSTGRES_IDLE_TIMEOUT_MS?: string;
  CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS?: string;
  CHEMD_POSTGRES_ALLOW_EXIT_ON_IDLE?: string;
  CHEMD_POSTGRES_SSL?: string;
}

export interface PostgresRuntimeConfig {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  allowExitOnIdle?: boolean;
  ssl?: boolean;
}

export interface PostgresPoolLike extends PostgresQueryClient {
  end(): Promise<void>;
}

export interface PostgresPoolConstructor {
  new (config: PostgresRuntimeConfig): PostgresPoolLike;
}

export interface PostgresRuntimeClient extends PostgresQueryClient {
  close(): Promise<void>;
}

export interface CreatePostgresRuntimeClientOptions {
  env?: PostgresRuntimeEnv;
  PoolConstructor?: PostgresPoolConstructor;
}

const readDatabaseUrl = (env: PostgresRuntimeEnv): string => {
  const value = env.CHEMD_POSTGRES_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is required");
  }
  return value;
};

const readPositiveInteger = (
  value: string | undefined,
  name: string
): number | undefined => {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return parsed;
};

const readBoolean = (
  value: string | undefined,
  name: string
): boolean | undefined => {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new TypeError(`${name} must be a boolean`);
};

export const parsePostgresRuntimeConfig = (
  env: PostgresRuntimeEnv
): PostgresRuntimeConfig => {
  const config: PostgresRuntimeConfig = {
    connectionString: readDatabaseUrl(env)
  };
  const max = readPositiveInteger(env.CHEMD_POSTGRES_POOL_MAX, "CHEMD_POSTGRES_POOL_MAX");
  const idleTimeoutMillis = readPositiveInteger(
    env.CHEMD_POSTGRES_IDLE_TIMEOUT_MS,
    "CHEMD_POSTGRES_IDLE_TIMEOUT_MS"
  );
  const connectionTimeoutMillis = readPositiveInteger(
    env.CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS,
    "CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS"
  );
  const allowExitOnIdle = readBoolean(
    env.CHEMD_POSTGRES_ALLOW_EXIT_ON_IDLE,
    "CHEMD_POSTGRES_ALLOW_EXIT_ON_IDLE"
  );
  const ssl = readBoolean(env.CHEMD_POSTGRES_SSL, "CHEMD_POSTGRES_SSL");

  if (max !== undefined) {
    config.max = max;
  }
  if (idleTimeoutMillis !== undefined) {
    config.idleTimeoutMillis = idleTimeoutMillis;
  }
  if (connectionTimeoutMillis !== undefined) {
    config.connectionTimeoutMillis = connectionTimeoutMillis;
  }
  if (allowExitOnIdle !== undefined) {
    config.allowExitOnIdle = allowExitOnIdle;
  }
  if (ssl !== undefined) {
    config.ssl = ssl;
  }
  return config;
};

export const createPostgresPoolClient = (
  pool: PostgresPoolLike
): PostgresRuntimeClient => ({
  async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
    return pool.query(sql, values);
  },
  async close(): Promise<void> {
    await pool.end();
  }
});

export const createPostgresRuntimeClient = (
  options: CreatePostgresRuntimeClientOptions = {}
): PostgresRuntimeClient => {
  const config = parsePostgresRuntimeConfig(options.env ?? process.env);
  const PoolConstructor = options.PoolConstructor ?? Pool;
  return createPostgresPoolClient(new PoolConstructor(config));
};
