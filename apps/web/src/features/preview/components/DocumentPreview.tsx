"use client";

import React from "react";

import { toSandboxedPreviewDocument } from "../styles/preview-document";

interface DocumentPreviewProps {
  html: string;
  frameRef?: React.RefObject<HTMLIFrameElement | null>;
  title?: string;
}

export const DocumentPreview = ({
  html,
  frameRef,
  title = "chemd-preview"
}: DocumentPreviewProps) => (
  <div className="detail-card min-h-0 flex-1">
    <div className="detail-card-body preview-canvas h-full">
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="preview-frame"
        srcDoc={toSandboxedPreviewDocument(html)}
      />
    </div>
  </div>
);
