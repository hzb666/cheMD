const CAS_NUMBER_PATTERN = /^\d{2,7}-\d{2}-\d$/;
const CAS_LIKE_PATTERN = /^[\d-]+$/;

const PUBCHEM_PUG_REST_BASE_URL =
  process.env.PUBCHEM_PUG_REST_BASE_URL?.trim()
  || "https://pubchem.ncbi.nlm.nih.gov/rest/pug";

const readPubChemTimeoutMs = (): number => {
  const raw = process.env.PUBCHEM_PUG_REST_TIMEOUT_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 10000;
};

const PUBCHEM_PUG_REST_TIMEOUT_MS = readPubChemTimeoutMs();

const lookupCache = new Map<string, string>();
const inflightLookupCache = new Map<string, Promise<string>>();

export class CasResolutionError extends Error {
  readonly status: number;
  readonly code: "INVALID_CAS" | "CAS_NOT_FOUND" | "PUBCHEM_LOOKUP_FAILED";

  constructor(
    message: string,
    options: {
      status: number;
      code: "INVALID_CAS" | "CAS_NOT_FOUND" | "PUBCHEM_LOOKUP_FAILED";
    }
  ) {
    super(message);
    this.name = "CasResolutionError";
    this.status = options.status;
    this.code = options.code;
  }
}

export const isCasResolutionError = (
  error: unknown
): error is CasResolutionError & { status: number; code: string } =>
  typeof error === "object"
  && error !== null
  && typeof (error as { status?: unknown }).status === "number"
  && typeof (error as { code?: unknown }).code === "string"
  && typeof (error as { message?: unknown }).message === "string";

type CasClassification =
  | {
      kind: "non-cas";
    }
  | {
      kind: "cas";
      cas: string;
    }
  | {
      kind: "invalid";
      message: string;
    };

const calculateCasChecksum = (value: string): number => {
  const digits = value.replaceAll("-", "");
  const checksumDigit = digits.charCodeAt(digits.length - 1) - 48;
  const payloadDigits = digits.slice(0, -1);

  let sum = 0;
  for (let index = payloadDigits.length - 1, multiplier = 1; index >= 0; index -= 1, multiplier += 1) {
    sum += (payloadDigits.charCodeAt(index) - 48) * multiplier;
  }

  return sum % 10 === checksumDigit ? checksumDigit : -1;
};

export const classifyCasNumber = (value: string): CasClassification => {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("-") || !CAS_LIKE_PATTERN.test(trimmed)) {
    return { kind: "non-cas" };
  }

  if (!CAS_NUMBER_PATTERN.test(trimmed)) {
    return {
      kind: "invalid",
      message: `CAS "${trimmed}" must match the NNNNNNN-NN-N format.`
    };
  }

  if (calculateCasChecksum(trimmed) === -1) {
    return {
      kind: "invalid",
      message: `CAS "${trimmed}" has an invalid checksum.`
    };
  }

  return {
    kind: "cas",
    cas: trimmed
  };
};

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

export const lookupPubChemSmilesByCas = async (
  cas: string,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<string> => {
  const classification = classifyCasNumber(cas);
  if (classification.kind === "invalid") {
    throw new CasResolutionError(classification.message, {
      status: 400,
      code: "INVALID_CAS"
    });
  }

  if (classification.kind !== "cas") {
    throw new CasResolutionError(`"${cas}" is not a CAS number.`, {
      status: 400,
      code: "INVALID_CAS"
    });
  }

  const normalizedCas = classification.cas;
  const cached = lookupCache.get(normalizedCas);
  if (cached) {
    return cached;
  }

  const inflight = inflightLookupCache.get(normalizedCas);
  if (inflight) {
    return inflight;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestPromise = (async () => {
    let response: Response;

    try {
      response = await fetchImpl(buildPubChemLookupUrl(normalizedCas), {
        headers: {
          Accept: "application/json"
        },
        signal: createTimeoutSignal(PUBCHEM_PUG_REST_TIMEOUT_MS)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new CasResolutionError(`PubChem lookup failed for CAS "${normalizedCas}": ${message}`, {
        status: 502,
        code: "PUBCHEM_LOOKUP_FAILED"
      });
    }

    if (response.status === 404) {
      throw new CasResolutionError(`PubChem did not find a compound for CAS "${normalizedCas}".`, {
        status: 422,
        code: "CAS_NOT_FOUND"
      });
    }

    if (!response.ok) {
      throw new CasResolutionError(
        `PubChem lookup failed for CAS "${normalizedCas}" (${response.status}).`,
        {
          status: 502,
          code: "PUBCHEM_LOOKUP_FAILED"
        }
      );
    }

    const payload = await response.json().catch(() => null);
    const smiles = extractPubChemSmiles(payload);
    if (!smiles) {
      throw new CasResolutionError(`PubChem returned no SMILES for CAS "${normalizedCas}".`, {
        status: 422,
        code: "CAS_NOT_FOUND"
      });
    }

    lookupCache.set(normalizedCas, smiles);
    return smiles;
  })().finally(() => {
    inflightLookupCache.delete(normalizedCas);
  });

  inflightLookupCache.set(normalizedCas, requestPromise);
  return requestPromise;
};

export const resolveChemicalNotation = async (
  value: string,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<string> => {
  const trimmed = value.trim();
  const classification = classifyCasNumber(trimmed);
  if (classification.kind === "non-cas") {
    return trimmed;
  }

  if (classification.kind === "invalid") {
    throw new CasResolutionError(classification.message, {
      status: 400,
      code: "INVALID_CAS"
    });
  }

  return lookupPubChemSmilesByCas(classification.cas, options);
};

export const resolveChemicalNotationList = async (
  values: string[],
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<string[]> =>
  Promise.all(values.map((value) => resolveChemicalNotation(value, options)));
