import type {
  NormalizeRequest,
  NormalizeResponse,
  OcrResponse,
  RenderRequest,
  RenderResponse
} from "./dto";

const baseUrl = process.env.CHEM_SERVICE_BASE_URL ?? "http://127.0.0.1:18081";

const parseJson = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || payload == null) {
    throw new Error(`chem-service request failed (${response.status})`);
  }
  return payload;
};

export const callChemServiceOcr = async (
  imageBase64: string,
  mimeType: string
): Promise<OcrResponse> => {
  const response = await fetch(`${baseUrl}/ocr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ imageBase64, mimeType })
  });
  return parseJson<OcrResponse>(response);
};

export const callChemServiceNormalize = async (
  payload: NormalizeRequest
): Promise<NormalizeResponse> => {
  const response = await fetch(`${baseUrl}/normalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJson<NormalizeResponse>(response);
};

export const callChemServiceRender = async (payload: RenderRequest): Promise<RenderResponse> => {
  const response = await fetch(`${baseUrl}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return parseJson<RenderResponse>(response);
};
