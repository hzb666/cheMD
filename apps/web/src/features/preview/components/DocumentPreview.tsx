"use client";

import React, { useSyncExternalStore } from "react";

import { toSandboxedPreviewDocument, type PreviewTheme } from "../styles/preview-document";

interface DocumentPreviewProps {
  html: string;
  frameRef?: React.RefObject<HTMLIFrameElement | null>;
  title?: string;
}

const subscribeToPreviewTheme = (onStoreChange: () => void): (() => void) => {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  const root = document.documentElement;
  const observer = new MutationObserver(() => {
    onStoreChange();
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["class", "data-theme"]
  });

  return () => {
    observer.disconnect();
  };
};

const readPreviewTheme = (): PreviewTheme =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

const readServerPreviewTheme = (): PreviewTheme => "light";

export const DocumentPreview = ({
  html,
  frameRef,
  title = "chemd-preview"
}: DocumentPreviewProps) => {
  const previewTheme = useSyncExternalStore(
    subscribeToPreviewTheme,
    readPreviewTheme,
    readServerPreviewTheme
  );

  return (
    <div className="relative w-full h-full flex flex-col flex-1">
      <iframe
        ref={frameRef}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full border-0"
        srcDoc={toSandboxedPreviewDocument(html, previewTheme)}
      />
    </div>
  );
};
