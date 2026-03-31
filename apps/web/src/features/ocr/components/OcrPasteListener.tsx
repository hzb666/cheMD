"use client";

import { useEffect } from "react";

interface OcrPasteListenerProps {
  onFile: (file: File) => void;
  enabled?: boolean;
}

/**
 * Invisible component that listens for `paste` events containing an image
 * and forwards the first image blob to the `onFile` callback.
 */
export const OcrPasteListener = ({ onFile, enabled = true }: OcrPasteListenerProps) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            onFile(file);
            return;
          }
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [enabled, onFile]);

  return null;
};
