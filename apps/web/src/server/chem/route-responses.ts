import { buildChemRenderLoadingSvg } from "@chemd/core";
import { NextResponse } from "next/server";

import type { ResolvedWritebackTarget } from "./dto";

export interface JsonRouteResult<T> {
  body: T;
  status?: number;
  headers?: HeadersInit;
}

interface ErrorResponseOptions {
  code?: string;
  extra?: Record<string, unknown>;
  headers?: HeadersInit;
}

export const jsonResult = <T>(
  body: T,
  status = 200,
  headers?: HeadersInit
): JsonRouteResult<T> => ({
  body,
  status,
  headers
});

export const toJsonResponse = <T>(result: JsonRouteResult<T>): Response =>
  NextResponse.json(result.body, {
    status: result.status ?? 200,
    headers: result.headers
  });

export const errorResponse = (
  status: number,
  message: string,
  options: ErrorResponseOptions = {}
): Response => {
  const body = {
    ...(options.code ? { code: options.code } : {}),
    ...(options.extra ?? {}),
    message
  };

  return NextResponse.json(body, {
    status,
    headers: options.headers
  });
};

export const badRequest = (message: string, code?: string): Response =>
  errorResponse(400, message, { code });

export const unsupportedMediaType = (message: string, code?: string): Response =>
  errorResponse(415, message, { code });

export const requestTooLarge = (message: string, code?: string): Response =>
  errorResponse(413, message, { code });

export const upstreamFailure = (
  message: string,
  status = 502,
  code?: string,
  extra?: Record<string, unknown>
): Response =>
  errorResponse(status, message, { code, extra });

export const busyResponse = (
  message: string,
  retryAfterSeconds: number,
  code?: string
): Response =>
  errorResponse(503, message, {
    code,
    headers: {
      "Retry-After": String(retryAfterSeconds)
    }
  });

export const buildMoleculeLoadingResult = (message: string): JsonRouteResult<{
  type: "molecule";
  message: string;
  svg: string;
  warnings: string[];
}> =>
  jsonResult({
    type: "molecule",
    message: `Molecule render failed: ${message}`,
    svg: buildChemRenderLoadingSvg("molecule"),
    warnings: [`chem-service unavailable, loading placeholder used: ${message}`]
  }, 502);

export const buildOcrFailedResult = (
  target: ResolvedWritebackTarget,
  warnings: string[] | undefined
): JsonRouteResult<{
  status: "failed";
  blockId: string;
  action: "update_existing" | "create_new";
  warnings: string[];
}> =>
  jsonResult(
    {
      status: "failed",
      blockId: target.blockId,
      action: target.action,
      warnings: warnings ?? []
    },
    422
  );
