export const runtime = "nodejs";

/** Maximum image upload size: 10 MB. */
export const MAX_OCR_IMAGE_BYTES = 10 * 1024 * 1024;

/** Allowed MIME types for OCR image upload. */
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);
