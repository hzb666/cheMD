import type {
  ChemServiceStructureLookupResponse,
  NormalizeRequest,
  NormalizeResponse,
  OcrResponse,
  ReactionOcrResponse,
  ReactionRenderRequest,
  ReactionRenderResponse,
  RenderRequest,
  RenderResponse,
  SaveStructureRecordInput,
  StructureRecord
} from "./dto";
import { ChemServiceError } from "./chem-service-error";

const baseUrl = process.env.CHEM_SERVICE_BASE_URL ?? "http://127.0.0.1:18081";
const chemServiceAccessKey = process.env.CHEM_SERVICE_ACCESS_KEY?.trim();

const createChemServiceHeaders = (headers: HeadersInit): Headers => {
  const nextHeaders = new Headers(headers);
  // 只有服务端 route 能附加内部访问密钥；
  // 浏览器请求不应直接命中 chem-service。
  if (chemServiceAccessKey) {
    nextHeaders.set("X-Chem-Service-Key", chemServiceAccessKey);
  }
  return nextHeaders;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  // route 层依赖 status/message 决定是直接报错还是回退占位图；
  // 这里尽量保留 chem-service 的错误语义。
  const payload = (await response.json().catch(() => null)) as
    | (T & {
        message?: unknown;
        code?: unknown;
      })
    | null;
  if (!response.ok || payload == null) {
    const message =
      typeof payload?.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : `chem-service request failed (${response.status})`;
    throw new ChemServiceError(message, {
      status: response.status,
      code: typeof payload?.code === "string" ? payload.code : undefined
    });
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
