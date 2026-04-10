export class ChemServiceError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, options: { status: number; code?: string }) {
    super(message);
    this.name = "ChemServiceError";
    this.status = options.status;
    this.code = options.code;
  }
}

export const isChemServiceError = (
  error: unknown
): error is ChemServiceError & { status: number; code?: string } =>
  error instanceof ChemServiceError
  || (
    typeof error === "object"
    && error !== null
    && typeof (error as { status?: unknown }).status === "number"
    && typeof (error as { message?: unknown }).message === "string"
  );

export const readErrorStatus = (error: unknown, fallback: number): number =>
  typeof error === "object"
  && error !== null
  && typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : fallback;

export const readErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;

export const readErrorCode = (error: unknown): string | undefined =>
  typeof error === "object"
  && error !== null
  && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
