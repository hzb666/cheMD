import type {
  ChemicalLookupProvider,
  ChemicalMention
} from "@chemd/chemical-lexicon";
import type { StepFamily } from "@chemd/step-ontology";

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
  category: string;
  source: ChemicalMention["source"];
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

export interface UnparsedProseSpan extends ProseSourceSpan {
  id: string;
  reason: "no_canonical_step";
  confidence: number;
}

export interface ProseImportCandidate {
  sourceText: string;
  materials: readonly MaterialMention[];
  quantities: readonly QuantityMention[];
  steps: readonly StepFrame[];
  observations: readonly ObservationFrame[];
  unparsedSpans: readonly UnparsedProseSpan[];
  diagnostics: readonly ImportDiagnostic[];
}

export interface ProseImportOptions {
  chemicalProvider?: ChemicalLookupProvider;
  includeFormulaLike?: boolean;
}

export interface RenderChemdDraftOptions {
  documentId?: string;
  title?: string;
  date?: string;
}
