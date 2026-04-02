import { useEffect } from "react";

interface OcrPasteListenerProps {
  enabled?: boolean;
  onPickFile: (file: File) => void;
}

export const OcrPasteListener = ({ enabled = true, onPickFile }: OcrPasteListenerProps) => {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handler = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }

      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            onPickFile(file);
            event.preventDefault();
            return;
          }
        }
      }
    };

    window.addEventListener("paste", handler);
    return () => {
      window.removeEventListener("paste", handler);
    };
  }, [enabled, onPickFile]);

  return null;
};
