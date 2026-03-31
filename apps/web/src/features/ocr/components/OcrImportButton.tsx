"use client";

import React, { useRef } from "react";

interface OcrImportButtonProps {
  onFile: (file: File) => void;
  loading?: boolean;
}

/**
 * A button that opens a file-picker and passes the selected image to the
 * `onFile` callback.
 */
export const OcrImportButton = ({ onFile, loading = false }: OcrImportButtonProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFile(file);
    }
    // Reset so the same file can be re-selected
    event.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Upload structure image"
        onChange={handleChange}
      />
      <button
        type="button"
        className="button-primary"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        title="Upload a structure image for OCR recognition"
      >
        {loading ? "Recognising…" : "📷 Import structure"}
      </button>
    </>
  );
};
