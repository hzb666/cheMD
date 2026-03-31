/**
 * In-memory structure cache (server-side).
 *
 * The cache stores temporary `StructureRecord` entries keyed by
 * `documentId + blockId`. Records expire 5 minutes after creation or last
 * update. No database is required for the MVP.
 *
 * NOTE: Because Next.js may run API route handlers in separate worker
 * processes (or restart between requests in development), this in-memory
 * store is intentionally best-effort. It is sufficient for the single-user
 * MVP scenario described in the design document.
 */

export interface StructureRecord {
  documentId: string;
  blockId: string;
  kind: "molecule";
  smiles: string;
  molfile?: string;
  source: "ocr" | "ketcher" | "manual";
  confidence?: number;
  updatedAt: string;
  expiresAt: string;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes

const cacheKey = (documentId: string, blockId: string): string =>
  `${documentId}::${blockId}`;

const nowIso = (): string => new Date().toISOString();
const expiresIso = (): string => new Date(Date.now() + TTL_MS).toISOString();

const store = new Map<string, StructureRecord>();

/** Remove all records whose `expiresAt` is in the past. */
const evictExpired = (): void => {
  const now = Date.now();
  for (const [key, record] of store) {
    if (new Date(record.expiresAt).getTime() < now) {
      store.delete(key);
    }
  }
};

/**
 * Upsert a structure record into the cache.
 *
 * @param record - Full record minus timestamps (those are computed here).
 * @returns The stored `StructureRecord` with computed timestamps.
 */
export const upsertStructureRecord = (
  record: Omit<StructureRecord, "updatedAt" | "expiresAt">
): StructureRecord => {
  evictExpired();
  const full: StructureRecord = {
    ...record,
    updatedAt: nowIso(),
    expiresAt: expiresIso(),
  };
  store.set(cacheKey(record.documentId, record.blockId), full);
  return full;
};

/**
 * Retrieve a structure record from the cache.
 *
 * @param documentId - Document identifier.
 * @param blockId - Block identifier within the document.
 * @returns The `StructureRecord` if found and not expired, otherwise `undefined`.
 */
export const getStructureRecord = (
  documentId: string,
  blockId: string
): StructureRecord | undefined => {
  evictExpired();
  return store.get(cacheKey(documentId, blockId));
};

/**
 * Delete a structure record from the cache.
 *
 * @param documentId - Document identifier.
 * @param blockId - Block identifier within the document.
 */
export const deleteStructureRecord = (documentId: string, blockId: string): void => {
  store.delete(cacheKey(documentId, blockId));
};
