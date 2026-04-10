import { classifyReactionConditions } from "@chemd/core";

import {
  callChemServiceNormalize,
  callChemServiceReactionRender,
  callChemServiceRender
} from "./chem-service-client";
import {
  isCasResolutionError,
  resolveChemicalNotation,
  resolveChemicalNotationList
} from "./cas-resolver";
import { readErrorMessage, readErrorStatus } from "./chem-service-error";
import type {
  MoleculeRenderRouteInput,
  MoleculeSaveRouteInput,
  ReactionPayload,
  ReactionRenderRouteInput,
  ReactionSaveRouteInput
} from "./dto";
import { buildMoleculeLoadingResult, jsonResult, type JsonRouteResult } from "./route-responses";
import { saveStructureRecord } from "./structure-store";

const hydrateReactionPayload = async (
  reactants: string[],
  products: string[],
  conditions: string[]
): Promise<ReactionPayload> => {
  const [hydratedReactants, hydratedProducts] = await Promise.all([
    resolveChemicalNotationList(reactants),
    resolveChemicalNotationList(products)
  ]);

  return {
    reactants: hydratedReactants,
    products: hydratedProducts,
    conditions
  };
};

export const renderMoleculeNotation = async (
  input: MoleculeRenderRouteInput
): Promise<JsonRouteResult<Record<string, unknown>>> => {
  try {
    const resolvedSmiles = input.smiles ? await resolveChemicalNotation(input.smiles) : undefined;
    const rendered = await callChemServiceRender({
      kind: "molecule",
      smiles: resolvedSmiles,
      molfile: input.molfile,
      renderOptions: input.renderOptions
    });

    return jsonResult({
      ...rendered,
      type: "molecule"
    });
  } catch (error) {
    if (isCasResolutionError(error)) {
      throw error;
    }

    return buildMoleculeLoadingResult(readErrorMessage(error, "render failed"));
  }
};

export const renderReactionNotation = async (
  input: ReactionRenderRouteInput
): Promise<JsonRouteResult<Record<string, unknown>>> => {
  const reaction = await hydrateReactionPayload(input.reactants, input.products, input.conditions);

  try {
    const rendered = await callChemServiceReactionRender({
      kind: "reaction",
      reactants: reaction.reactants,
      products: reaction.products,
      conditions: reaction.conditions,
      renderOptions: input.renderOptions
    });

    return jsonResult({
      ...rendered,
      type: "reaction",
      reaction: rendered.reaction ?? reaction,
      normalized_conditions:
        rendered.normalized_conditions ?? classifyReactionConditions(reaction)
    });
  } catch (error) {
    if (isCasResolutionError(error)) {
      throw error;
    }

    return jsonResult(
      {
        type: "reaction",
        message: readErrorMessage(error, "render failed"),
        reaction,
        normalized_conditions: classifyReactionConditions(reaction)
      },
      readErrorStatus(error, 502)
    );
  }
};

export const saveMoleculeNotation = async (
  input: MoleculeSaveRouteInput
): Promise<JsonRouteResult<Record<string, unknown>>> => {
  const resolvedSmiles = input.smiles ? await resolveChemicalNotation(input.smiles) : undefined;
  const normalized = await callChemServiceNormalize({
    smiles: resolvedSmiles,
    molfile: input.molfile
  });

  await saveStructureRecord({
    kind: "molecule",
    documentId: input.documentId,
    blockId: input.blockId,
    sessionId: input.sessionId,
    smiles: normalized.canonicalSmiles,
    molfile: normalized.normalizedMolfile,
    source: "ketcher"
  });

  return jsonResult({
    blockId: input.blockId,
    type: "molecule",
    smiles: normalized.canonicalSmiles,
    molfile: normalized.normalizedMolfile,
    warnings: normalized.warnings
  });
};

export const saveReactionNotation = async (
  input: ReactionSaveRouteInput
): Promise<JsonRouteResult<Record<string, unknown>>> => {
  const reaction = await hydrateReactionPayload(input.reactants, input.products, input.conditions);

  await saveStructureRecord({
    kind: "reaction",
    documentId: input.documentId,
    blockId: input.blockId,
    sessionId: input.sessionId,
    reactants: reaction.reactants,
    products: reaction.products,
    conditions: reaction.conditions,
    reactionSmiles: input.reactionSmiles,
    rxnfile: input.rxnfile,
    source: "ketcher"
  });

  return jsonResult({
    blockId: input.blockId,
    type: "reaction",
    reactants: reaction.reactants,
    products: reaction.products,
    conditions: reaction.conditions,
    reactionSmiles: input.reactionSmiles,
    rxnfile: input.rxnfile
  });
};
