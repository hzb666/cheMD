import type {
  AnalysisNode,
  ChemdDocument,
  ChemdNode,
  MarkdownNode,
  MoleculeNode,
  ReactionNode,
  ResultNode,
  SampleNode
} from "@chemd/core";

import type {
  ExportedAnalysisV1,
  ExportedMarkdownBlockV1,
  ExportedMoleculeV1,
  ExportedReactionV1,
  ExportedRelationV1,
  ExportedResultV1,
  ExportedSampleV1,
  ReactionParticipantV1,
  SemanticLayerV1
} from "./types";

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const compactText = (...parts: Array<string | undefined>): string | undefined => {
  const text = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ");

  return text || undefined;
};

const buildEntityId = (
  prefix: "mol" | "rxn" | "res" | "ana" | "sam" | "md",
  documentId: string,
  originalId: string | undefined,
  nodeIndex: number
): string => `${prefix}::${documentId}::${originalId ?? nodeIndex}`;

type PrimaryNodeType = "molecule" | "reaction" | "result" | "analysis" | "sample";

const PRIMARY_FIELD_BY_TYPE: Record<PrimaryNodeType, string> = {
  molecule: "primary_molecule",
  reaction: "primary_reaction",
  result: "primary_result",
  analysis: "primary_analysis",
  sample: "primary_sample"
};

const getOriginalId = (node: ChemdNode): string | undefined => {
  if ("id" in node && typeof node.id === "string" && node.id) {
    return node.id;
  }

  return undefined;
};

const isPrimaryEntity = (document: ChemdDocument, node: ChemdNode): boolean => {
  const originalId = getOriginalId(node);
  if (!originalId) {
    return false;
  }

  if (!["molecule", "reaction", "result", "analysis", "sample"].includes(node.type)) {
    return false;
  }

  const field = PRIMARY_FIELD_BY_TYPE[node.type as PrimaryNodeType];
  return document.meta[field] === originalId;
};

const asNodeArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const buildMolecule = (
  documentId: string,
  node: MoleculeNode,
  nodeIndex: number,
  isPrimary: boolean
): ExportedMoleculeV1 => ({
  entity_id: buildEntityId("mol", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "molecule",
  ...(isPrimary ? { is_primary: true } : {}),
  name: node.name,
  role: node.role,
  caption: node.caption,
  smiles: node.smiles,
  formula: node.formula,
  amount_raw: node.amount,
  equivalents_raw: node.equivalents,
  text_for_embedding: compactText(node.name, node.smiles, node.role, node.formula, node.caption)
});

const createParticipant = (
  role: "reactant" | "product",
  raw: string,
  moleculeByOriginalId: Map<string, ExportedMoleculeV1>
): ReactionParticipantV1 => {
  if (!raw.startsWith("@")) {
    return {
      role,
      raw,
      reference_status: "literal"
    };
  }

  const candidateId = raw.slice(1).trim();
  const molecule = moleculeByOriginalId.get(candidateId);

  if (!molecule) {
    return {
      role,
      raw,
      reference_status: "unresolved"
    };
  }

  return {
    role,
    raw,
    reference_status: "resolved",
    target_entity_id: molecule.entity_id,
    target_original_id: molecule.original_id,
    name: molecule.name,
    smiles: molecule.smiles,
    canonical_smiles: molecule.canonical_smiles
  };
};

const buildReaction = (
  documentId: string,
  node: ReactionNode,
  nodeIndex: number,
  isPrimary: boolean,
  moleculeByOriginalId: Map<string, ExportedMoleculeV1>
): ExportedReactionV1 => {
  const reactants = asNodeArray(node.reactants).map((raw) => createParticipant("reactant", raw, moleculeByOriginalId));
  const products = asNodeArray(node.products).map((raw) => createParticipant("product", raw, moleculeByOriginalId));

  return {
    entity_id: buildEntityId("rxn", documentId, node.id, nodeIndex),
    original_id: node.id,
    node_index: nodeIndex,
    source_node_type: "reaction",
    ...(isPrimary ? { is_primary: true } : {}),
    name: node.name,
    caption: node.caption,
    reactants,
    products,
    reagents_raw: node.reagents,
    catalyst_raw: node.catalyst,
    solvent_raw: node.solvent,
    temperature_raw: node.temperature,
    time_raw: node.time,
    pressure_raw: node.pressure,
    atmosphere_raw: node.atmosphere,
    yield_raw: node.yield,
    conversion_raw: node.conversion,
    selectivity_raw: node.selectivity,
    normalized_conditions: {},
    normalized_outcome_hints: {},
    text_for_embedding: compactText(
      node.name,
      node.caption,
      node.solvent,
      node.catalyst,
      node.reagents,
      node.temperature,
      node.time,
      node.pressure,
      node.atmosphere,
      node.yield,
      node.conversion,
      node.selectivity
    )
  };
};

const buildResult = (
  documentId: string,
  node: ResultNode,
  nodeIndex: number,
  isPrimary: boolean
): ExportedResultV1 => ({
  entity_id: buildEntityId("res", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "result",
  ...(isPrimary ? { is_primary: true } : {}),
  status_raw: node.status,
  yield_raw: node.yield,
  conversion_raw: node.conversion,
  selectivity_raw: node.selectivity,
  isolated_mass_raw: node.isolated_mass,
  product_state: node.product_state,
  purity_raw: node.purity,
  notes: node.notes,
  text_for_embedding: compactText(
    node.status,
    node.notes,
    node.yield,
    node.conversion,
    node.selectivity,
    node.purity
  )
});

const buildAnalysis = (
  documentId: string,
  node: AnalysisNode,
  nodeIndex: number,
  isPrimary: boolean
): ExportedAnalysisV1 => ({
  entity_id: buildEntityId("ana", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "analysis",
  ...(isPrimary ? { is_primary: true } : {}),
  analysis_type: node.type_name,
  instrument: node.instrument,
  solvent: node.solvent,
  frequency: node.frequency,
  method: node.method,
  data_raw: node.data,
  notes: node.notes,
  text_for_embedding: compactText(node.type_name, node.instrument, node.method, node.data, node.notes)
});

const buildSample = (
  documentId: string,
  node: SampleNode,
  nodeIndex: number,
  isPrimary: boolean
): ExportedSampleV1 => ({
  entity_id: buildEntityId("sam", documentId, node.id, nodeIndex),
  original_id: node.id,
  node_index: nodeIndex,
  source_node_type: "sample",
  ...(isPrimary ? { is_primary: true } : {}),
  name: node.name,
  sample_code: node.sample_id,
  batch: node.batch,
  purity_raw: node.purity,
  supplier: node.supplier,
  notes: node.notes,
  text_for_embedding: compactText(node.name, node.batch, node.supplier, node.notes)
});

const buildMarkdown = (documentId: string, node: MarkdownNode, nodeIndex: number): ExportedMarkdownBlockV1 => ({
  entity_id: buildEntityId("md", documentId, undefined, nodeIndex),
  node_index: nodeIndex,
  source_node_type: "markdown",
  raw_text: node.value,
  cleaned_text: collapseWhitespace(node.value),
  references: node.references.map((reference) => ({
    raw: reference.raw,
    kind: reference.kind,
    source: reference.source,
    field: reference.field,
    resolution_status: reference.resolution?.status,
    resolution_value: reference.resolution?.value
  })),
  inline_chem: node.inlineChem.map((token) => ({ raw: token.raw, value: token.value })),
  inline_code: node.inlineCode.map((token) => ({ raw: token.raw, value: token.value })),
  links: node.links.map((token) => ({ raw: token.raw, label: token.label, href: token.href, safe: token.safe })),
  text_for_embedding: collapseWhitespace(node.value)
});

const buildPrimaryLinks = (
  documentId: string,
  entities: Array<{ entity_id: string; source_node_type: string; is_primary?: boolean }>
): ExportedRelationV1[] =>
  entities
    .filter((entity) => entity.is_primary)
    .map((entity) => ({
      relation_id: `rel::${documentId}::document_primary::${entity.entity_id}`,
      relation_type: "document_primary",
      from_entity_id: `doc::${documentId}`,
      to_entity_id: entity.entity_id,
      role: entity.source_node_type,
      confidence: 1
    }));

export const buildSemanticLayer = (document: ChemdDocument): SemanticLayerV1 => {
  const documentId = document.meta.id;
  const molecules: ExportedMoleculeV1[] = [];
  const reactions: ExportedReactionV1[] = [];
  const results: ExportedResultV1[] = [];
  const analyses: ExportedAnalysisV1[] = [];
  const samples: ExportedSampleV1[] = [];
  const markdownBlocks: ExportedMarkdownBlockV1[] = [];

  for (const [nodeIndex, node] of document.children.entries()) {
    const isPrimary = isPrimaryEntity(document, node);

    if (node.type === "molecule") {
      molecules.push(buildMolecule(documentId, node, nodeIndex, isPrimary));
      continue;
    }

    if (node.type === "markdown") {
      markdownBlocks.push(buildMarkdown(documentId, node, nodeIndex));
    }
  }

  const moleculeByOriginalId = new Map(
    molecules
      .filter((molecule) => molecule.original_id)
      .map((molecule) => [molecule.original_id as string, molecule])
  );

  for (const [nodeIndex, node] of document.children.entries()) {
    const isPrimary = isPrimaryEntity(document, node);

    if (node.type === "reaction") {
      reactions.push(buildReaction(documentId, node, nodeIndex, isPrimary, moleculeByOriginalId));
      continue;
    }

    if (node.type === "result") {
      results.push(buildResult(documentId, node, nodeIndex, isPrimary));
      continue;
    }

    if (node.type === "analysis") {
      analyses.push(buildAnalysis(documentId, node, nodeIndex, isPrimary));
      continue;
    }

    if (node.type === "sample") {
      samples.push(buildSample(documentId, node, nodeIndex, isPrimary));
    }
  }

  const links = buildPrimaryLinks(documentId, [...molecules, ...reactions, ...results, ...analyses, ...samples]);

  return {
    molecules,
    reactions,
    results,
    analyses,
    samples,
    markdown_blocks: markdownBlocks,
    links
  };
};
