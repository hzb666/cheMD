import type { Diagnostic } from "./diagnostics";

export interface RenderSelection {
  profileId?: string;
  overrides?: Record<string, unknown>;
}

export interface ChemdMeta extends Record<string, unknown> {
  id: string;
  title: string;
  date: string;
}

export type ReferenceKind =
  | "meta"
  | "object"
  | "object_field"
  | "alias_field"
  | "param_field";

export interface ReferenceResolution {
  status: "resolved" | "unresolved";
  value?: unknown;
  message?: string;
}

export type ChemdSemanticKind = "molecule" | "reaction";

export type ObjectSemanticKind =
  | ChemdSemanticKind
  | "result"
  | "analysis"
  | "procedure"
  | "observation"
  | "sample";

export type TemplateParamType =
  | { kind: "string" }
  | { kind: "ref"; targetKind: ObjectSemanticKind }
  | { kind: "quantity"; quantityClass?: string };

export interface TemplateParamSpec {
  name: string;
  raw: string;
  type: TemplateParamType;
}

export type SyntaxOrigin =
  | "chemd"
  | "template_expanded"
  | "migrated";
export interface SourceSpan {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}
export interface Confidence {
  score: number;
  method?: string;
}
export type ProvenanceOrigin = "author" | "lowered" | "normalized" | "inferred";
export interface ProvenanceInfo {
  origin: ProvenanceOrigin;
  source?: string;
  sourceNodeType?: string;
  sourceNodeId?: string;
  sourceField?: string;
  sourceSpan?: SourceSpan;
  ruleId?: string;
  confidence?: number | Confidence;
}
export type Provenance = ProvenanceInfo;

interface TokenLocation {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface ReferenceToken extends TokenLocation {
  type: "reference";
  kind: ReferenceKind;
  raw: string;
  source: string;
  field?: string;
  resolution?: ReferenceResolution;
}

export interface InlineChemToken extends TokenLocation {
  type: "inline_chem";
  raw: string;
  value: string;
}

export interface InlineCodeToken extends TokenLocation {
  type: "inline_code";
  raw: string;
  value: string;
}

export interface MarkdownLinkToken extends TokenLocation {
  type: "markdown_link";
  raw: string;
  label: string;
  href: string;
  safe: boolean;
}

export interface MarkdownNode {
  type: "markdown";
  value: string;
  references: ReferenceToken[];
  inlineChem: InlineChemToken[];
  inlineCode: InlineCodeToken[];
  links: MarkdownLinkToken[];
}

export interface MoleculeNode {
  type: "molecule";
  id?: string;
  syntaxOrigin?: SyntaxOrigin;
  declaredKind?: ChemdSemanticKind;
  smiles?: string;
  cas?: string;
  name?: string;
  role?: string;
  caption?: string;
  formula?: string;
  amount?: string;
  equivalents?: string;
}

export interface ReactionNode {
  type: "reaction";
  id?: string;
  syntaxOrigin?: SyntaxOrigin;
  declaredKind?: ChemdSemanticKind;
  reactants?: string[];
  products?: string[];
  conditions?: string[];
  name?: string;
  reagents?: string;
  catalyst?: string;
  solvent?: string;
  temperature?: string;
  time?: string;
  pressure?: string;
  atmosphere?: string;
  yield?: string;
  conversion?: string;
  selectivity?: string;
  caption?: string;
}

export interface ResultNode {
  type: "result";
  id?: string;
  status?: string;
  yield?: string;
  conversion?: string;
  selectivity?: string;
  isolated_mass?: string;
  product_state?: string;
  purity?: string;
  notes?: string; ref?: string; reaction?: string; product?: string;
}

export type AnalysisNode = {
  type: "analysis";
  id?: string;
  type_name?: string;
  ref?: string;
  time?: string;
  eluent?: string;
  plate?: string;
  visualization?: string;
  result?: string;
  instrument?: string;
  solvent?: string;
  frequency?: string;
  method?: string;
  data?: string;
  notes?: string;
} & Partial<Record<`p${number}`, string>>;

export interface ProcedureNode {
  type: "procedure";
  id?: string;
  ref?: string;
  body?: string;
  steps?: ProcedureStepNode[];
  children?: Array<ProcedureStepNode | MarkdownNode>;
}

export interface ProcedureStepNode {
  type: "step";
  stepId?: string;
  family: string;
  params?: Record<string, string>;
  inputs?: string[];
  outputs?: string[];
  dependsOn?: string[];
  raw?: string;
  authorProvided?: boolean;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface ObservationNode {
  type: "observation";
  id?: string;
  ref?: string;
  body?: string;
  events?: ObservationEventAuthorNode[];
  children?: Array<ObservationEventAuthorNode | MarkdownNode>;
}

export interface ObservationEventAuthorNode {
  type: "event";
  eventId?: string;
  eventType: string;
  params?: Record<string, string>;
  stage?: string;
  linkedStepId?: string;
  raw?: string;
  authorProvided?: boolean;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface SampleNode {
  type: "sample";
  id?: string;
  name?: string;
  sample_id?: string;
  batch?: string;
  purity?: string;
  supplier?: string;
  notes?: string; ref?: string;
}

export interface UseNode {
  type: "use";
  template: string;
  values: Record<string, string>;
}

export interface ColNode {
  type: "col";
  columns: number;
  children: ChemdNode[];
}

export interface TemplateNode {
  type: "template";
  name: string;
  bind: Record<string, string>;
  params: string[];
  paramSpecs?: TemplateParamSpec[];
  description?: string;
  body: Array<MarkdownNode | StructuredNode>;
}

export type StructuredNode =
  | MoleculeNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | ObservationNode
  | SampleNode
  | TemplateNode
  | UseNode
  | ColNode;

export type ObjectNode =
  | MoleculeNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | ObservationNode
  | SampleNode;

export type ChemdNode = MarkdownNode | StructuredNode;

export interface ChemdDocument {
  type: "document";
  meta: ChemdMeta;
  children: ChemdNode[];
  diagnostics: Diagnostic[];
  source?: string;
  renderSelection?: RenderSelection;
}
