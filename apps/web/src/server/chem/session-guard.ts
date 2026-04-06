import { NextResponse } from "next/server";

import {
  CHEMD_SESSION_TOKEN_COOKIE,
  CHEMD_SESSION_TOKEN_HEADER
} from "../../lib/chemd-session-token";

const readCookieValue = (cookieHeader: string | null, name: string): string | null => {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name) {
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

export const requireMatchingSessionToken = (request: Request): Response | null => {
  const headerToken = request.headers.get(CHEMD_SESSION_TOKEN_HEADER)?.trim();
  const cookieToken = readCookieValue(
    request.headers.get("cookie"),
    CHEMD_SESSION_TOKEN_COOKIE
  )?.trim();

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return NextResponse.json(
      { message: "matching session token is required for write operations" },
      { status: 403 }
    );
  }

  return null;
};
