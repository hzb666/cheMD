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
  <div className="relative w-full h-full flex flex-col flex-1">
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="absolute inset-0 w-full h-full border-0"
      srcDoc={toSandboxedPreviewDocument(html)}
    />
  </div>
);
