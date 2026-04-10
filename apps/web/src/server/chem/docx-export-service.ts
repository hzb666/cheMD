import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { compileChemdToDocx } from "@chemd/compiler/node";

import {
  DOCX_EXPORT_BUSY_RETRY_AFTER_SECONDS,
  DOCX_EXPORT_TIMEOUT_MS,
  MAX_CONCURRENT_DOCX_EXPORTS
} from "../../app/api/export/docx/config";
import { busyResponse } from "./route-responses";

export interface DocxExportRequest {
  source: string;
  profileId?: string;
  fileName?: string;
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
  const withoutExt = normalized.replace(/\.docx$/i, "");
  return withoutExt.length > 0 ? withoutExt : "chemd-export";
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

export const exportDocxDocument = async (input: DocxExportRequest): Promise<Response> => {
  let outputPath: string | undefined;
  let slotAcquired = false;

  try {
    // DOCX 导出靠进程内计数限流；超过阈值直接返回 Retry-After，
    // 避免 pandoc 和临时文件把当前实例拖死。
    if (!tryAcquireDocxExportSlot()) {
      return busyResponse("DOCX export service is busy, please retry shortly", DOCX_EXPORT_BUSY_RETRY_AFTER_SECONDS, "E_DOCX_EXPORT_BUSY");
    }
    slotAcquired = true;

    outputPath = join(tmpdir(), `chemd-export-${randomUUID()}.docx`);
    const exportResult = await compileChemdToDocx(input.source, {
      outputPath,
      pandocPath: process.env.PANDOC_PATH,
      executionTimeoutMs: DOCX_EXPORT_TIMEOUT_MS,
      compileOptions: input.profileId
        ? {
            renderSelection: {
              profileId: input.profileId
            }
          }
        : undefined
    });

    const safeName = sanitizeFileName(
      input.fileName ?? exportResult.compileResult.document.meta.id ?? exportResult.compileResult.document.meta.title
    );
    const streamPath = outputPath;
    const stream = createReadStream(streamPath);
    let cleaned = false;
    const cleanupTempFile = async () => {
      if (cleaned) {
        return;
      }

      // 流式下载中断时不会走调用方的正常清理路径，
      // 所以 close/error 和 finally 都要兜底删除临时文件。
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
  } finally {
    if (slotAcquired) {
      releaseDocxExportSlot();
    }

    if (outputPath) {
      await fs.rm(outputPath, { force: true }).catch(() => undefined);
    }
  }
};
