import { createScopedToken } from "./random-token";

export const CHEMD_SESSION_TOKEN_COOKIE = "chemd-session-token";
export const CHEMD_SESSION_TOKEN_HEADER = "x-chemd-session-token";

const SESSION_STORAGE_KEY = "chemd-session-token";

const createFallbackSessionToken = (): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `chemd-${uuid}`;
  }

  const highResNow = typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : 0;
  return `chemd-${Date.now().toString(36)}-${Math.floor(highResNow * 1000).toString(36)}`;
};

const createSessionToken = (): string => {
  try {
    return createScopedToken("chemd");
  } catch {
    return createFallbackSessionToken();
  }
};

const persistSessionTokenCookie = (token: string): void => {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${CHEMD_SESSION_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;
};

const readSessionTokenCookie = (): string | null => {
  if (typeof document === "undefined") {
    return null;
  }

  for (const part of document.cookie.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== CHEMD_SESSION_TOKEN_COOKIE) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
};

const readSessionStorageToken = (): string | null => {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
};

const persistSessionStorageToken = (token: string): void => {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // Ignore sessionStorage failures and still use the generated token for this page session.
  }
};

export const getOrCreateChemdSessionToken = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  const cookieToken = readSessionTokenCookie();
  if (cookieToken) {
    persistSessionStorageToken(cookieToken);
    return cookieToken;
  }

  const existingToken = readSessionStorageToken();
  if (existingToken) {
    persistSessionTokenCookie(existingToken);
    return existingToken;
  }

  const nextToken = createSessionToken();
  persistSessionStorageToken(nextToken);
  persistSessionTokenCookie(nextToken);
  return nextToken;
};

export const buildChemdSessionHeaders = (headers?: HeadersInit): Headers => {
  const nextHeaders = new Headers(headers);
  const sessionToken = getOrCreateChemdSessionToken();
  if (sessionToken) {
    nextHeaders.set(CHEMD_SESSION_TOKEN_HEADER, sessionToken);
  }
  return nextHeaders;
};
