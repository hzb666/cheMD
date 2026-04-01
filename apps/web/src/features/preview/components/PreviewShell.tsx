import React, { useState } from "react";

interface PreviewShellProps {
  html: string;
  json: string;
  docxBridge: string;
  source: string;
}

type OutputTab = "preview" | "json" | "docxBridge";

const PREVIEW_FRAME_STYLE = `
  :root {
    color-scheme: light;
    font-family: "Inter", "Segoe UI Variable Text", Aptos, "PingFang SC", sans-serif;
  }
  * { box-sizing: border-box; }
  html, body {
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: rgba(15, 23, 42, 0.14) transparent;
  }
  html::-webkit-scrollbar,
  body::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }
  html::-webkit-scrollbar-track,
  body::-webkit-scrollbar-track {
    background: transparent;
  }
  html::-webkit-scrollbar-thumb,
  body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.12);
  }
  html::-webkit-scrollbar-thumb:hover,
  body::-webkit-scrollbar-thumb:hover {
    background: rgba(15, 23, 42, 0.2);
  }
  body {
    margin: 0;
    padding: 0;
    color: #1f2937;
    background: #ffffff;
    line-height: 1.68;
  }
  .chemd-document { padding: 1.2rem 1.3rem; }
  .chemd-markdown { margin: 0 0 0.9rem; }
  .chemd-block {
    margin: 0 0 0.75rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }
  .chemd-block h2 {
    margin: 0 0 0.35rem;
    font-size: 1rem;
    line-height: 1.4;
    font-weight: 600;
  }
  .chemd-graphic {
    margin: 0.4rem 0 0.1rem;
    padding: 0.45rem 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: hidden;
  }
  .chemd-graphic svg { width: 100%; height: auto; }
  .chemd-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.2rem 0 0;
  }
  .chemd-field {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .chemd-field dt {
    margin: 0;
    color: #6b7280;
    font-size: 0.88rem;
  }
  .chemd-field dd {
    margin: 0;
    font-size: 0.92rem;
  }
  .chemd-col-grid {
    display: grid;
    grid-template-columns: repeat(var(--chemd-col-columns, 1), minmax(0, 1fr));
    gap: 0 1rem;
    align-items: start;
  }
  .chemd-col-item {
    min-width: 0;
  }
  .chemd-col-item > .chemd-block {
    margin: 0;
    padding: 0;
    border: 0;
  }
  .chem-inline {
    display: inline-block;
    padding: 0.05rem 0.38rem;
    border-radius: 6px;
    background: rgba(59, 130, 246, 0.12);
    color: #245dd8;
    font-weight: 600;
  }
`;

const toSandboxedSrcDoc = (html: string): string =>
  `<!doctype html><html><head><meta charset="utf-8" /><style>${PREVIEW_FRAME_STYLE}</style></head><body>${html}</body></html>`;

const parseFileNameFromContentDisposition = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const match = value.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (!match || !match[1]) {
    return undefined;
  }

  const raw = match[1].trim();
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const PreviewShell = ({ html, json, docxBridge, source }: PreviewShellProps) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExportDocx = async () => {
    setExportingDocx(true);
    setExportMessage(null);

    try {
      const response = await fetch("/api/export/docx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ source })
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorPayload.message ?? `DOCX export failed (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const serverFileName = parseFileNameFromContentDisposition(
        response.headers.get("Content-Disposition")
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      if (serverFileName) {
        anchor.download = serverFileName;
      }
      globalThis.document.body.append(anchor);
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

  const activeCode = activeTab === "json" ? json : docxBridge;

  return (
    <section className="workspace-panel workspace-panel-output panel-stack min-h-0">
      <div className="panel-header panel-toolbar shrink-0 items-center">
        <div className="panel-heading-inline">
          <div className="tab-strip-container">
            <div className="tab-strip" role="tablist" aria-label="Output views">
              <button
                type="button"
                className="tab-button"
                data-active={activeTab === "preview"}
                onClick={() => setActiveTab("preview")}
              >
                Preview
              </button>
              <button
                type="button"
                className="tab-button"
                data-active={activeTab === "json"}
                onClick={() => setActiveTab("json")}
              >
                JSON
              </button>
              <button
                type="button"
                className="tab-button"
                data-active={activeTab === "docxBridge"}
                onClick={() => setActiveTab("docxBridge")}
              >
                DOCX
              </button>
            </div>
            <span className="tab-indicator" data-active-tab={activeTab} aria-hidden />
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportDocx}
          disabled={exportingDocx}
          className="button-primary"
        >
          {exportingDocx ? "Exporting..." : "Export"}
        </button>
      </div>

      {exportMessage ? <p className="status-text shrink-0">{exportMessage}</p> : null}

      <div className="detail-card min-h-0 flex-1">
        {activeTab === "preview" ? (
          <div className="detail-card-body preview-canvas h-full">
            <iframe
              title="chemd-preview"
              sandbox="allow-popups"
              referrerPolicy="no-referrer"
              className="preview-frame"
              srcDoc={toSandboxedSrcDoc(html)}
            />
          </div>
        ) : (
          <div className="detail-card-body h-full">
            <div className="code-surface h-full">
              <pre className="code-block scroll-area">
                <code>{activeCode}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default PreviewShell;
