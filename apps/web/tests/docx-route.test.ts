import { promises as fs } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const compileChemdToDocxMock = vi.fn();

vi.mock("@chemd/compiler/node", () => ({
  compileChemdToDocx: (...args: unknown[]) => compileChemdToDocxMock(...args)
}));

const createRequest = (body: unknown, headers: HeadersInit = {}): Request =>
  new Request("http://localhost/api/export/docx", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });

describe("POST /api/export/docx", () => {
  beforeEach(() => {
    compileChemdToDocxMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rejects non-json content types before invoking the compiler", async () => {
    const { POST } = await import("../src/app/api/export/docx/route");
    const request = new Request("http://localhost/api/export/docx", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({ source: "---\nid: exp-plain\ntitle: Plain\ndate: 2026-03-31\n---" })
    });

    const response = await POST(request);
    const json = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(415);
    expect(json.code).toBe("E_UNSUPPORTED_MEDIA_TYPE");
    expect(compileChemdToDocxMock).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies before invoking the compiler", async () => {
    const { POST } = await import("../src/app/api/export/docx/route");
    const { MAX_DOCX_EXPORT_REQUEST_BYTES } = await import(
      "../src/app/api/export/docx/config"
    );
    const payload = JSON.stringify({
      source: "x".repeat(MAX_DOCX_EXPORT_REQUEST_BYTES + 32)
    });
    const request = new Request("http://localhost/api/export/docx", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(new TextEncoder().encode(payload).length)
      },
      body: payload
    });

    const response = await POST(request);
    const json = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(413);
    expect(json.code).toBe("E_DOCX_EXPORT_REQUEST_TOO_LARGE");
    expect(compileChemdToDocxMock).not.toHaveBeenCalled();
  });

  it("returns retry-after when the export concurrency limit is saturated", async () => {
    let releaseFirstExport: (() => void) | undefined;
    compileChemdToDocxMock.mockImplementationOnce(
      async (_source: string, options: { outputPath: string }) => {
        await new Promise<void>((resolve) => {
          releaseFirstExport = resolve;
        });
        await fs.writeFile(options.outputPath, "docx");
        return {
          compileResult: {
            document: {
              type: "document",
              meta: { id: "exp-1", title: "Export 1", date: "2026-03-31" },
              children: [],
              diagnostics: []
            }
          },
          markdown: "# Export 1",
          outputPath: options.outputPath,
          command: "pandoc",
          args: []
        };
      }
    );

    const { POST } = await import("../src/app/api/export/docx/route");
    const { DOCX_EXPORT_BUSY_RETRY_AFTER_SECONDS } = await import(
      "../src/app/api/export/docx/config"
    );

    const firstResponsePromise = POST(
      createRequest({ source: "---\nid: exp-1\ntitle: Export 1\ndate: 2026-03-31\n---" })
    );

    await Promise.resolve();

    const saturatedResponse = await POST(
      createRequest({ source: "---\nid: exp-2\ntitle: Export 2\ndate: 2026-03-31\n---" })
    );
    const saturatedJson = (await saturatedResponse.json()) as { code: string; message: string };

    expect(saturatedResponse.status).toBe(503);
    expect(saturatedJson.code).toBe("E_DOCX_EXPORT_BUSY");
    expect(saturatedResponse.headers.get("Retry-After")).toBe(
      String(DOCX_EXPORT_BUSY_RETRY_AFTER_SECONDS)
    );

    releaseFirstExport?.();
    await firstResponsePromise;
  });
});
