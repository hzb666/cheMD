import type {
  ChemdRagExportV1,
  ChemdTrainingExportV2,
  ChemdTrainingUnderstandingV1,
  ExportedRelationV1,
  TrainingFieldEvidenceV1
} from "@chemd/exporter-training";
import type { ChemdLnf } from "@chemd/lnf";

export type JsonRecord = Record<string, unknown>;

export type ExperimentSourceKind =
  | "chemd"
  | "patent_xml"
  | "paper_pdf"
  | "ocr_text"
  | "external_import";

export type SemanticEntityType =
  | "molecule"
  | "reaction"
  | "result"
  | "analysis"
  | "sample"
  | "narrative";

export interface BuildExperimentStorageInput {
  revisionId: string;
  source: string;
  sourceKind?: ExperimentSourceKind;
  sourceUri?: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt?: string;
  compileRunId?: string;
  compilerVersion?: string;
  trainingExport: ChemdTrainingExportV2;
  ragExport: ChemdRagExportV1;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
  lnf?: ChemdLnf;
}

export interface ExperimentRecord {
  experimentId: string;
  title: string;
  experimentDate: string;
  tags: string[];
  primaryMoleculeId?: string;
  primaryReactionId?: string;
  primaryResultId?: string;
  primaryAnalysisId?: string;
  primarySampleId?: string;
}

export interface ExperimentRevisionRecord {
  revisionId: string;
  experimentId: string;
  parentRevisionId?: string;
  sourceKind: ExperimentSourceKind;
  rawSource: string;
  sourceHash?: string;
  sourceUri?: string;
  commitSha?: string;
  createdAt: string;
}

export interface CompileRunRecord {
  compileRunId: string;
  revisionId: string;
  compilerVersion: string;
  status: "success" | "warning" | "error";
  schemaVersions: JsonRecord;
  diagnosticCounts: {
    info: number;
    warning: number;
    error: number;
  };
  createdAt: string;
}

export interface CompileArtifactRecord {
  compileRunId: string;
  trainingExport: ChemdTrainingExportV2;
  trainingUnderstanding: ChemdTrainingUnderstandingV1;
  ragExport: ChemdRagExportV1;
  lnf?: ChemdLnf;
}

export interface SemanticEntityRecord {
  entityId: string;
  revisionId: string;
  entityType: SemanticEntityType;
  originalId?: string;
  payload: JsonRecord;
}

export interface SemanticRelationRecord extends ExportedRelationV1 {
  revisionId: string;
}

export interface FieldEvidenceRecord extends TrainingFieldEvidenceV1 {
  revisionId: string;
}

export interface RagChunkRecord {
  chunkId: string;
  revisionId: string;
  experimentId: string;
  chunkType: ChemdRagExportV1["chunks"][number]["chunk_type"];
  sourceEntityIds: string[];
  text: string;
  metadata: ChemdRagExportV1["chunks"][number]["metadata"];
}

export interface ExperimentStorageRecords {
  experiment: ExperimentRecord;
  revision: ExperimentRevisionRecord;
  compileRun: CompileRunRecord;
  compileArtifact: CompileArtifactRecord;
  semanticEntities: SemanticEntityRecord[];
  semanticRelations: SemanticRelationRecord[];
  fieldEvidence: FieldEvidenceRecord[];
  ragChunks: RagChunkRecord[];
}
