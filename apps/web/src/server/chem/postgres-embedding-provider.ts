import type {
  EmbeddingProvider,
  PgvectorDistanceMetric,
  RagEmbeddingModelConfig
} from "./postgres-rag";

export interface EmbeddingRuntimeEnv {
  [key: string]: string | undefined;
  CHEMD_EMBEDDING_BASE_URL?: string;
  CHEMD_EMBEDDING_PATH?: string;
  CHEMD_EMBEDDING_API_KEY?: string;
  CHEMD_EMBEDDING_MODEL?: string;
  CHEMD_EMBEDDING_DIM?: string;
  CHEMD_EMBEDDING_TIMEOUT_MS?: string;
  CHEMD_EMBEDDING_DISTANCE_METRIC?: string;
}

export interface HttpEmbeddingProviderConfig extends RagEmbeddingModelConfig {
  baseUrl: string;
  path: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface RuntimeEmbeddingProvider {
  provider: EmbeddingProvider;
  model: RagEmbeddingModelConfig;
}

export interface CreateRuntimeEmbeddingProviderOptions {
  env?: EmbeddingRuntimeEnv;
  fetchImpl?: typeof fetch;
}

const DEFAULT_EMBEDDING_PATH = "/embed";
const DEFAULT_EMBEDDING_TIMEOUT_MS = 30_000;
const distanceMetrics = new Set<string>(["cosine", "l2", "inner_product"]);

const readRequiredString = (
  value: string | undefined,
  name: string
): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
};

const readPositiveInteger = (
  value: string | undefined,
  name: string,
  fallback?: number
): number => {
  if (value === undefined || value.trim() === "") {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`${name} is required`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return parsed;
};

const readDistanceMetric = (
  value: string | undefined
): PgvectorDistanceMetric | undefined => {
  const metric = value?.trim();
  if (!metric) {
    return undefined;
  }
  if (!distanceMetrics.has(metric)) {
    throw new TypeError("CHEMD_EMBEDDING_DISTANCE_METRIC is invalid");
  }
  return metric as PgvectorDistanceMetric;
};

export const parseEmbeddingProviderConfig = (
  env: EmbeddingRuntimeEnv
): HttpEmbeddingProviderConfig => ({
  baseUrl: readRequiredString(
    env.CHEMD_EMBEDDING_BASE_URL,
    "CHEMD_EMBEDDING_BASE_URL"
  ),
  path: env.CHEMD_EMBEDDING_PATH?.trim() || DEFAULT_EMBEDDING_PATH,
  apiKey: env.CHEMD_EMBEDDING_API_KEY?.trim() || undefined,
  embeddingModel: readRequiredString(
    env.CHEMD_EMBEDDING_MODEL,
    "CHEMD_EMBEDDING_MODEL"
  ),
  embeddingDim: readPositiveInteger(
    env.CHEMD_EMBEDDING_DIM,
    "CHEMD_EMBEDDING_DIM"
  ),
  timeoutMs: readPositiveInteger(
    env.CHEMD_EMBEDDING_TIMEOUT_MS,
    "CHEMD_EMBEDDING_TIMEOUT_MS",
    DEFAULT_EMBEDDING_TIMEOUT_MS
  ),
  distanceMetric: readDistanceMetric(env.CHEMD_EMBEDDING_DISTANCE_METRIC)
});

const readEmbeddingValue = (payload: unknown): unknown => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as {
    embedding?: unknown;
    data?: Array<{ embedding?: unknown }>;
  };
  return record.embedding ?? record.data?.[0]?.embedding;
};

const normalizeEmbedding = (
  payload: unknown,
  expectedDim: number
): readonly number[] => {
  const embedding = readEmbeddingValue(payload);
  if (!Array.isArray(embedding) || embedding.length !== expectedDim) {
    throw new TypeError("embedding response dimension does not match CHEMD_EMBEDDING_DIM");
  }
  if (embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new TypeError("embedding response must contain finite numbers");
  }
  return [...embedding];
};

const buildProviderUrl = (config: HttpEmbeddingProviderConfig): string =>
  new URL(config.path, config.baseUrl).toString();

const createHeaders = (config: HttpEmbeddingProviderConfig): Headers => {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json"
  });
  if (config.apiKey) {
    headers.set("Authorization", `Bearer ${config.apiKey}`);
  }
  return headers;
};

export const createHttpEmbeddingProvider = (
  config: HttpEmbeddingProviderConfig,
  fetchImpl: typeof fetch = fetch
): EmbeddingProvider => ({
  async embed(text: string): Promise<readonly number[]> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(buildProviderUrl(config), {
        method: "POST",
        headers: createHeaders(config),
        body: JSON.stringify({
          input: text,
          model: config.embeddingModel
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null) as unknown;
      if (!response.ok) {
        throw new Error(`embedding provider request failed (${response.status})`);
      }
      return normalizeEmbedding(payload, config.embeddingDim);
    } finally {
      globalThis.clearTimeout(timeoutId);
    }
  }
});

export const createRuntimeEmbeddingProvider = (
  options: CreateRuntimeEmbeddingProviderOptions = {}
): RuntimeEmbeddingProvider => {
  const config = parseEmbeddingProviderConfig(options.env ?? process.env);
  return {
    provider: createHttpEmbeddingProvider(config, options.fetchImpl ?? fetch),
    model: {
      embeddingModel: config.embeddingModel,
      embeddingDim: config.embeddingDim,
      distanceMetric: config.distanceMetric
    }
  };
};
