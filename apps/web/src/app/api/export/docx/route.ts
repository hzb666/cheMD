import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { compileChemdToDocx } from "@chemd/compiler/node";
import { NextResponse } from "next/server";

import {
  DOCX_EXPORT_BUSY_RETRY_AFTER_SECONDS,
  DOCX_EXPORT_TIMEOUT_MS,
  MAX_CONCURRENT_DOCX_EXPORTS,
  MAX_DOCX_EXPORT_REQUEST_BYTES
} from "./config";

export const runtime = "nodejs";

interface ExportDocxRequestBody {
  source?: unknown;
  profileId?: unknown;
  fileName?: unknown;
}

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let activeDocxExports = 0;

const sanitizeFileName = (value: string | undefined): string => {
  const raw = value?.trim();
  if (!raw) {
    return "chemd-export";
  }

  const normalized = raw.replaceAll(/[^a-zA-Z0-9._-]/g, "-").replaceAll(/-+/g, "-");
  const withoutExt = normalized.replaceAll(/\.docx$/i, "");
  return withoutExt.length > 0 ? withoutExt : "chemd-export";
};

const isJsonContentType = (value: string | null): boolean => {
  if (!value) {
    return false;
  }

  return value.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
};

const badRequest = (message: string): Response =>
  NextResponse.json(
    {
      code: "E_INVALID_EXPORT_REQUEST",
      message
    },
    { status: 400 }
  );

const unsupportedMediaType = (message: string): Response =>
  NextResponse.json(
    {
      code: "E_UNSUPPORTED_MEDIA_TYPE",
      message
    },
    { status: 415 }
  );

const requestTooLarge = (message: string): Response =>
  NextResponse.json(
    {
      code: "E_DOCX_EXPORT_REQUEST_TOO_LARGE",
      message
    },
    { status: 413 }
  );

const exportBusy = (message: string): Response =>
  NextResponse.json(
    {
      code: "E_DOCX_EXPORT_BUSY",
      message
    },
    {
      status: 503,
      headers: {
        "Retry-After": String(DOCX_EXPORT_BUSY_RETRY_AFTER_SECONDS)
      }
    }
  );

const parseRequestJson = async (request: Request): Promise<ExportDocxRequestBody | Response> => {
  if (!isJsonContentType(request.headers.get("Content-Type"))) {
    return unsupportedMediaType("request content-type must be application/json");
  }

  const contentLength = request.headers.get("Content-Length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsedLength) && parsedLength > MAX_DOCX_EXPORT_REQUEST_BYTES) {
      return requestTooLarge(
        `request body must be <= ${MAX_DOCX_EXPORT_REQUEST_BYTES} bytes`
      );
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return badRequest("invalid JSON payload");
  }

  const bodySize = new TextEncoder().encode(rawBody).length;
  if (bodySize > MAX_DOCX_EXPORT_REQUEST_BYTES) {
    return requestTooLarge(`request body must be <= ${MAX_DOCX_EXPORT_REQUEST_BYTES} bytes`);
  }

  try {
    return JSON.parse(rawBody) as ExportDocxRequestBody;
  } catch {
    return badRequest("invalid JSON payload");
  }
};

const tryAcquireDocxExportSlot = (): boolean => {
  if (activeDocxExports >= MAX_CONCURRENT_DOCX_EXPORTS) {
    return false;
  }

  activeDocxExports += 1;
  return true;
};

const releaseDocxExportSlot = (): void => {
  activeDocxExports = Math.max(0, activeDocxExports - 1);
};

export const POST = async (request: Request): Promise<Response> => {
  let outputPath: string | undefined;
  let slotAcquired = false;

  try {
    const parsedBody = await parseRequestJson(request);
    if (parsedBody instanceof Response) {
      return parsedBody;
    }

    const body = parsedBody;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("request body must be a JSON object");
    }

    if (typeof body.source !== "string" || body.source.trim().length === 0) {
      return badRequest("source must be a non-empty string");
    }

    if (body.profileId !== undefined && typeof body.profileId !== "string") {
      return badRequest("profileId must be a string when provided");
    }

    if (body.fileName !== undefined && typeof body.fileName !== "string") {
      return badRequest("fileName must be a string when provided");
    }

    if (!tryAcquireDocxExportSlot()) {
      return exportBusy("DOCX export service is busy, please retry shortly");
    }
    slotAcquired = true;

    outputPath = join(tmpdir(), `chemd-export-${randomUUID()}.docx`);
    const exportResult = await compileChemdToDocx(body.source, {
      outputPath,
      pandocPath: process.env.PANDOC_PATH,
      executionTimeoutMs: DOCX_EXPORT_TIMEOUT_MS,
      compileOptions: body.profileId
        ? {
            renderSelection: {
              profileId: body.profileId
            }
          }
        : undefined
    });

    const safeName = sanitizeFileName(
      body.fileName ?? exportResult.compileResult.document.meta.id ?? exportResult.compileResult.document.meta.title
    );
    const streamPath = outputPath;
    const stream = createReadStream(streamPath);
    let cleaned = false;
    const cleanupTempFile = async () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      await fs.rm(streamPath, { force: true }).catch(() => undefined);
    };
    stream.on("close", () => {
      void cleanupTempFile();
    });
    stream.on("error", () => {
      void cleanupTempFile();
    });
    outputPath = undefined;

    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "Content-Type": DOCX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${safeName}.docx"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DOCX export failed";
    return NextResponse.json(
      {
        code: "E_DOCX_EXPORT_FAILED",
        message
      },
      { status: 500 }
    );
  } finally {
    if (slotAcquired) {
      releaseDocxExportSlot();
    }

    if (outputPath) {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }
  }
};
