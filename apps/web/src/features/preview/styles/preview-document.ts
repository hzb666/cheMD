export const PREVIEW_DOCUMENT_STYLE = `
  :root {
    color-scheme: light;
    font-family: "Inter", "Segoe UI Variable Text", Aptos, "PingFang SC", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: rgba(71, 85, 105, 0.3) transparent;
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
    background: rgba(71, 85, 105, 0.26);
  }

  body {
    color: #1e293b;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    line-height: 1.68;
  }

  .chemd-document {
    padding: 1.35rem 1.45rem 1.6rem;
  }

  .chemd-document > header {
    margin-bottom: 1rem;
    padding-bottom: 0.85rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  }

  .chemd-document > header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.35rem;
    line-height: 1.2;
  }

  .chemd-document > header p {
    margin: 0;
    color: #64748b;
    font-size: 0.95rem;
  }

  .chemd-markdown {
    margin: 0 0 1rem;
  }

  .chemd-block {
    margin: 0 0 1rem;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  .chemd-block h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .chemd-graphic {
    margin: 0.65rem 0 0.35rem;
    padding: 0.8rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 14px;
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    overflow: hidden;
  }

  .chemd-graphic svg {
    width: 100%;
    height: auto;
  }

  .chemd-edit-structure,
  .chemd-edit-chem {
    display: inline-flex;
    min-height: 1.8rem;
    align-items: center;
    justify-content: center;
    margin: 0 0 0.75rem;
    padding: 0 0.6rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.95);
    color: #1e293b;
    font-size: 0.76rem;
    cursor: pointer;
  }

  .chemd-fields {
    display: grid;
    gap: 0.5rem;
    margin: 0.75rem 0 0;
  }

  .chemd-field {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-size: 0.92rem;
  }

  .chemd-field dt {
    color: #64748b;
    font-weight: 600;
  }

  .chemd-field dd {
    margin: 0;
  }

  .chem-inline {
    display: inline-flex;
    align-items: center;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.1);
    color: #1d4ed8;
    font-weight: 600;
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
`;

const PREVIEW_DOCUMENT_CSP = [
  "default-src 'none'",
  "img-src data: blob: https: http:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "font-src data: https: http:"
].join("; ");

export const toSandboxedPreviewDocument = (html: string) =>
  `<!doctype html><html><head><meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="${PREVIEW_DOCUMENT_CSP}" /><style>${PREVIEW_DOCUMENT_STYLE}</style></head><body>${html}</body></html>`;
