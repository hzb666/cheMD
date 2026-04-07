import React, { useRef } from "react";
import { Button } from "../../../components/ui/button";

interface OcrImportButtonProps {
  loading: boolean;
  onPickFile: (file: File) => void;
  label?: string;
  className?: string;
}

export const OcrImportButton = ({ loading, onPickFile, label = "OCR Image", className }: OcrImportButtonProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className={className}
      >
        {loading ? "Recognizing..." : label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onPickFile(file);
          }
          event.currentTarget.value = "";
        }}
      />
    </>
  );
};
