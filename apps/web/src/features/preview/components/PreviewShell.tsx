import React, { useState } from "react";
import { useDocxExport } from "../../export-docx/hooks/useDocxExport";

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
    margin: 0 0 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }
  .chemd-graphic {
    margin: 0.6rem 0 0.25rem;
    padding: 0.75rem;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 10px;
    background: #f8fafc;
    overflow: hidden;
  }
  .chemd-graphic svg { width: 100%; height: auto; }
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

const PreviewShell = ({ html, json, docxBridge, source }: PreviewShellProps) => {
  const [activeTab, setActiveTab] = useState<OutputTab>("preview");
  const { exportingDocx, exportMessage, exportDocx } = useDocxExport({
    payload: { source }
  });

  const activeCode = activeTab === "json" ? json : docxBridge;

  return (
    <section className="workspace-panel workspace-panel-output panel-stack min-h-0">
      <div className="panel-header panel-toolbar shrink-0 items-center">
        <div className="panel-heading-cluster">
          <p className="panel-kicker">Preview</p>
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
        </div>
        <button
          type="button"
          onClick={exportDocx}
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
