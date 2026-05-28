import {
  type ChemdReactionIntelligenceJobInputV1,
  type ChemdReactionIntelligenceProviderKindV1
} from "@chemd/reaction-map";
import { createSourceHash, type ChemdLanguageCompileOutput } from "@chemd/language-service";

export type ReactionIntelligenceJobBuildState = "ready" | "skipped";

export interface ReactionIntelligenceJobBuildInput {
  compileOutput: ChemdLanguageCompileOutput;
  source: string;
  documentUri: string;
  requestedProviders?: ChemdReactionIntelligenceProviderKindV1[];
}

export interface ReactionIntelligenceJobBuildResult {
  state: ReactionIntelligenceJobBuildState;
  job: ChemdReactionIntelligenceJobInputV1 | null;
  message: string;
  reactionCount: number;
  skippedReactionIds: string[];
}

const DEFAULT_PROVIDERS: ChemdReactionIntelligenceProviderKindV1[] = [
  "rdkit_fingerprint",
  "hybrid_graph",
  "tmap_layout"
];

const normalizeDocumentUri = (value: string): string =>
  value.trim().length > 0 ? value.trim() : "desktop-document";

const sourceHashForReaction = (source: string, reactionId: string): string => {
  const reactionSource = `${source}\n${reactionId}`;
  return `fnv1a:${createSourceHash(reactionSource)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const readProgramStringValue = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return readString(value);
  }
  return readString(value.value)
    ?? readString(value.raw)
    ?? readString(value.name);
};

const normalizeReferenceId = (value: string | undefined): string | undefined => {
  const token = value?.split("|")[0]?.trim().split(/[,\s]+/u)[0]?.trim();
  if (!token) {
    return undefined;
  }
  return token.replace(/^[@#]/u, "").split("#").at(-1);
};

const addStructure = (
  structures: Map<string, string>,
  id: string | undefined,
  smiles: string | undefined
): void => {
  const normalizedId = normalizeReferenceId(id);
  if (normalizedId && smiles) {
    structures.set(normalizedId, smiles);
  }
};

const buildStructureById = (
  compileOutput: Extract<ChemdLanguageCompileOutput, { status: "ok" }>
): Map<string, string> => {
  const structures = new Map<string, string>();
  for (const molecule of compileOutput.result.trainingExport.semantic_layer.molecules) {
    const record = molecule as unknown as Record<string, unknown>;
    const smiles = readString(record.canonical_smiles) ?? readString(record.smiles);
    addStructure(structures, readString(record.original_id), smiles);
    addStructure(structures, readString(record.entity_id), smiles);
  }
  for (const declaration of compileOutput.result.program?.declarations ?? []) {
    if (
      declaration.kind !== "molecule"
      && declaration.kind !== "material"
      && declaration.kind !== "batch"
    ) {
      continue;
    }
    addStructure(
      structures,
      declaration.id,
      readProgramStringValue(declaration.fields.smiles)
    );
  }
  return structures;
};

const participantSmiles = (
  participants: readonly {
    canonical_smiles?: string;
    smiles?: string;
    target_original_id?: string;
    raw: string;
  }[],
  structures: ReadonlyMap<string, string>
): string[] | null => {
  const values = participants.map((participant) =>
    participant.canonical_smiles?.trim()
    || participant.smiles?.trim()
    || structures.get(normalizeReferenceId(participant.target_original_id) ?? "")
    || structures.get(normalizeReferenceId(participant.raw) ?? "")
    || ""
  );
  return values.length > 0 && values.every((value) => value.length > 0)
    ? values
    : null;
};

const joinParticipantIds = (
  participants: readonly { target_original_id?: string; raw: string }[]
): string =>
  participants.map((participant) =>
    participant.target_original_id?.trim() || participant.raw.trim()
  ).filter(Boolean).join("+");

export const buildReactionIntelligenceJob = ({
  compileOutput,
  source,
  documentUri,
  requestedProviders = DEFAULT_PROVIDERS
}: ReactionIntelligenceJobBuildInput): ReactionIntelligenceJobBuildResult => {
  if (compileOutput.status === "failed") {
    return {
      state: "skipped",
      job: null,
      message: "Compile failed; reaction intelligence job was not created.",
      reactionCount: 0,
      skippedReactionIds: []
    };
  }

  const documentId = normalizeDocumentUri(compileOutput.result.trainingExport.document.document_id || documentUri);
  const sourceHash = createSourceHash(source);
  const structures = buildStructureById(compileOutput);
  const skippedReactionIds: string[] = [];
  const reactions = compileOutput.result.trainingExport.semantic_layer.reactions.flatMap((reaction) => {
    const reactionId = reaction.original_id ?? reaction.entity_id;
    const reactants = participantSmiles(reaction.reactants, structures);
    const products = participantSmiles(reaction.products, structures);
    if (!reactants || !products) {
      skippedReactionIds.push(reactionId);
      return [];
    }

    return [{
      reaction_entity_id: reactionId,
      document_id: documentId,
      source_range: reaction.field_source_spans,
      canonical_rxn_smiles: `${reactants.join(".")}>>${products.join(".")}`,
      participant_signature: `${joinParticipantIds(reaction.reactants)}=>${joinParticipantIds(reaction.products)}`,
      reaction_family: reaction.name ?? reaction.caption,
      procedure_signature: reaction.route_raw,
      condition_signature: reaction.conditions_raw?.join(" | "),
      source_hash: sourceHashForReaction(source, reactionId)
    }];
  });

  if (reactions.length === 0) {
    return {
      state: "skipped",
      job: null,
      message: skippedReactionIds.length > 0
        ? "Reaction intelligence requires reactant/product SMILES for at least one reaction."
        : "No reactions were available for reaction intelligence.",
      reactionCount: 0,
      skippedReactionIds
    };
  }

  return {
    state: "ready",
    job: {
      schema_version: "chemd-reaction-intelligence-job/v0.1",
      job_id: `desktop-reaction-intelligence-job::${sourceHash}`,
      graph_index_id: `desktop-knowledge-map::${documentId}`,
      source_compile_run_ids: [`desktop-compile::${sourceHash}`],
      reactions,
      requested_providers: requestedProviders,
      provider_policy: {
        missing_dependency: "skip",
        per_reaction_failure: "warn",
        allow_network: false
      }
    },
    message: skippedReactionIds.length > 0
      ? `Reaction intelligence job is ready with ${reactions.length} reaction(s); ${skippedReactionIds.length} reaction(s) lack structure data.`
      : `Reaction intelligence job is ready with ${reactions.length} reaction(s).`,
    reactionCount: reactions.length,
    skippedReactionIds
  };
};
