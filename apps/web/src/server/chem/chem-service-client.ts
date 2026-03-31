/**
 * Low-level HTTP client for the Python chem-service.
 *
 * The base URL is read from the `CHEM_SERVICE_URL` environment variable.
 * Falls back to `http://localhost:8765` for local development.
 *
 * The frontend must NEVER call these functions directly – they are only
 * intended for use inside Next.js API routes (server-side).
 */

import type {
  ChemNormalizeRequest,
  ChemNormalizeResponse,
  ChemOcrResponse,
  ChemRenderRequest,
  ChemRenderResponse,
} from "./dto";

const getBaseUrl = (): string =>
  (process.env.CHEM_SERVICE_URL ?? "http://localhost:8765").replace(/\/$/, "");

const handleResponse = async <T>(response: Response, label: string): Promise<T> => {
  if (!response.ok) {
    let message = `chem-service ${label} failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
};

/**
 * Send an image file to the chem-service OCR endpoint.
 *
 * @param imageBlob - Raw image data as a `Blob` or `File`.
 * @returns Parsed `ChemOcrResponse`.
 */
export const callChemServiceOcr = async (imageBlob: Blob): Promise<ChemOcrResponse> => {
  const form = new FormData();
  form.append("file", imageBlob);

  const response = await fetch(`${getBaseUrl()}/ocr`, {
    method: "POST",
    body: form,
  });

  return handleResponse<ChemOcrResponse>(response, "OCR");
};

/**
 * Request structure normalization from the chem-service.
 *
 * @param payload - Object containing `smiles` and/or `molfile`.
 * @returns Parsed `ChemNormalizeResponse`.
 */
export const callChemServiceNormalize = async (
  payload: ChemNormalizeRequest
): Promise<ChemNormalizeResponse> => {
  const response = await fetch(`${getBaseUrl()}/normalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return handleResponse<ChemNormalizeResponse>(response, "normalize");
};

/**
 * Request an SVG render from the chem-service.
 *
 * @param payload - Object containing `smiles` and/or `molfile`, plus optional dimensions.
 * @returns Parsed `ChemRenderResponse`.
 */
export const callChemServiceRender = async (
  payload: ChemRenderRequest
): Promise<ChemRenderResponse> => {
  const response = await fetch(`${getBaseUrl()}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return handleResponse<ChemRenderResponse>(response, "render");
};
