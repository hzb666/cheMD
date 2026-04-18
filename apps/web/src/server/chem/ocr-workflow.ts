import { classifyReactionConditions } from "@chemd/core";

import {
  callChemServiceNormalize,
  callChemServiceOcr,
  callChemServiceReactionOcr
} from "./chem-service-client";
import type { OcrResponse, OcrWritebackInput, ReactionOcrResponse, ReactionPayload } from "./dto";
import { readFileAsBase64 } from "./request-parsers";
import { buildOcrFailedResult, jsonResult, type JsonRouteResult } from "./route-responses";
import {
  resolveFailedWritebackTarget,
  resolveMoleculeWritebackTarget,
  resolveReactionWritebackTarget
} from "./reaction-target";
import { saveStructureRecord } from "./structure-store";

const REACTION_OCR_FALLBACK_WARNING = "reaction ocr fallback";

const normalizeStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    : []
);

const hasPlaceholderStructure = (ocr: OcrResponse): boolean =>
  ocr.placeholder === true
  || ocr.structure?.molfile === "MOLFILE_PLACEHOLDER"
  || (ocr.warnings ?? []).some((warning) => warning.toLowerCase().includes("placeholder"));

const hasPlaceholderReaction = (ocr: ReactionOcrResponse): boolean =>
  ocr.placeholder === true
  || (ocr.warnings ?? []).some((warning) => warning.toLowerCase().includes("placeholder"));

const readReactionPayload = (ocr: ReactionOcrResponse): ReactionPayload => ({
  reactants: normalizeStringArray(ocr.reaction?.reactants),
  products: normalizeStringArray(ocr.reaction?.products),
  conditions: normalizeStringArray(ocr.reaction?.conditions)
});

const normalizedMoleculePayload = (
  normalized: Awaited<ReturnType<typeof callChemServiceNormalize>>
): Record<string, unknown> =>
  normalized.normalized ?? {
    canonicalSmiles: normalized.canonicalSmiles,
    normalizedMolfile: normalized.normalizedMolfile
  };

const normalizedReactionPayload = (reaction: ReactionPayload): Record<string, unknown> => ({
  reactants: reaction.reactants,
  products: reaction.products,
  conditions: reaction.conditions,
  ...(reaction.reactionSmiles ? { reactionSmiles: reaction.reactionSmiles } : {}),
  ...(reaction.rxnfile ? { rxnfile: reaction.rxnfile } : {})
});

const providerFields = (provider: string | undefined): { provider?: string } =>
  provider ? { provider } : {};

const isUsableReactionPayload = (reaction: ReactionPayload, ocr: ReactionOcrResponse): boolean =>
  reaction.reactants.length > 0
  && reaction.products.length > 0
  && !hasPlaceholderReaction(ocr);

const buildReactionSuccessResult = (
  reaction: ReactionPayload,
  confidence: number | undefined,
  warnings: string[] | undefined,
  target: { blockId: string; action: "update_existing" | "create_new" }
): JsonRouteResult<Record<string, unknown>> =>
  jsonResult({
    status: "ok",
    kind: "reaction",
    blockId: target.blockId,
    action: target.action,
    reaction,
    normalized_conditions: classifyReactionConditions(reaction),
    confidence,
    warnings: warnings ?? []
  });

export const runReactionOcrWorkflow = async (
  input: OcrWritebackInput
): Promise<JsonRouteResult<Record<string, unknown>>> => {
  const imageBase64 = await readFileAsBase64(input.image);
  const ocr = await callChemServiceReactionOcr(imageBase64, input.image.type || "image/png");
  const reaction = readReactionPayload(ocr);
  const target = resolveReactionWritebackTarget(input.targets);

  if (!isUsableReactionPayload(reaction, ocr)) {
    return buildOcrFailedResult(target, ocr.warnings);
  }

  await saveStructureRecord({
    kind: "reaction",
    documentId: input.documentId,
    blockId: target.blockId,
    sessionId: input.sessionId,
    reactants: reaction.reactants,
    products: reaction.products,
    conditions: reaction.conditions,
    source: "ocr",
    confidence: ocr.confidence,
    ...providerFields(ocr.provider),
    normalized: ocr.normalized ? normalizedReactionPayload(ocr.normalized) : normalizedReactionPayload(reaction)
  });

  return buildReactionSuccessResult(reaction, ocr.confidence, ocr.warnings, target);
};

export const runReactionFirstOcrWorkflow = async (
  input: OcrWritebackInput
): Promise<JsonRouteResult<Record<string, unknown>>> => {
  const imageBase64 = await readFileAsBase64(input.image);
  const reactionOcr = await callChemServiceReactionOcr(imageBase64, input.image.type || "image/png");
  const reaction = readReactionPayload(reactionOcr);

  if (isUsableReactionPayload(reaction, reactionOcr)) {
    const reactionTarget = resolveReactionWritebackTarget(input.targets);
    await saveStructureRecord({
      kind: "reaction",
      documentId: input.documentId,
      blockId: reactionTarget.blockId,
      sessionId: input.sessionId,
      reactants: reaction.reactants,
      products: reaction.products,
      conditions: reaction.conditions,
      source: "ocr",
      confidence: reactionOcr.confidence,
      ...providerFields(reactionOcr.provider),
      normalized: reactionOcr.normalized
        ? normalizedReactionPayload(reactionOcr.normalized)
        : normalizedReactionPayload(reaction)
    });

    return buildReactionSuccessResult(reaction, reactionOcr.confidence, reactionOcr.warnings, reactionTarget);
  }

  const moleculeOcr = await callChemServiceOcr(imageBase64, input.image.type || "image/png");
  if ((!moleculeOcr.structure?.smiles && !moleculeOcr.structure?.molfile) || hasPlaceholderStructure(moleculeOcr)) {
    return buildOcrFailedResult(resolveFailedWritebackTarget(input.targets), moleculeOcr.warnings);
  }

  const normalized = await callChemServiceNormalize({
    smiles: moleculeOcr.structure.smiles,
    molfile: moleculeOcr.structure.molfile
  });
  const moleculeTarget = resolveMoleculeWritebackTarget(input.targets);

  await saveStructureRecord({
    kind: "molecule",
    documentId: input.documentId,
    blockId: moleculeTarget.blockId,
    sessionId: input.sessionId,
    smiles: normalized.canonicalSmiles,
    molfile: normalized.normalizedMolfile,
    source: "ocr",
    confidence: moleculeOcr.confidence,
    ...providerFields(normalized.provider ?? moleculeOcr.provider),
    normalized: normalizedMoleculePayload(normalized)
  });

  return jsonResult({
    status: "ok",
    kind: "molecule",
    blockId: moleculeTarget.blockId,
    action: moleculeTarget.action,
    structure: {
      smiles: normalized.canonicalSmiles,
      molfile: normalized.normalizedMolfile
    },
    confidence: moleculeOcr.confidence,
    warnings: [
      ...(reactionOcr.warnings?.length
        ? [REACTION_OCR_FALLBACK_WARNING, ...reactionOcr.warnings]
        : [REACTION_OCR_FALLBACK_WARNING]),
      ...(moleculeOcr.warnings ?? []),
      ...(normalized.warnings ?? [])
    ]
  });
};
