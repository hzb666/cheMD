import { classifyCasNumber } from "./cas-classifier";
import {
  getOrCreateCachedNotationMetadata,
  getOrCreateCachedSmilesLookup
} from "./cas-resolution-cache";
import type { PubChemNotationMetadata } from "./pubchem-client";
import {
  lookupPubChemNotationMetadataByCasRemote,
  lookupPubChemNotationMetadataByNotationRemote,
  lookupPubChemSmilesByCasRemote
} from "./pubchem-client";

export { classifyCasNumber } from "./cas-classifier";

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

  const fetchImpl = options.fetchImpl ?? fetch;
  return getOrCreateCachedSmilesLookup(classification.cas, async () => {
    try {
      const smiles = await lookupPubChemSmilesByCasRemote(classification.cas, fetchImpl);
      if (!smiles) {
        throw new CasResolutionError(`PubChem did not find a compound for CAS "${classification.cas}".`, {
          status: 422,
          code: "CAS_NOT_FOUND"
        });
      }
      return smiles;
    } catch (error) {
      if (isCasResolutionError(error)) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "unknown error";
      throw new CasResolutionError(`PubChem lookup failed for CAS "${classification.cas}": ${message}`, {
        status: 502,
        code: "PUBCHEM_LOOKUP_FAILED"
      });
    }
  });
};

export const lookupPubChemNotationMetadata = async (
  value: string,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<PubChemNotationMetadata> => {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      casNumber: null,
      preferredName: null
    };
  }

  const classification = classifyCasNumber(trimmed);
  if (classification.kind === "cas") {
    return getOrCreateCachedNotationMetadata(trimmed, async () =>
      lookupPubChemNotationMetadataByCasRemote(classification.cas, options.fetchImpl ?? fetch)
    );
  }

  if (classification.kind === "invalid") {
    // inventory 展示不该因为无效 CAS 直接抛错；
    // 这里返回空元数据，由上层决定是否提示用户。
    return {
      casNumber: null,
      preferredName: null
    };
  }

  // 非 CAS 输入按“SMILES 直查 -> SMILES 转 CID -> 名称直查 -> 名称转 CID”
  // 兜底，命中首个稳定结果就停止，避免 preferredName 在不同请求间抖动。
  return getOrCreateCachedNotationMetadata(trimmed, async () =>
    lookupPubChemNotationMetadataByNotationRemote(trimmed, options.fetchImpl ?? fetch)
  );
};

export const lookupPubChemCasByNotation = async (
  value: string,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<string | null> => {
  const metadata = await lookupPubChemNotationMetadata(value, options);
  return metadata.casNumber;
};

export const lookupPubChemPreferredNameByNotation = async (
  value: string,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): Promise<string | null> => {
  const metadata = await lookupPubChemNotationMetadata(value, options);
  return metadata.preferredName;
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
