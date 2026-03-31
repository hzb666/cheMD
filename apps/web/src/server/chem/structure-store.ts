import type { StructureRecord } from "./dto";

const TTL_MS = 5 * 60 * 1000;
const records = new Map<string, StructureRecord>();

const toKey = (documentId: string, blockId: string): string => `${documentId}::${blockId}`;

const isExpired = (record: StructureRecord): boolean => Date.parse(record.expiresAt) <= Date.now();

const pruneExpired = (): void => {
  for (const [key, record] of records) {
    if (isExpired(record)) {
      records.delete(key);
    }
  }
};

export const saveStructureRecord = (
  input: Omit<StructureRecord, "updatedAt" | "expiresAt" | "kind">
): StructureRecord => {
  pruneExpired();
  const now = new Date();
  const next: StructureRecord = {
    ...input,
    kind: "molecule",
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TTL_MS).toISOString()
  };
  records.set(toKey(input.documentId, input.blockId), next);
  return next;
};

export const getStructureRecord = (
  documentId: string,
  blockId: string
): StructureRecord | undefined => {
  pruneExpired();
  const key = toKey(documentId, blockId);
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
