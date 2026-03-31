import React, { useRef } from "react";

interface OcrImportButtonProps {
  loading: boolean;
  onPickFile: (file: File) => void;
}

export const OcrImportButton = ({ loading, onPickFile }: OcrImportButtonProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <button
        type="button"
        className="button-primary"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        {loading ? "Recognizing..." : "OCR Image"}
      </button>
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
