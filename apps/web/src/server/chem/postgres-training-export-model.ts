import type { ChemdTrainingExportV3 } from "@chemd/exporter-training";
import type { JsonRecord } from "@chemd/storage-postgres";

import type { CreatePostgresRuntimeClientOptions } from "./postgres-client";
import type { PostgresQueryClient } from "./postgres-storage";

export const DEFAULT_TRAINING_EXPORT_LIMIT = 50;
export const MAX_TRAINING_EXPORT_LIMIT = 100;

export class PostgresTrainingExportFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostgresTrainingExportFilterError";
  }
}

export class PostgresTrainingExportArtifactError extends Error {
  constructor(readonly revisionId: string) {
    super(`revision has no valid training export artifact: ${revisionId}`);
    this.name = "PostgresTrainingExportArtifactError";
  }
}

export interface ExportPostgresTrainingInput {
  client: PostgresQueryClient;
  experimentId?: string;
  revisionId?: string;
  limit?: number;
  includeCorrectionPatterns?: boolean;
  includeExperimentPatternMemory?: boolean;
}

export interface ExportPostgresTrainingWithRuntimeInput
  extends Omit<ExportPostgresTrainingInput, "client"> {
  runtime?: CreatePostgresRuntimeClientOptions;
}

export interface PostgresTrainingRevisionExport {
  revisionId: string;
  experimentId: string;
  parentRevisionId?: string;
  commitSha?: string;
  createdAt: string;
  compileRunId: string;
  compileCreatedAt: string;
  trainingExport: ChemdTrainingExportV3;
}

export interface PostgresCorrectionPatternExport {
  patternId: string;
  reactionFamily?: string;
  sourceField?: string;
  oldRole?: string;
  newRole?: string;
  evidencePhrasePattern?: string;
  supportCount: number;
  confidence?: number;
  promotedToRule: boolean;
  trainingUses: string[];
  qualityTier?: string;
  updatedAt: string;
}

export interface PostgresExperimentPatternMemoryExport {
  experimentPatternId: string;
  patternScope: string;
  reactionFamily?: string;
  mechanismFamily?: string;
  stepSequenceSignature?: string;
  canonicalRoles: JsonRecord;
  canonicalPhaseRoles: JsonRecord;
  commonFieldCorrections: JsonRecord[];
  commonDiagnostics: JsonRecord[];
  controlledVariables: JsonRecord[];
  highValueVariables: JsonRecord[];
  outcomeDeltaPatterns: JsonRecord[];
  failureModePatterns: JsonRecord[];
  evidenceEventIds: string[];
  supportCount: number;
  confidence?: number;
  trainingUses: string[];
  promotionTargets: string[];
  qualityTier?: string;
  updatedAt: string;
}

export interface ExportPostgresTrainingResult {
  filters: {
    experimentId?: string;
    revisionId?: string;
    limit: number;
    includeCorrectionPatterns: boolean;
    includeExperimentPatternMemory: boolean;
  };
  count: number;
  revisions: PostgresTrainingRevisionExport[];
  correctionPatterns?: PostgresCorrectionPatternExport[];
  experimentPatternMemories?: PostgresExperimentPatternMemoryExport[];
}
