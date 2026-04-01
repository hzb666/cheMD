import type { ChemdDocument } from "@chemd/core";

import { buildLearningLayer } from "./learning-layer";
import { buildQualityLayer } from "./quality-layer";
import { buildSemanticLayer } from "./semantic-layer";
import { buildSourceLayer } from "./source-layer";
import type { ChemdTrainingExportV1, ExportedDocumentInfo } from "./types";

const DEFAULT_EXPORTER_MODULE = "@chemd/exporter-training";
const DEFAULT_EXPORTER_VERSION = "0.1.0";

export interface ExportTrainingRecordOptions {
  exportedAt?: string;
  exportId?: string;
  exporterModule?: string;
  exporterVersion?: string;
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

export const exportTrainingRecordFromDocument = (
  document: ChemdDocument,
  options: ExportTrainingRecordOptions = {}
): ChemdTrainingExportV1 => {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const exportId = options.exportId ?? `export::${document.meta.id}::${exportedAt}`;
  const sourceLayer = buildSourceLayer(document);
  const semanticLayer = buildSemanticLayer(document);
  const learningLayer = buildLearningLayer();
  const qualityLayer = buildQualityLayer(document.diagnostics, learningLayer);

  return {
    schema_version: "chemd-training-export/v0.1",
    export_id: exportId,
    exported_at: exportedAt,
    generator: {
      system: "chemd",
      exporter_module: options.exporterModule ?? DEFAULT_EXPORTER_MODULE,
      exporter_version: options.exporterVersion ?? DEFAULT_EXPORTER_VERSION,
      pipeline: ["parseChemd", "resolveChemd", "exportTrainingRecordFromDocument"]
    },
    document: toDocumentInfo(document),
    source_layer: sourceLayer,
    semantic_layer: semanticLayer,
    learning_layer: learningLayer,
    quality_layer: qualityLayer
  };
};
