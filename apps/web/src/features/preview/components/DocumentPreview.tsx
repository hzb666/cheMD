"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import {
  dispatchPreviewThemeSyncAck,
  isPreviewThemeSyncAckMessage,
  isThemeSyncRequestDetail,
  PREVIEW_THEME_SYNC_REQUEST_EVENT
} from "../../../lib/theme-sync-events";
import { PREVIEW_THEME_SYNC_MESSAGE_TYPE } from "../lib/preview-theme-sync-script";
import { toSandboxedPreviewDocument, type PreviewTheme } from "../styles/preview-document";

interface DocumentPreviewProps {
  html: string;
  frameRef?: React.RefObject<HTMLIFrameElement | null>;
  title?: string;
}

// Sandboxed srcDoc iframes use opaque origins; use "*" for reliable parent -> iframe messaging.
const PREVIEW_FRAME_TARGET_ORIGIN = "*";

const postPreviewTheme = (
  frame: HTMLIFrameElement | null | undefined,
  theme: PreviewTheme,
  requestId?: string
): void => {
  try {
    frame?.contentWindow?.postMessage(
      {
        type: PREVIEW_THEME_SYNC_MESSAGE_TYPE,
        theme,
        requestId
      },
      PREVIEW_FRAME_TARGET_ORIGIN
    );
  } catch {
    // 忽略 iframe 重载瞬间的短暂竞争。
  }
};

interface PreviewFrameProps {
  html: string;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  previewTheme: PreviewTheme;
  title: string;
}

const PreviewFrame = ({
  html,
  frameRef,
  previewTheme,
  title
}: PreviewFrameProps) => {
  const [srcDoc] = useState(() => toSandboxedPreviewDocument(html, previewTheme));
  const lastPostedThemeRef = useRef<PreviewTheme | null>(null);
  const pendingAckFrameRef = useRef<number | null>(null);

  const syncPreviewTheme = useCallback(
    (theme: PreviewTheme, requestId?: string, force = false) => {
      if (!force && lastPostedThemeRef.current === theme) {
        return;
      }

      postPreviewTheme(frameRef.current, theme, requestId);
      lastPostedThemeRef.current = theme;
    },
    [frameRef]
  );

  useLayoutEffect(() => {
    syncPreviewTheme(previewTheme);
  }, [previewTheme, syncPreviewTheme]);

  useEffect(() => {
    const handleThemeSyncRequest = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isThemeSyncRequestDetail(detail)) {
        return;
      }

      syncPreviewTheme(detail.theme, detail.requestId, true);
      if (pendingAckFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingAckFrameRef.current);
      }
      pendingAckFrameRef.current = window.requestAnimationFrame(() => {
        dispatchPreviewThemeSyncAck({
          requestId: detail.requestId,
          theme: detail.theme
        });
        pendingAckFrameRef.current = null;
      });
    };

    const handlePreviewMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }
      if (!isPreviewThemeSyncAckMessage(event.data)) {
        return;
      }

      dispatchPreviewThemeSyncAck({
        requestId: event.data.requestId,
        theme: event.data.theme
      });
    };

    window.addEventListener(PREVIEW_THEME_SYNC_REQUEST_EVENT, handleThemeSyncRequest);
    window.addEventListener("message", handlePreviewMessage);

    return () => {
      if (pendingAckFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingAckFrameRef.current);
      }
      window.removeEventListener(PREVIEW_THEME_SYNC_REQUEST_EVENT, handleThemeSyncRequest);
      window.removeEventListener("message", handlePreviewMessage);
    };
  }, [frameRef, syncPreviewTheme]);

  return (
    <iframe
      ref={frameRef}
      title={title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="absolute inset-0 w-full h-full border-0"
      srcDoc={srcDoc}
      onLoad={(event) => {
        postPreviewTheme(event.currentTarget, previewTheme);
        lastPostedThemeRef.current = previewTheme;
      }}
    />
  );
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

  return (
    <div className="relative w-full h-full flex flex-col flex-1">
      <PreviewFrame
        key={html}
        html={html}
        frameRef={activeFrameRef}
        previewTheme={previewTheme}
        title={title}
      />
    </div>
  );
};
