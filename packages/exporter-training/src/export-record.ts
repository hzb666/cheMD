import type { ChemdDocument, ChemdProgramDocument } from "@chemd/core";
import type { ChemdLnf } from "@chemd/lnf";
import type { StepGraph } from "@chemd/step-ontology";
import type { TypedSemanticGraph } from "@chemd/typechecker";

import { buildLearningLayer } from "./learning-layer";
import { buildDataGovernanceInfo } from "./governance";
import { buildQualityLayer } from "./quality-layer";
import { buildSemanticLayer } from "./semantic-layer";
import { buildSourceLayer } from "./source-layer";
import type { ChemdTrainingExportV2, ExportedDocumentInfo } from "./types";

const DEFAULT_EXPORTER_MODULE = "@chemd/exporter-training";
const DEFAULT_EXPORTER_VERSION = "0.0.0";

export interface ExportTrainingRecordOptions {
  exportedAt?: string;
  exportId?: string;
  exporterModule?: string;
  exporterVersion?: string;
  stepGraph?: StepGraph;
  typedGraph?: TypedSemanticGraph;
  lnf?: ChemdLnf;
}

const toDocumentInfo = (document: ChemdDocument): ExportedDocumentInfo => {
  const tags = Array.isArray(document.meta.tags)
    ? document.meta.tags.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    document_id: document.meta.id,
    title: document.meta.title,
    date: document.meta.date,
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(typeof document.meta.primary_molecule === "string"
      ? { primary_molecule_id: document.meta.primary_molecule }
      : {}),
    ...(typeof document.meta.primary_reaction === "string"
      ? { primary_reaction_id: document.meta.primary_reaction }
      : {}),
    ...(typeof document.meta.primary_result === "string" ? { primary_result_id: document.meta.primary_result } : {}),
    ...(typeof document.meta.primary_analysis === "string"
      ? { primary_analysis_id: document.meta.primary_analysis }
      : {}),
    ...(typeof document.meta.primary_sample === "string" ? { primary_sample_id: document.meta.primary_sample } : {})
  };
};

const createStableHash = (value: string): string => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const createEmptyTypedGraph = (documentId: string): TypedSemanticGraph => ({
  documentId,
  nodes: [],
  quantities: [],
  diagnostics: []
});

const isChemdDocument = (document: ChemdDocument | ChemdProgramDocument): document is ChemdDocument =>
  document.type === "document";

const createProgramLegacyBridge = (program: ChemdProgramDocument): ChemdDocument => ({
  type: "document",
  meta: {
    id: program.meta.id,
    title: program.meta.title,
    date: program.meta.date
  },
  children: [],
  diagnostics: program.diagnostics,
  ...(program.source ? { source: program.source } : {}),
  ...(program.renderSelection ? { renderSelection: program.renderSelection } : {})
});

export const exportTrainingRecordFromDocument = (
  document: ChemdDocument | ChemdProgramDocument,
  options: ExportTrainingRecordOptions = {}
): ChemdTrainingExportV2 => {
  const sourceDocument = isChemdDocument(document)
    ? document
    : createProgramLegacyBridge(document);
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const fingerprint = createStableHash(
    typeof sourceDocument.source === "string"
      ? sourceDocument.source
      : JSON.stringify({ meta: sourceDocument.meta, children: sourceDocument.children })
  );
  const exportId = options.exportId ?? `export::${sourceDocument.meta.id}::${fingerprint}`;
  const documentInfo = toDocumentInfo(sourceDocument);
  const sourceLayer = buildSourceLayer(sourceDocument);
  const governance = buildDataGovernanceInfo(sourceDocument.meta);
  const typedGraph = options.typedGraph ?? createEmptyTypedGraph(sourceDocument.meta.id);
  const baseSemanticLayer = buildSemanticLayer(sourceDocument, {
    typedGraph
  });
  const semanticLayer = {
    ...baseSemanticLayer,
    ...(options.lnf ? { lnf: options.lnf } : {})
  };
  const learningLayer = buildLearningLayer({
    document: documentInfo,
    sourceDocument,
    semanticLayer,
    stepGraph: options.stepGraph
  });
  const qualityLayer = buildQualityLayer(sourceDocument.diagnostics, learningLayer, governance);

  return {
    schema_version: "chemd-training-export/v0.2",
    export_id: exportId,
    exported_at: exportedAt,
    generator: {
      system: "chemd",
      exporter_module: options.exporterModule ?? DEFAULT_EXPORTER_MODULE,
      exporter_version: options.exporterVersion ?? DEFAULT_EXPORTER_VERSION,
      pipeline: [
        "parseChemd",
        "resolveChemd",
        "typecheckDocument",
        "buildCanonicalLnf",
        "exportTrainingRecordFromDocument"
      ]
    },
    document: documentInfo,
    governance,
    source_layer: sourceLayer,
    semantic_layer: semanticLayer,
    learning_layer: learningLayer,
    quality_layer: qualityLayer
  };
};
