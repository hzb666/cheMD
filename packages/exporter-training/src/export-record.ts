import type { ChemdProgramDocument, Diagnostic } from "@chemd/core";
import type { ChemdLnf } from "@chemd/lnf";
import type { StepGraph } from "@chemd/step-ontology";
import type { TypedSemanticGraph } from "@chemd/typechecker";

import { buildLearningLayer } from "./learning-layer";
import { buildDataGovernanceInfo } from "./governance";
import { buildProgramSemanticLayer } from "./program-semantic-layer";
import { buildQualityLayer } from "./quality-layer";
import { buildProgramSourceLayer } from "./source-layer";
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

const toDocumentInfo = (document: ChemdProgramDocument): ExportedDocumentInfo => {
  const metaFields = document.meta.fields;
  const tags = valueList(metaFields.tags);
  const primary = document.meta.primary;

  return {
    document_id: document.meta.id,
    title: document.meta.title,
    date: document.meta.date,
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(primary?.molecule ? { primary_molecule_id: primary.molecule.target } : {}),
    ...(primary?.reaction ? { primary_reaction_id: primary.reaction.target } : {}),
    ...(primary?.result ? { primary_result_id: primary.result.target } : {}),
    ...(primary?.analysis ? { primary_analysis_id: primary.analysis.target } : {}),
    ...(primary?.sample ? { primary_sample_id: primary.sample.target } : {}),
    language: document.sourceLanguage
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

const diagnosticKey = (diagnostic: Diagnostic): string =>
  [
    diagnostic.code,
    diagnostic.severity,
    diagnostic.message,
    diagnostic.nodeId ?? "",
    diagnostic.sourceLayer ?? "",
    diagnostic.sourceNodeType ?? "",
    diagnostic.sourceNodeId ?? "",
    diagnostic.sourceField ?? ""
  ].join("\u0000");

const mergeDiagnostics = (
  documentDiagnostics: readonly Diagnostic[],
  typedGraphDiagnostics: readonly Diagnostic[] = []
): Diagnostic[] => {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];

  for (const diagnostic of [...documentDiagnostics, ...typedGraphDiagnostics]) {
    const key = diagnosticKey(diagnostic);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(diagnostic);
  }

  return merged;
};

export const exportTrainingRecordFromDocument = (
  document: ChemdProgramDocument,
  options: ExportTrainingRecordOptions = {}
): ChemdTrainingExportV3 => {
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const fingerprint = createStableHash(
    typeof document.source === "string"
      ? document.source
      : JSON.stringify({ meta: document.meta, declarations: document.declarations })
  );
  const exportId = options.exportId ?? `export::${document.meta.id}::${fingerprint}`;
  const documentInfo = toDocumentInfo(document);
  const diagnostics = mergeDiagnostics(document.diagnostics, options.typedGraph?.diagnostics);
  const sourceLayer = buildProgramSourceLayer(document, diagnostics);
  const governance = buildDataGovernanceInfo(document.meta.fields);
  const typedGraph = options.typedGraph ?? createEmptyTypedGraph(document.meta.id);
  const baseSemanticLayer = buildProgramSemanticLayer(document, typedGraph);
  const semanticLayer = {
    ...baseSemanticLayer,
    ...(options.lnf ? { lnf: options.lnf } : {})
  };
  const learningLayer = buildLearningLayer({
    document: documentInfo,
    semanticLayer,
    stepGraph: options.stepGraph
  });
  const qualityLayer = buildQualityLayer(diagnostics, learningLayer, governance);

  return {
    schema_version: "chemd-training-export/v0.3",
    export_id: exportId,
    exported_at: exportedAt,
    generator: {
      system: "chemd",
      exporter_module: options.exporterModule ?? DEFAULT_EXPORTER_MODULE,
      exporter_version: options.exporterVersion ?? DEFAULT_EXPORTER_VERSION,
      pipeline: [
        "parseChemdProgram",
        "programAst",
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
