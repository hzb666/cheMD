import type { ChemdDocument, ChemdProgramDocument } from "@chemd/core";
import type { ChemdLnf } from "@chemd/lnf";
import type { StepGraph } from "@chemd/step-ontology";
import type { TypedSemanticGraph } from "@chemd/typechecker";

import { buildLearningLayer } from "./learning-layer";
import { buildDataGovernanceInfo } from "./governance";
import { buildProgramSemanticLayer } from "./program-semantic-layer";
import { buildQualityLayer } from "./quality-layer";
import { buildSemanticLayer } from "./semantic-layer";
import { buildProgramSourceLayer, buildSourceLayer } from "./source-layer";
import type { ChemdTrainingExportV3, ExportedDocumentInfo } from "./types";

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

const valueText = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : undefined;
  const record = value as { type?: string; value?: unknown; name?: unknown; raw?: unknown; target?: unknown };
  if (record.type === "string" && typeof record.value === "string") return record.value;
  if (record.type === "identifier" && typeof record.name === "string") return record.name;
  if (record.type === "reference" && typeof record.target === "string") return record.target;
  return typeof record.raw === "string" ? record.raw : undefined;
};

const valueList = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && (value as { type?: string }).type === "list") {
    const items = (value as { items?: unknown[] }).items ?? [];
    return items.map(valueText).filter((item): item is string => Boolean(item));
  }
  return undefined;
};

const toDocumentInfo = (document: ChemdDocument | ChemdProgramDocument): ExportedDocumentInfo => {
  const metaFields = isChemdDocument(document) ? document.meta : document.meta.fields;
  const tags = valueList(metaFields.tags);
  const primary = isChemdDocument(document) ? undefined : document.meta.primary;

  return {
    document_id: document.meta.id,
    title: document.meta.title,
    date: document.meta.date,
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(isChemdDocument(document) && typeof document.meta.primary_molecule === "string"
      ? { primary_molecule_id: document.meta.primary_molecule }
      : primary?.molecule ? { primary_molecule_id: primary.molecule.target } : {}),
    ...(isChemdDocument(document) && typeof document.meta.primary_reaction === "string"
      ? { primary_reaction_id: document.meta.primary_reaction }
      : primary?.reaction ? { primary_reaction_id: primary.reaction.target } : {}),
    ...(isChemdDocument(document) && typeof document.meta.primary_result === "string"
      ? { primary_result_id: document.meta.primary_result }
      : primary?.result ? { primary_result_id: primary.result.target } : {}),
    ...(isChemdDocument(document) && typeof document.meta.primary_analysis === "string"
      ? { primary_analysis_id: document.meta.primary_analysis }
      : primary?.analysis ? { primary_analysis_id: primary.analysis.target } : {}),
    ...(isChemdDocument(document) && typeof document.meta.primary_sample === "string"
      ? { primary_sample_id: document.meta.primary_sample }
      : primary?.sample ? { primary_sample_id: primary.sample.target } : {}),
    language: isChemdDocument(document) ? undefined : document.sourceLanguage
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

export const exportTrainingRecordFromDocument = (
  document: ChemdDocument | ChemdProgramDocument,
  options: ExportTrainingRecordOptions = {}
): ChemdTrainingExportV3 => {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const fingerprint = createStableHash(
    typeof document.source === "string"
      ? document.source
      : JSON.stringify(isChemdDocument(document)
        ? { meta: document.meta, children: document.children }
        : { meta: document.meta, declarations: document.declarations })
  );
  const exportId = options.exportId ?? `export::${document.meta.id}::${fingerprint}`;
  const documentInfo = toDocumentInfo(document);
  const sourceLayer = isChemdDocument(document) ? buildSourceLayer(document) : buildProgramSourceLayer(document);
  const governance = buildDataGovernanceInfo(isChemdDocument(document) ? document.meta : document.meta.fields);
  const typedGraph = options.typedGraph ?? createEmptyTypedGraph(document.meta.id);
  const baseSemanticLayer = isChemdDocument(document)
    ? buildSemanticLayer(document, { typedGraph })
    : buildProgramSemanticLayer(document, typedGraph);
  const semanticLayer = {
    ...baseSemanticLayer,
    ...(options.lnf ? { lnf: options.lnf } : {})
  };
  const learningLayer = buildLearningLayer({
    document: documentInfo,
    sourceDocument: isChemdDocument(document) ? document : undefined,
    semanticLayer,
    stepGraph: options.stepGraph
  });
  const qualityLayer = buildQualityLayer(document.diagnostics, learningLayer, governance);

  return {
    schema_version: "chemd-training-export/v0.3",
    export_id: exportId,
    exported_at: exportedAt,
    generator: {
      system: "chemd",
      exporter_module: options.exporterModule ?? DEFAULT_EXPORTER_MODULE,
      exporter_version: options.exporterVersion ?? DEFAULT_EXPORTER_VERSION,
      pipeline: [
        isChemdDocument(document) ? "parseChemd" : "parseChemdProgram",
        isChemdDocument(document) ? "resolveChemd" : "programAst",
        "typecheckProgram",
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
