import { NextResponse } from "next/server";

import {
  callChemServiceNormalize,
  callChemServiceOcr
} from "../../../../server/chem/chem-service-client";
import { saveStructureRecord } from "../../../../server/chem/structure-store";

export const runtime = "nodejs";

const readFileAsBase64 = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

export const POST = async (request: Request): Promise<Response> => {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "invalid form data" }, { status: 400 });
  }

  const documentId = formData.get("documentId");
  const blockId = formData.get("blockId");
  const image = formData.get("image");

  if (typeof documentId !== "string" || typeof blockId !== "string") {
    return NextResponse.json({ message: "documentId and blockId are required" }, { status: 400 });
  }

  if (!(image instanceof File)) {
    return NextResponse.json({ message: "image file is required" }, { status: 400 });
  }

  try {
    const imageBase64 = await readFileAsBase64(image);
    const ocr = await callChemServiceOcr(imageBase64, image.type || "image/png");

    if (!ocr.structure?.smiles && !ocr.structure?.molfile) {
      return NextResponse.json(
        {
          status: ocr.status,
          blockId,
          action: "update_existing",
          warnings: ocr.warnings
        },
        { status: 422 }
      );
    }

    const normalized = await callChemServiceNormalize({
      smiles: ocr.structure.smiles,
      molfile: ocr.structure.molfile
    });

    saveStructureRecord({
      documentId,
      blockId,
      smiles: normalized.canonicalSmiles,
      molfile: normalized.normalizedMolfile,
      source: "ocr",
      confidence: ocr.confidence
    });

    return NextResponse.json({
      status: "ok",
      blockId,
      action: "update_existing",
      structure: {
        smiles: normalized.canonicalSmiles,
        molfile: normalized.normalizedMolfile
      },
      confidence: ocr.confidence,
      warnings: [...(ocr.warnings ?? []), ...(normalized.warnings ?? [])]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ocr failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};
