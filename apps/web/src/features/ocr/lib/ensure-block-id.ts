const sanitizeId = (value: string): string => value.trim().replace(/^#/, "");

export const ensureBlockId = (rawId?: string, prefix = "mol"): string => {
  const normalized = typeof rawId === "string" ? sanitizeId(rawId) : "";
  if (normalized) {
    return normalized;
  }

  return `${prefix}-${Date.now()}`;
};
