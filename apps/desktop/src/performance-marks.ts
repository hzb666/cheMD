export type DesktopPerformanceMetadata = Record<string, string | number | boolean | null | undefined>;

export interface DesktopPerformanceMetric {
  name: string;
  durationMs: number;
  startedAt: number;
  metadata?: DesktopPerformanceMetadata;
}

export interface DesktopPerformanceSnapshot {
  metrics: DesktopPerformanceMetric[];
  summary: Record<string, { count: number; totalMs: number; maxMs: number }>;
}

type DesktopPerformanceGlobal = typeof globalThis & {
  __CHEMD_DESKTOP_PERF_ENABLED__?: boolean;
  __CHEMD_DESKTOP_PERF__?: DesktopPerformanceMetric[];
};

const MAX_METRICS = 500;

const performanceGlobal = globalThis as DesktopPerformanceGlobal;

const canUsePerformance = (): boolean =>
  typeof performance !== "undefined" && typeof performance.now === "function";

export const isDesktopPerformanceInstrumentationEnabled = (): boolean =>
  canUsePerformance()
  && (import.meta.env.DEV || performanceGlobal.__CHEMD_DESKTOP_PERF_ENABLED__ === true);

const now = (): number => performance.now();

const readMetrics = (): DesktopPerformanceMetric[] => {
  performanceGlobal.__CHEMD_DESKTOP_PERF__ ??= [];
  return performanceGlobal.__CHEMD_DESKTOP_PERF__;
};

export const recordDesktopPerformanceMetric = (
  name: string,
  durationMs: number,
  metadata?: DesktopPerformanceMetadata
): void => {
  if (!isDesktopPerformanceInstrumentationEnabled()) {
    return;
  }

  const metrics = readMetrics();
  metrics.push({
    name,
    durationMs,
    startedAt: Date.now(),
    metadata,
  });
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }
};

export const measureDesktopPerformance = <Result>(
  name: string,
  operation: () => Result,
  metadata?: DesktopPerformanceMetadata
): Result => {
  if (!isDesktopPerformanceInstrumentationEnabled()) {
    return operation();
  }

  const startedAt = now();
  try {
    return operation();
  } finally {
    recordDesktopPerformanceMetric(name, now() - startedAt, metadata);
  }
};

export const measureDesktopPerformanceAsync = async <Result>(
  name: string,
  operation: () => Promise<Result>,
  metadata?: DesktopPerformanceMetadata
): Promise<Result> => {
  if (!isDesktopPerformanceInstrumentationEnabled()) {
    return operation();
  }

  const startedAt = now();
  try {
    return await operation();
  } finally {
    recordDesktopPerformanceMetric(name, now() - startedAt, metadata);
  }
};

export const getDesktopPerformanceSnapshot = (): DesktopPerformanceSnapshot => {
  const metrics = [...(performanceGlobal.__CHEMD_DESKTOP_PERF__ ?? [])];
  const summary: DesktopPerformanceSnapshot["summary"] = {};

  for (const metric of metrics) {
    const current = summary[metric.name] ?? { count: 0, totalMs: 0, maxMs: 0 };
    current.count += 1;
    current.totalMs += metric.durationMs;
    current.maxMs = Math.max(current.maxMs, metric.durationMs);
    summary[metric.name] = current;
  }

  return { metrics, summary };
};

export const resetDesktopPerformanceMetrics = (): void => {
  performanceGlobal.__CHEMD_DESKTOP_PERF__ = [];
};
