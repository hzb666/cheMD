import { classifyCasNumber } from "./cas-classifier";

export interface PubChemNotationMetadata {
  casNumber: string | null;
  preferredName: string | null;
}

const PUBCHEM_PUG_REST_BASE_URL =
  process.env.PUBCHEM_PUG_REST_BASE_URL?.trim()
  || "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

const PUBCHEM_CID_LOOKUP_LIMIT = 5;

const readPubChemTimeoutMs = (): number => {
  const raw = process.env.PUBCHEM_PUG_REST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 10000;
};

const PUBCHEM_PUG_REST_TIMEOUT_MS = readPubChemTimeoutMs();

const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
};

const buildPubChemLookupUrl = (cas: string): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/xref/RN/${encodeURIComponent(cas)}/property/SMILES/JSON`;

const buildPubChemSynonymsByCasUrl = (cas: string): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/xref/RN/${encodeURIComponent(cas)}/synonyms/JSON`;

const buildPubChemSynonymsBySmilesUrl = (value: string): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/smiles/${encodeURIComponent(value)}/synonyms/JSON`;

const buildPubChemSynonymsByNameUrl = (value: string): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/name/${encodeURIComponent(value)}/synonyms/JSON`;

const buildPubChemCidsBySmilesUrl = (value: string): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/smiles/${encodeURIComponent(value)}/cids/JSON`;

const buildPubChemCidsByNameUrl = (value: string): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/name/${encodeURIComponent(value)}/cids/JSON`;

const buildPubChemSynonymsByCidUrl = (cid: number): string =>
  `${PUBCHEM_PUG_REST_BASE_URL}/compound/cid/${encodeURIComponent(String(cid))}/synonyms/JSON`;

const extractPubChemSmiles = (payload: unknown): string | null => {
  const properties = Array.isArray((payload as { PropertyTable?: { Properties?: unknown } })?.PropertyTable?.Properties)
    ? (payload as { PropertyTable: { Properties: Array<Record<string, unknown>> } }).PropertyTable.Properties
    : [];

  for (const property of properties) {
    for (const key of ["SMILES", "CanonicalSMILES", "ConnectivitySMILES", "IsomericSMILES"] as const) {
      const value = property[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return null;
};

const extractPubChemSynonyms = (payload: unknown): string[] => {
  const informationEntries = Array.isArray(
    (payload as { InformationList?: { Information?: unknown } })?.InformationList?.Information
  )
    ? (payload as { InformationList: { Information: Array<Record<string, unknown>> } }).InformationList.Information
    : [];

  for (const entry of informationEntries) {
    const synonyms = entry.Synonym;
    if (!Array.isArray(synonyms)) {
      continue;
    }

    return synonyms.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  return [];
};

const extractPubChemCids = (payload: unknown): number[] => {
  const rawCids = Array.isArray((payload as { IdentifierList?: { CID?: unknown } })?.IdentifierList?.CID)
    ? (payload as { IdentifierList: { CID: unknown[] } }).IdentifierList.CID
    : [];

  return rawCids
    .map((item) => (typeof item === "number" ? item : Number.NaN))
    .filter((item) => Number.isInteger(item) && item > 0);
};

const findFirstValidCasNumber = (values: string[]): string | null => {
  for (const value of values) {
    const classification = classifyCasNumber(value);
    if (classification.kind === "cas") {
      return classification.cas;
    }
  }

  return null;
};

const findPreferredPubChemName = (values: string[]): string | null => {
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    if (classifyCasNumber(trimmed).kind === "cas") {
      continue;
    }

    return trimmed;
  }

  return null;
};

const createNotationMetadata = (values: string[]): PubChemNotationMetadata => ({
  casNumber: findFirstValidCasNumber(values),
  preferredName: findPreferredPubChemName(values)
});

const hasNotationMetadata = (value: PubChemNotationMetadata): boolean =>
  Boolean(value.casNumber || value.preferredName);

const fetchPubChemPayload = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<unknown | null> => {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json"
      },
      signal: createTimeoutSignal(PUBCHEM_PUG_REST_TIMEOUT_MS)
    });
  } catch {
    return null;
  }

  if (response.status === 404 || !response.ok) {
    return null;
  }

  return response.json().catch(() => null);
};

const fetchPubChemPreferredNameByUrl = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<string | null> => {
  const payload = await fetchPubChemPayload(url, fetchImpl);
  return findPreferredPubChemName(extractPubChemSynonyms(payload));
};

const fetchPubChemNotationMetadataByUrl = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<PubChemNotationMetadata> => {
  const payload = await fetchPubChemPayload(url, fetchImpl);
  return createNotationMetadata(extractPubChemSynonyms(payload));
};

const fetchPubChemNotationMetadataByCidLookupUrl = async (
  url: string,
  fetchImpl: typeof fetch
): Promise<PubChemNotationMetadata> => {
  const payload = await fetchPubChemPayload(url, fetchImpl);
  const cids = extractPubChemCids(payload).slice(0, PUBCHEM_CID_LOOKUP_LIMIT);

  for (const cid of cids) {
    const synonymsPayload = await fetchPubChemPayload(buildPubChemSynonymsByCidUrl(cid), fetchImpl);
    const metadata = createNotationMetadata(extractPubChemSynonyms(synonymsPayload));
    if (hasNotationMetadata(metadata)) {
      return metadata;
    }
  }

  return {
    casNumber: null,
    preferredName: null
  };
};

export const lookupPubChemSmilesByCasRemote = async (
  cas: string,
  fetchImpl: typeof fetch
): Promise<string | null> => {
  let response: Response;

  try {
    response = await fetchImpl(buildPubChemLookupUrl(cas), {
      headers: {
        Accept: "application/json"
      },
      signal: createTimeoutSignal(PUBCHEM_PUG_REST_TIMEOUT_MS)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(message, { cause: error });
  }

  // 404 表示 PubChem 明确认定没有该 RN；
  // 上层需要把它映射成稳定的 CAS_NOT_FOUND，而不是上游故障。
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    // 其他非 2xx 说明远端服务失败或限流；
    // 上层需要保留 502 语义，不能和“未命中”揉成一类。
    throw new Error(String(response.status));
  }

  const payload = await response.json().catch(() => null);
  return extractPubChemSmiles(payload);
};

export const lookupPubChemNotationMetadataByCasRemote = async (
  cas: string,
  fetchImpl: typeof fetch
): Promise<PubChemNotationMetadata> => ({
  casNumber: cas,
  preferredName: await fetchPubChemPreferredNameByUrl(buildPubChemSynonymsByCasUrl(cas), fetchImpl)
});

export const lookupPubChemNotationMetadataByNotationRemote = async (
  value: string,
  fetchImpl: typeof fetch
): Promise<PubChemNotationMetadata> => {
  const bySmiles = await fetchPubChemNotationMetadataByUrl(buildPubChemSynonymsBySmilesUrl(value), fetchImpl);
  if (hasNotationMetadata(bySmiles)) {
    return bySmiles;
  }

  const bySmilesCid = await fetchPubChemNotationMetadataByCidLookupUrl(
    buildPubChemCidsBySmilesUrl(value),
    fetchImpl
  );
  if (hasNotationMetadata(bySmilesCid)) {
    return bySmilesCid;
  }

  const byName = await fetchPubChemNotationMetadataByUrl(buildPubChemSynonymsByNameUrl(value), fetchImpl);
  if (hasNotationMetadata(byName)) {
    return byName;
  }

  return fetchPubChemNotationMetadataByCidLookupUrl(buildPubChemCidsByNameUrl(value), fetchImpl);
};
