const sanitizeId = (value: string): string => value.trim().replace(/^#/, "");

export const createSyntheticBlockId = (prefix: string, ordinal: number): string =>
  `${prefix}-missing-id-${ordinal}`;

export const ensureBlockId = (rawId?: string, prefix = "chem", ordinal?: number): string => {
  const normalized = typeof rawId === "string" ? sanitizeId(rawId) : "";
  if (normalized) {
    return normalized;
  }

  if (typeof ordinal === "number" && Number.isInteger(ordinal) && ordinal > 0) {
    return createSyntheticBlockId(prefix, ordinal);
  }

  return `${prefix}-${Date.now()}`;
};
