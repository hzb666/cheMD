import {
  compileChemdCore,
  type CompileCoreResult,
  type CompileOptions
} from "./index";

export type ChemdIncrementalCacheStatus = "cold" | "hit" | "changed";

export interface ChemdIncrementalCacheInfo {
  status: ChemdIncrementalCacheStatus;
  cacheKey: string;
  sourceHash: string;
  optionsHash: string;
  revision: number;
}

export interface ChemdIncrementalCompileOutput {
  result: CompileCoreResult;
  cache: ChemdIncrementalCacheInfo;
}

export interface ChemdIncrementalCompilerSnapshot {
  entries: ChemdIncrementalCacheInfo[];
}

export interface ChemdIncrementalCompiler {
  compile(source: string, options?: CompileOptions): ChemdIncrementalCompileOutput;
  invalidate(cacheKey?: string): void;
  snapshot(): ChemdIncrementalCompilerSnapshot;
}

interface CacheEntry {
  result: CompileCoreResult;
  info: ChemdIncrementalCacheInfo;
  source: string;
  optionsKey: string;
}

export const createChemdIncrementalCompiler = (): ChemdIncrementalCompiler => {
  const entries = new Map<string, CacheEntry>();
  let revision = 0;

  return {
    compile(source, options = {}) {
      const sourceHash = hashString(source);
      const optionsKey = stableStringify(options);
      const optionsHash = hashString(optionsKey);
      const cacheKey = `${sourceHash}:${optionsHash}`;
      const cached = entries.get(cacheKey);

      if (cached?.source === source && cached.optionsKey === optionsKey) {
        return {
          result: cached.result,
          cache: { ...cached.info, status: "hit" }
        };
      }

      revision += 1;
      const result = compileChemdCore(source, options);
      const info: ChemdIncrementalCacheInfo = {
        status: entries.size === 0 ? "cold" : "changed",
        cacheKey,
        sourceHash,
        optionsHash,
        revision
      };
      entries.set(cacheKey, {
        result,
        info: { ...info },
        source,
        optionsKey
      });

      return { result, cache: { ...info } };
    },
    invalidate(cacheKey) {
      if (cacheKey) {
        entries.delete(cacheKey);
        return;
      }
      entries.clear();
    },
    snapshot() {
      return {
        entries: [...entries.values()].map((item) => ({ ...item.info }))
      };
    }
  };
};

const hashString = (value: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const stableStringify = (value: unknown): string =>
  JSON.stringify(sortJsonValue(value));

const sortJsonValue = (value: unknown): unknown => {
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)])
  );
};
