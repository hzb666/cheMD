import type { PubChemNotationMetadata } from "./pubchem-client";

const lookupCache = new Map<string, string>();
const inflightLookupCache = new Map<string, Promise<string>>();

const notationMetadataCache = new Map<string, PubChemNotationMetadata>();
const inflightNotationMetadataCache = new Map<string, Promise<PubChemNotationMetadata>>();

const hasNotationMetadata = (value: PubChemNotationMetadata): boolean =>
  Boolean(value.casNumber || value.preferredName);

export const getOrCreateCachedSmilesLookup = (
  casNumber: string,
  loader: () => Promise<string>
): Promise<string> => {
  const cached = lookupCache.get(casNumber);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = inflightLookupCache.get(casNumber);
  if (inflight) {
    return inflight;
  }

  // 同一个 CAS 在单进程内只允许飞一条远端请求；
  // 否则多个保存/渲染动作会同时撞上外部限流。
  const requestPromise = loader()
    .then((smiles) => {
      lookupCache.set(casNumber, smiles);
      return smiles;
    })
    .finally(() => {
      inflightLookupCache.delete(casNumber);
    });

  inflightLookupCache.set(casNumber, requestPromise);
  return requestPromise;
};

export const getOrCreateCachedNotationMetadata = (
  value: string,
  loader: () => Promise<PubChemNotationMetadata>
): Promise<PubChemNotationMetadata> => {
  const cached = notationMetadataCache.get(value);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = inflightNotationMetadataCache.get(value);
  if (inflight) {
    return inflight;
  }

  const requestPromise = loader()
    .then((metadata) => {
      // metadata miss 不能永久缓存；
      // 否则 PubChem 稍后补全后，本地仍会一直读到旧空结果。
      if (hasNotationMetadata(metadata)) {
        notationMetadataCache.set(value, metadata);
      }
      return metadata;
    })
    .finally(() => {
      inflightNotationMetadataCache.delete(value);
    });

  inflightNotationMetadataCache.set(value, requestPromise);
  return requestPromise;
};
