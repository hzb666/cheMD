import { NextResponse } from "next/server";
import { classifyReactionConditions } from "@chemd/core";

import {
  callChemServiceNormalize,
  callChemServiceOcr,
  callChemServiceReactionOcr
} from "../../../../server/chem/chem-service-client";
import { requireMatchingSessionToken } from "../../../../server/chem/session-guard";
import { saveStructureRecord } from "../../../../server/chem/structure-store";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const readFileAsBase64 = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
};

const hasPlaceholderStructure = (
  ocr: Awaited<ReturnType<typeof callChemServiceOcr>>
): boolean =>
  ocr.structure?.molfile === "MOLFILE_PLACEHOLDER"
  || (ocr.warnings ?? []).some((warning) => warning.toLowerCase().includes("placeholder"));

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : []
);

const hasPlaceholderReaction = (
  ocr: Awaited<ReturnType<typeof callChemServiceReactionOcr>>
): boolean =>
  (ocr.warnings ?? []).some((warning) => warning.toLowerCase().includes("placeholder"));

const REACTION_OCR_FALLBACK_WARNING = "reaction ocr fallback";

export const POST = async (request: Request): Promise<Response> => {
  const sessionError = requireMatchingSessionToken(request);
  if (sessionError) {
    return sessionError;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ message: "invalid form data" }, { status: 400 });
  }

  const documentId = formData.get("documentId");
  const blockId = formData.get("blockId");
  const sessionId = formData.get("sessionId");
  const image = formData.get("image");

  if (
    typeof documentId !== "string"
    || typeof blockId !== "string"
    || typeof sessionId !== "string"
  ) {
    return NextResponse.json({ message: "documentId, blockId, and sessionId are required" }, { status: 400 });
  }

  if (!(image instanceof File)) {
    return NextResponse.json({ message: "image file is required" }, { status: 400 });
  }

  if (!image.type.startsWith("image/")) {
    return NextResponse.json({ message: "image upload must use an image mime type" }, { status: 400 });
  }

  if (image.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ message: "image upload is too large" }, { status: 413 });
  }

  try {
    const imageBase64 = await readFileAsBase64(image);
    const reactionOcr = await callChemServiceReactionOcr(imageBase64, image.type || "image/png");
    const reactants = normalizeStringArray(reactionOcr.reaction?.reactants);
    const products = normalizeStringArray(reactionOcr.reaction?.products);
    const conditions = normalizeStringArray(reactionOcr.reaction?.conditions);

    if (reactants.length > 0 && products.length > 0 && !hasPlaceholderReaction(reactionOcr)) {
      await saveStructureRecord({
        kind: "reaction",
        documentId,
        blockId,
        sessionId,
        reactants,
        products,
        conditions,
        source: "ocr",
        confidence: reactionOcr.confidence
      });

      return NextResponse.json({
        status: "ok",
        kind: "reaction",
        blockId,
        action: "update_existing",
        reaction: {
          reactants,
          products,
          conditions
        },
        normalized_conditions: classifyReactionConditions({ conditions }),
        confidence: reactionOcr.confidence,
        warnings: reactionOcr.warnings ?? []
      });
    }

    const ocr = await callChemServiceOcr(imageBase64, image.type || "image/png");

    if ((!ocr.structure?.smiles && !ocr.structure?.molfile) || hasPlaceholderStructure(ocr)) {
      return NextResponse.json(
        {
          status: "failed",
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

    await saveStructureRecord({
      kind: "molecule",
      documentId,
      blockId,
      sessionId,
      smiles: normalized.canonicalSmiles,
      molfile: normalized.normalizedMolfile,
      source: "ocr",
      confidence: ocr.confidence
    });

    return NextResponse.json({
      status: "ok",
      kind: "molecule",
      blockId,
      action: "update_existing",
      structure: {
        smiles: normalized.canonicalSmiles,
        molfile: normalized.normalizedMolfile
      },
      confidence: ocr.confidence,
      warnings: [
        ...(reactionOcr.warnings?.length
          ? [REACTION_OCR_FALLBACK_WARNING, ...reactionOcr.warnings]
          : [REACTION_OCR_FALLBACK_WARNING]),
        ...(ocr.warnings ?? []),
        ...(normalized.warnings ?? [])
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ocr failed";
    return NextResponse.json({ message }, { status: 502 });
  }
};
