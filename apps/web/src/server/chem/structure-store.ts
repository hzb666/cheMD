import type { StructureRecord } from "./dto";

const TTL_MS = 5 * 60 * 1000;
const MAX_RECORDS = 256;
const records = new Map<string, StructureRecord>();

const toKey = (documentId: string, blockId: string, sessionId: string): string =>
  `${sessionId}::${documentId}::${blockId}`;

const isExpired = (record: StructureRecord): boolean => Date.parse(record.expiresAt) <= Date.now();

const pruneExpired = (): void => {
  for (const [key, record] of records) {
    if (isExpired(record)) {
      records.delete(key);
    }
  }
};

const pruneOverflow = (): void => {
  while (records.size >= MAX_RECORDS) {
    const oldestKey = records.keys().next().value;
    if (!oldestKey) {
      return;
    }
    records.delete(oldestKey);
  }
};

export const saveStructureRecord = (
  input: Omit<StructureRecord, "updatedAt" | "expiresAt" | "kind">
): StructureRecord => {
  pruneExpired();
  pruneOverflow();
  const now = new Date();
  const next: StructureRecord = {
    ...input,
    kind: "molecule",
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString()
  };
  records.set(toKey(input.documentId, input.blockId, input.sessionId), next);
  return next;
};

export const getStructureRecord = (
  documentId: string,
  blockId: string,
  sessionId: string
): StructureRecord | undefined => {
  pruneExpired();
  const key = toKey(documentId, blockId, sessionId);
  const record = records.get(key);
  if (!record) {
    return undefined;
  }

  if (isExpired(record)) {
    records.delete(key);
    return undefined;
  }

  return record;
};
