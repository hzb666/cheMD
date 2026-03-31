import { NextResponse } from "next/server";

import { callChemServiceNormalize, callChemServiceOcr } from "../../../../server/chem/chem-service-client";
import { mapOcrResponse } from "../../../../server/chem/mappers/map-ocr-response";
import { upsertStructureRecord } from "../../../../server/chem/structure-store";
import { ALLOWED_IMAGE_TYPES, MAX_OCR_IMAGE_BYTES } from "./config";

export { runtime } from "./config";

/**
 * POST /api/chem/ocr
 *
 * Accepts a `multipart/form-data` request with:
 * - `file`       – image file (required)
 * - `documentId` – document identifier (optional, defaults to "default")
 * - `blockId`    – molecule block id to target (optional)
 *
 * Calls the Python chem-service OCR endpoint, then normalizes the result
 * with RDKit, caches the molfile, and returns a structured response.
 */
export const POST = async (request: Request): Promise<Response> => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ code: "E_INVALID_REQUEST", message: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ code: "E_MISSING_FILE", message: "No file field in request" }, { status: 400 });
  }

  if (file.size > MAX_OCR_IMAGE_BYTES) {
    return NextResponse.json(
      { code: "E_IMAGE_TOO_LARGE", message: `Image must be <= ${MAX_OCR_IMAGE_BYTES} bytes` },
      { status: 413 }
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return NextResponse.json(
      { code: "E_UNSUPPORTED_IMAGE_TYPE", message: `Unsupported image type: ${mimeType}` },
      { status: 415 }
    );
  }

  const documentId = (formData.get("documentId") as string | null) ?? "default";
  const blockId = (formData.get("blockId") as string | null) ?? "";

  let ocrResult: Awaited<ReturnType<typeof callChemServiceOcr>>;
  try {
    ocrResult = await callChemServiceOcr(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR service unavailable";
    return NextResponse.json({ code: "E_OCR_FAILED", message }, { status: 502 });
  }

  if (!ocrResult.smiles) {
    return NextResponse.json(
      { code: "E_OCR_NO_STRUCTURE", message: "OCR could not identify a structure", warnings: ocrResult.warnings },
      { status: 422 }
    );
  }

  // Normalize via RDKit
  let normalizedSmiles = ocrResult.smiles;
  let normalizedMolfile: string | undefined = ocrResult.molfile ?? undefined;
  const normalizeWarnings: string[] = [];

  try {
    const normalizeResult = await callChemServiceNormalize({
      smiles: ocrResult.smiles,
      molfile: ocrResult.molfile ?? undefined,
    });
    normalizedSmiles = normalizeResult.canonical_smiles || ocrResult.smiles;
    normalizedMolfile = normalizeResult.normalized_molfile ?? normalizedMolfile;
    normalizeWarnings.push(...normalizeResult.warnings);
  } catch {
    normalizeWarnings.push("Normalize step failed – using raw OCR smiles");
  }

  const resolvedBlockId = blockId || `mol-${Date.now()}`;
  const action: "update_existing" | "create_new" = blockId ? "update_existing" : "create_new";

  // Cache the molfile for later Ketcher editing
  upsertStructureRecord({
    documentId,
    blockId: resolvedBlockId,
    kind: "molecule",
    smiles: normalizedSmiles,
    molfile: normalizedMolfile,
    source: "ocr",
    confidence: ocrResult.confidence ?? undefined,
  });

  const mapped = mapOcrResponse(
    { ...ocrResult, smiles: normalizedSmiles, molfile: normalizedMolfile ?? null },
    resolvedBlockId,
    action
  );

  return NextResponse.json(
    { ...mapped, warnings: [...mapped.warnings, ...normalizeWarnings] },
    { status: 200 }
  );
};
