import { createScopedToken } from "./random-token";

export const CHEMD_SESSION_TOKEN_COOKIE = "chemd-session-token";
export const CHEMD_SESSION_TOKEN_HEADER = "x-chemd-session-token";

const SESSION_STORAGE_KEY = "chemd-session-token";

const createFallbackSessionToken = (): string =>
  `chemd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

export const getOrCreateChemdSessionToken = (): string => {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const existingToken = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existingToken) {
      persistSessionTokenCookie(existingToken);
      return existingToken;
    }
  } catch {
    // Ignore sessionStorage failures and fall back to an in-memory token.
  }

  const nextToken = createSessionToken();

  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextToken);
  } catch {
    // Ignore sessionStorage failures and still use the generated token for this page session.
  }

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
