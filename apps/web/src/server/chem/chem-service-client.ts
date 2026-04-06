import type {
  ChemServiceStructureLookupResponse,
  NormalizeRequest,
  NormalizeResponse,
  OcrResponse,
  ReactionOcrResponse,
  ReactionRenderRequest,
  ReactionRenderResponse,
  RenderRequest,
  RenderResponse
  , SaveStructureRecordInput, StructureRecord
} from "./dto";

const baseUrl = process.env.CHEM_SERVICE_BASE_URL ?? "http://127.0.0.1:18081";
const chemServiceAccessKey = process.env.CHEM_SERVICE_ACCESS_KEY?.trim();

const createChemServiceHeaders = (headers: HeadersInit): Headers => {
  const nextHeaders = new Headers(headers);
  if (chemServiceAccessKey) {
    nextHeaders.set("X-Chem-Service-Key", chemServiceAccessKey);
  }
  return nextHeaders;
};

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
    headers: createChemServiceHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ imageBase64, mimeType })
  });
  return parseJson<OcrResponse>(response);
};

export const callChemServiceReactionOcr = async (
  imageBase64: string,
  mimeType: string
): Promise<ReactionOcrResponse> => {
  const response = await fetch(`${baseUrl}/reaction/ocr`, {
    method: "POST",
    headers: createChemServiceHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ imageBase64, mimeType })
  });
  return parseJson<ReactionOcrResponse>(response);
};

export const callChemServiceNormalize = async (
  payload: NormalizeRequest
): Promise<NormalizeResponse> => {
  const response = await fetch(`${baseUrl}/normalize`, {
    method: "POST",
    headers: createChemServiceHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
  return parseJson<NormalizeResponse>(response);
};

export const callChemServiceRender = async (payload: RenderRequest): Promise<RenderResponse> => {
  const response = await fetch(`${baseUrl}/render`, {
    method: "POST",
    headers: createChemServiceHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
  return parseJson<RenderResponse>(response);
};

export const callChemServiceReactionRender = async (
  payload: ReactionRenderRequest
): Promise<ReactionRenderResponse> => {
  const response = await fetch(`${baseUrl}/reaction/render`, {
    method: "POST",
    headers: createChemServiceHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
  return parseJson<ReactionRenderResponse>(response);
};

export const callChemServiceGetStructureRecord = async (
  documentId: string,
  blockId: string,
  sessionId: string
): Promise<ChemServiceStructureLookupResponse> => {
  const params = new URLSearchParams({
    documentId,
    blockId,
    sessionId
  });
  const response = await fetch(`${baseUrl}/structure?${params.toString()}`, {
    method: "GET",
    headers: createChemServiceHeaders({})
  });
  return parseJson<ChemServiceStructureLookupResponse>(response);
};

export const callChemServiceSaveStructureRecord = async (
  payload: SaveStructureRecordInput
): Promise<StructureRecord> => {
  const response = await fetch(`${baseUrl}/structure`, {
    method: "POST",
    headers: createChemServiceHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(payload)
  });
  return parseJson<StructureRecord>(response);
};
