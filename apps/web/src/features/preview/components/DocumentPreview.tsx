"use client";

import React, { useLayoutEffect, useRef } from "react";
import { useTheme } from "next-themes";

import { PREVIEW_THEME_SYNC_MESSAGE_TYPE } from "../lib/preview-theme-sync-script";
import { toSandboxedPreviewDocument, type PreviewTheme } from "../styles/preview-document";

interface DocumentPreviewProps {
  html: string;
  frameRef?: React.RefObject<HTMLIFrameElement | null>;
  title?: string;
}

const postPreviewTheme = (
  frame: HTMLIFrameElement | null | undefined,
  theme: PreviewTheme
): void => {
  try {
    frame?.contentWindow?.postMessage({ type: PREVIEW_THEME_SYNC_MESSAGE_TYPE, theme }, "*");
  } catch {
    // Ignore transient iframe reload races.
  }
};

export const DocumentPreview = ({
  html,
  frameRef,
  title = "chemd-preview"
}: DocumentPreviewProps) => {
  const localFrameRef = useRef<HTMLIFrameElement | null>(null);
  const activeFrameRef = frameRef ?? localFrameRef;
  const { resolvedTheme } = useTheme();
  const previewTheme: PreviewTheme = resolvedTheme === "dark" ? "dark" : "light";
  const srcDocRef = useRef("");
  const lastHtmlRef = useRef<string | null>(null);

  if (!srcDocRef.current || lastHtmlRef.current !== html) {
    srcDocRef.current = toSandboxedPreviewDocument(html, previewTheme);
    lastHtmlRef.current = html;
  }

  useLayoutEffect(() => {
    postPreviewTheme(activeFrameRef.current, previewTheme);
  }, [activeFrameRef, previewTheme]);

  return (
    <div className="relative w-full h-full flex flex-col flex-1">
      <iframe
        ref={activeFrameRef}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full border-0"
        srcDoc={srcDocRef.current}
        onLoad={(event) => {
          postPreviewTheme(event.currentTarget, previewTheme);
        }}
      />
    </div>
  );
};
