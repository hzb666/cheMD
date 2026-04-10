export type JsonObjectBody = Record<string, unknown>;

export interface RouteValidationIssue {
  status: 400 | 413;
  message: string;
}

export const isJsonObjectBody = (value: unknown): value is JsonObjectBody =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseJsonBody = async (request: Request): Promise<unknown | null> =>
  request.json().catch(() => null);

export const parseJsonObjectBody = async (request: Request): Promise<JsonObjectBody | null> => {
  const body = await parseJsonBody(request);
  return isJsonObjectBody(body) ? body : null;
};

export const parseFormDataBody = async (request: Request): Promise<FormData | null> =>
  request.formData().catch(() => null);

export const readRequiredTrimmedString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

export const readOptionalTrimmedString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

export const readOptionalObject = (value: unknown): Record<string, unknown> | undefined =>
  isJsonObjectBody(value) ? value : undefined;

const trimStringArray = (value: unknown[]): string[] | null => {
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }

    const trimmed = item.trim();
    if (!trimmed) {
      return null;
    }

    items.push(trimmed);
  }

  return items;
};

export const readStringArray = (
  value: unknown,
  options: {
    allowEmptyArray?: boolean;
  } = {}
): string[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = trimStringArray(value);
  if (!items) {
    return null;
  }

  if (options.allowEmptyArray === false && items.length === 0) {
    return null;
  }

  return items;
};

export const readOptionalStringArray = (value: unknown): string[] | undefined | null =>
  value === undefined ? undefined : readStringArray(value);

export const readFormDataString = (formData: FormData, name: string): string | undefined =>
  readOptionalTrimmedString(formData.get(name));

export const readFormDataFile = (formData: FormData, name: string): File | null => {
  const value = formData.get(name);
  return value instanceof File ? value : null;
};

export const validateImageUpload = (
  file: File | null,
  maxUploadBytes: number
): RouteValidationIssue | null => {
  if (!(file instanceof File)) {
    return {
      status: 400,
      message: "image file is required"
    };
  }

  if (!file.type.startsWith("image/")) {
    return {
      status: 400,
      message: "image upload must use an image mime type"
    };
  }

  if (file.size > maxUploadBytes) {
    return {
      status: 413,
      message: "image upload is too large"
    };
  }

  return null;
};

export const readFileAsBase64 = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

export const isJsonContentType = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  return value.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
};

export const readRequestText = async (request: Request): Promise<string | null> =>
  request.text().catch(() => null);
