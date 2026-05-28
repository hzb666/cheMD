import type {
  ChemdDeclaration,
  ChemdFieldDeclarationBase,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue
} from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

type SemanticLayer = ChemdTrainingExportV2["semantic_layer"];
type SemanticRelation = SemanticLayer["links"][number];
type ProgramFieldDeclaration = Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>;

const ENTITY_PREFIX: Partial<Record<ChemdDeclaration["kind"], string>> = {
  analysis: "ana",
  artifact: "art",
  batch: "bat",
  condition_screen: "cv",
  material: "mat",
  molecule: "mol",
  reaction: "rxn",
  result: "res",
  sample: "sam"
};

const hasFields = (declaration: ChemdDeclaration): declaration is ProgramFieldDeclaration =>
  "fields" in declaration;

const field = (
  declaration: ChemdFieldDeclarationBase,
  name: string
): ChemdValue | undefined => declaration.fields[name];

const raw = (value: ChemdValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.type === "string") return value.value;
  if (value.type === "identifier") return value.name;
  return value.raw;
};

const refTarget = (value: ChemdValue | undefined): string | undefined =>
  value?.type === "reference" ? value.target : raw(value)?.replace(/^@/, "");

const refs = (value: ChemdValue | undefined): ChemdReferenceExpr[] => {
  if (!value) return [];
  if (value.type === "reference") return [value];
  return value.type === "list"
    ? value.items.filter((item): item is ChemdReferenceExpr => item.type === "reference")
    : [];
};

const rawList = (value: ChemdValue | undefined): string[] => {
  if (!value) return [];
  return value.type === "list"
    ? value.items.map(raw).filter((item): item is string => Boolean(item))
    : [raw(value)].filter((item): item is string => Boolean(item));
};

const entityId = (
  documentId: string,
  kind: ChemdDeclaration["kind"],
  id: string,
  index: number
): string => `${ENTITY_PREFIX[kind] ?? "decl"}::${documentId}::${id || index}`;

const base = (
  documentId: string,
  declaration: ChemdFieldDeclarationBase,
  index: number
) => ({
  entity_id: entityId(documentId, declaration.kind, declaration.id, index),
  original_id: declaration.id,
  node_index: index,
  source_block_type: declaration.kind,
  syntax_origin: "program_declaration",
  field_source_spans: declaration.fieldSpans
});

const isPrimary = (
  program: ChemdProgramDocument,
  kind: ChemdDeclaration["kind"],
  id: string
): boolean => {
  if (kind === "molecule") return program.meta.primary?.molecule?.target === id;
  if (kind === "reaction") return program.meta.primary?.reaction?.target === id;
  if (kind === "result") return program.meta.primary?.result?.target === id;
  if (kind === "analysis") return program.meta.primary?.analysis?.target === id;
  if (kind === "sample") return program.meta.primary?.sample?.target === id;
  return false;
};

const participant = (
  role: "reactant" | "product",
  value: string,
  reference?: ChemdReferenceExpr
) => {
  return {
    role,
    raw: value,
    reference_status: reference ? "resolved" as const : "literal" as const,
    ...(reference ? { target_original_id: reference.target } : {})
  };
};

const relation = (
  documentId: string,
  relationType: SemanticRelation["relation_type"],
  fromEntityId: string,
  toEntityId: string,
  role: string
): SemanticRelation => ({
  relation_id: `${documentId}:${relationType}:${fromEntityId}:${toEntityId}:${role}`,
  relation_type: relationType,
  from_entity_id: fromEntityId,
  to_entity_id: toEntityId,
  role
});

const emptySemanticLayer = (baseLayer: SemanticLayer): SemanticLayer => ({
  ...baseLayer,
  analyses: [],
  artifacts: [],
  batches: [],
  condition_variation_attempts: [],
  condition_variations: [],
  links: [],
  materials: [],
  molecules: [],
  reactions: [],
  results: [],
  samples: []
});

