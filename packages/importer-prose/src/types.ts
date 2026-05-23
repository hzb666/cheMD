import type {
  ChemicalCategory,
  ChemicalLookupProvider,
  ChemicalMention
} from "@chemd/chemical-lexicon";
import type {
  ProcedureStateResult,
  StepFamily
} from "@chemd/step-ontology";

export interface ProseSourceSpan {
  start: number;
  end: number;
  text: string;
}

export type ImportDiagnosticSeverity = "info" | "warning" | "error";

export interface ImportDiagnostic {
  code: string;
  severity: ImportDiagnosticSeverity;
  message: string;
  span?: ProseSourceSpan;
  facts?: Record<string, unknown>;
}

export interface MaterialMention {
  id: string;
  name: string;
  normalizedName: string;
  confidence: number;
  category: ChemicalCategory | "solution" | "generic_material";
  source: ChemicalMention["source"] | "rxn-action";
  span: ProseSourceSpan;
  evidence: readonly string[];
  formula?: string;
}

export interface QuantityMention {
  id: string;
  raw: string;
  value: number;
  unit: string;
  canonicalUnit?: string;
  span: ProseSourceSpan;
  quantityClass?: string;
  confidence: number;
}

export interface StepFrame {
  id: string;
  family: StepFamily;
  params: Record<string, unknown>;
  span: ProseSourceSpan;
  confidence: number;
  evidence: readonly string[];
}

export interface ObservationFrame {
  id: string;
  rawText: string;
  span: ProseSourceSpan;
  linkedStepId?: string;
  linkedStepFamily?: StepFamily;
  eventType?: string;
  normalizedValue?: unknown;
  confidence: number;
  evidence: readonly string[];
}

export type ReactionFactRole =
  | "reactant"
  | "product"
  | "reagent"
  | "solvent"
  | "temperature"
  | "time"
  | "pressure"
  | "atmosphere"
  | "yield";

export interface ReactionFactCandidate {
  id: string;
  role: ReactionFactRole;
  raw: string;
  normalized?: string;
  confidence: number;
  sourceSpan: ProseSourceSpan;
  evidence: readonly string[];
  warnings: readonly string[];
}

export interface ReactionCandidate {
  id: string;
  source: "prose_import";
  confidence: number;
  facts: readonly ReactionFactCandidate[];
  rejectedFacts: readonly ReactionFactCandidate[];
  diagnostics: readonly ImportDiagnostic[];
}

export interface UnparsedProseSpan extends ProseSourceSpan {
  id: string;
  reason: "no_canonical_step" | "uncovered_action_like";
  confidence: number;
}

export interface ProcedureActionProviderResult {
  provider: string;
  actions: readonly string[];
  diagnostics?: readonly ImportDiagnostic[];
}

export interface ProcedureActionProvider {
  name: string;
  extractActions(sourceText: string): Promise<ProcedureActionProviderResult>;
}

export interface ProseImportCandidate {
  sourceText: string;
  materials: readonly MaterialMention[];
  quantities: readonly QuantityMention[];
  steps: readonly StepFrame[];
  observations: readonly ObservationFrame[];
  procedureState: ProcedureStateResult;
  reactionCandidates: readonly ReactionCandidate[];
  unparsedSpans: readonly UnparsedProseSpan[];
  diagnostics: readonly ImportDiagnostic[];
}

export interface ProseImportOptions {
  chemicalProvider?: ChemicalLookupProvider;
  procedureActionProvider?: ProcedureActionProvider;
  includeFormulaLike?: boolean;
}

export interface RenderChemdDraftOptions {
  documentId?: string;
  title?: string;
  date?: string;
}
