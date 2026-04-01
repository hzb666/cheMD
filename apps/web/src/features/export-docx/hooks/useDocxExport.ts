import { useState } from "react";

import { parseContentDispositionFilename } from "../lib/parse-content-disposition-filename";

interface UseDocxExportOptions {
  payload: Record<string, unknown>;
}

interface UseDocxExportResult {
  exportingDocx: boolean;
  exportMessage: string | null;
  exportDocx: () => Promise<void>;
}

export const useDocxExport = ({ payload }: UseDocxExportOptions): UseDocxExportResult => {
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const exportDocx = async () => {
    setExportingDocx(true);
    setExportMessage(null);

    try {
      const response = await fetch("/api/export/docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorPayload.message ?? `DOCX export failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const serverFileName = parseContentDispositionFilename(
        response.headers.get("Content-Disposition")
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      if (serverFileName) {
        anchor.download = serverFileName;
      }
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60000);
      setExportMessage("DOCX export downloaded.");
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "DOCX export failed");
    } finally {
      setExportingDocx(false);
    }
  };

  return {
    exportingDocx,
    exportMessage,
    exportDocx
  };
};
