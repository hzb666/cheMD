import { isCasResolutionError } from "./cas-resolver";
import { readErrorCode } from "./chem-service-error";

const CAS_RESOLUTION_CODES = new Set([
  "INVALID_CAS",
  "CAS_NOT_FOUND",
  "PUBCHEM_LOOKUP_FAILED"
] as const);

export const isKnownCasResolutionCode = (code: string | undefined): boolean =>
  typeof code === "string" && CAS_RESOLUTION_CODES.has(code as typeof CAS_RESOLUTION_CODES extends Set<infer T> ? T : never);

export const isKnownCasResolutionError = (
  error: unknown
): error is { status: number; code: string; message: string } =>
  isCasResolutionError(error) && isKnownCasResolutionCode(readErrorCode(error));
