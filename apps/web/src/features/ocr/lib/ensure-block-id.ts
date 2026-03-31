const sanitizeId = (value: string): string => value.trim().replace(/^#/, "");

export const ensureBlockId = (rawId?: string): string => {
  const normalized = typeof rawId === "string" ? sanitizeId(rawId) : "";
  if (normalized) {
    return normalized;
  }

  return `mol-${Date.now()}`;
};