export const applyProgramSemanticLayer = (
  record: ChemdTrainingExportV2,
  program: ChemdProgramDocument
): ChemdTrainingExportV2 => {
  const documentId = program.meta.id;
  const semanticLayer = emptySemanticLayer(record.semantic_layer);
  const entityByDeclarationId = new Map<string, { entityId: string; kind: ChemdDeclaration["kind"] }>();

  program.declarations.forEach((declaration, index) => {
    if (!hasFields(declaration) || !ENTITY_PREFIX[declaration.kind]) return;
    const entity = entityId(documentId, declaration.kind, declaration.id, index);
    entityByDeclarationId.set(declaration.id, { entityId: entity, kind: declaration.kind });
  });

  program.declarations.forEach((declaration, index) => {
    if (!hasFields(declaration)) return;
    const common = {
      ...base(documentId, declaration, index),
      ...(isPrimary(program, declaration.kind, declaration.id) ? { is_primary: true } : {})
    };

    if (declaration.kind === "molecule") {
      semanticLayer.molecules.push({
        ...common,
        source_node_type: "molecule",
        name: raw(field(declaration, "name")),
        role: raw(field(declaration, "role")),
        smiles: raw(field(declaration, "smiles")),
        text_for_embedding: [raw(field(declaration, "name")), raw(field(declaration, "smiles"))]
          .filter(Boolean)
          .join(" ")
      });
    }

    if (declaration.kind === "reaction") {
      const reactants = rawList(field(declaration, "reactants"));
      const products = rawList(field(declaration, "products"));
      const reactantRefs = refs(field(declaration, "reactants"));
      const productRefs = refs(field(declaration, "products"));
      semanticLayer.reactions.push({
        ...common,
        source_node_type: "reaction",
        reactants: rawList(field(declaration, "reactants")).map((value, valueIndex) =>
          participant("reactant", value, reactantRefs[valueIndex])
        ),
        products: rawList(field(declaration, "products")).map((value, valueIndex) =>
          participant("product", value, productRefs[valueIndex])
        ),
        route_raw: raw(field(declaration, "route")),
        prev_refs_raw: rawList(field(declaration, "prev")),
        solvent_raw: raw(field(declaration, "solvent")),
        temperature_raw: raw(field(declaration, "temperature")),
        time_raw: raw(field(declaration, "time")),
        reagents_raw: raw(field(declaration, "reagents")),
        catalyst_raw: raw(field(declaration, "catalyst")),
        atmosphere_raw: raw(field(declaration, "atmosphere")),
        normalized_conditions: {},
        normalized_outcome_hints: {},
        text_for_embedding: [...reactants, ...products].join(" ")
      });
    }

    if (declaration.kind === "result") {
      const target = "target" in declaration ? declaration.target?.target : undefined;
      semanticLayer.results.push({
        ...common,
        source_node_type: "result",
        ref_raw: target ? `@${target}` : undefined,
        reaction_ref_raw: target ? `@${target}` : refTarget(field(declaration, "reaction")),
        product_ref_raw: refTarget(field(declaration, "product")),
        status_raw: raw(field(declaration, "status")),
        status_label: raw(field(declaration, "status")) as "success" | "partial" | "failed" | "unknown" | undefined,
        yield_raw: raw(field(declaration, "yield")),
        conversion_raw: raw(field(declaration, "conversion")),
        selectivity_raw: raw(field(declaration, "selectivity")),
        purity_raw: raw(field(declaration, "purity")),
        notes: raw(field(declaration, "notes"))
      });
    }

    if (declaration.kind === "analysis") {
      const target = "target" in declaration ? declaration.target?.target : undefined;
      semanticLayer.analyses.push({
        ...common,
        source_node_type: "analysis",
        analysis_type: raw(field(declaration, "type")),
        ref_raw: target ? `@${target}` : refTarget(field(declaration, "ref")),
        notes: raw(field(declaration, "notes")),
        normalized_analysis: null,
        normalized_tlc: null
      });
    }

    if (declaration.kind === "sample") {
      semanticLayer.samples.push({
        ...common,
        source_node_type: "sample",
        name: raw(field(declaration, "name")),
        ref_raw: refTarget(field(declaration, "ref")),
        derived_from_raw: refTarget(field(declaration, "derived_from")),
        artifact_refs_raw: refs(field(declaration, "artifacts")).map((item) => item.target)
      });
    }

    if (declaration.kind === "artifact") {
      semanticLayer.artifacts.push({
        ...common,
        source_node_type: "artifact",
        artifact_kind: raw(field(declaration, "kind")),
        ref_raw: refTarget(field(declaration, "ref")),
        path: raw(field(declaration, "path"))
      });
    }
  });

  for (const reaction of semanticLayer.reactions) {
    for (const participantItem of [...reaction.reactants, ...reaction.products]) {
      const target = participantItem.target_original_id
        ? entityByDeclarationId.get(participantItem.target_original_id)
        : undefined;
      if (!target) continue;
      semanticLayer.links.push(relation(
        documentId,
        participantItem.role === "reactant" ? "reaction_uses_molecule" : "reaction_produces_molecule",
        reaction.entity_id,
        target.entityId,
        participantItem.role
      ));
    }
  }

  for (const result of semanticLayer.results) {
    const reactionId = result.reaction_ref_raw?.replace(/^@/, "");
    const target = reactionId ? entityByDeclarationId.get(reactionId) : undefined;
    if (target?.kind === "reaction") {
      semanticLayer.links.push(relation(documentId, "result_describes_reaction", result.entity_id, target.entityId, "reaction"));
    }
  }

  return {
    ...record,
    semantic_layer: semanticLayer
  };
};
