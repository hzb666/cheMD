let fallbackTokenCounter = 0;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const createScopedToken = (prefix: string): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (typeof randomUuid === "string" && randomUuid.length > 0) {
    return randomUuid;
  }

  const getRandomValues = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (getRandomValues) {
    const bytes = new Uint8Array(16);
    getRandomValues(bytes);
    return `${prefix}-${toHex(bytes)}`;
  }

  fallbackTokenCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackTokenCounter.toString(36)}`;
};
