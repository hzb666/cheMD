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
  | "material"
  | "batch"
  | "result"
  | "analysis"
  | "procedure"
  | "trace"
  | "observation"
  | "sample"
  | "artifact"
  | "condition_varies";

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

export type FieldSourceSpans = Record<string, SourceSpan>;

export interface ChemistryFeatureRef {
  featureId: string;
  provider?: string;
  kind?: "molecule" | "reaction" | "analysis" | "material" | "batch" | "sample" | "artifact" | "trace";
  status?: "available" | "pending" | "missing" | "failed";
}

export interface SourceMappedNode {
  sourceSpan?: SourceSpan;
  fieldSpans?: FieldSourceSpans;
}
export interface Confidence {
  score: number;
  method?: string;
}
export type ProvenanceOrigin = "author" | "lowered" | "normalized" | "inferred" | "external_provider";
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

export interface MoleculeNode extends SourceMappedNode {
  type: "molecule";
  id?: string;
  syntaxOrigin?: SyntaxOrigin;
  declaredKind?: ChemdSemanticKind;
  smiles?: string;
  cas?: string;
  inchi?: string;
  inchikey?: string;
  canonical_smiles?: string;
  name?: string;
  role?: string;
  caption?: string;
  formula?: string;
  mw?: string;
  amount?: string;
  equivalents?: string;
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

export interface MaterialNode extends SourceMappedNode {
  type: "material";
  id?: string;
  molecule?: string;
  supplier?: string;
  lot?: string;
  purity?: string;
  density?: string;
  storage?: string;
  notes?: string;
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

export interface BatchNode extends SourceMappedNode {
  type: "batch";
  id?: string;
  source?: string;
  molecule?: string;
  state?: string;
  mass?: string;
  purity?: string;
  notes?: string;
  artifacts?: string[];
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

export interface ReactionNode extends SourceMappedNode {
  type: "reaction";
  id?: string;
  syntaxOrigin?: SyntaxOrigin;
  declaredKind?: ChemdSemanticKind;
  route?: string;
  prev?: string[];
  reactants?: string[];
  products?: string[];
  equation?: string;
  rxn_smiles?: string;
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
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

export interface ResultNode extends SourceMappedNode {
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

export interface TlcLaneEntryNode {
  kind: "spot" | "mess" | "base" | "none";
  raw: string;
  sourceSpan?: SourceSpan;
}

export interface TlcLaneNode {
  id: string;
  label: string;
  params?: Record<string, string>;
  entries: TlcLaneEntryNode[];
  sourceSpan?: SourceSpan;
}

export type AnalysisNode = SourceMappedNode & {
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
  artifact?: string;
  artifacts?: string[];
  spectrum?: string;
  peaks?: string[];
  ions?: string[];
  tlcLanes?: TlcLaneNode[];
  data?: string;
  notes?: string;
} & Partial<Record<`p${number}`, string>>;

export interface ProcedureNode extends SourceMappedNode {
  type: "procedure";
  id?: string;
  ref?: string;
  reaction?: string;
  evidence?: string[];
  body?: string;
  steps?: ProcedureStepNode[];
  controls?: ProcedureControlNode[];
  children?: ProcedureChildNode[];
}

export type ProcedureControlKind =
  | "repeat"
  | "until"
  | "branch"
  | "parallel"
  | "case"
  | "default"
  | "path"
  | "wait"
  | "abort_if";

export type ProcedureChildNode =
  | ProcedureStepNode
  | ProcedureControlNode
  | MarkdownNode;

export interface ProcedureControlNode {
  type: "control";
  kind: ProcedureControlKind;
  controlId?: string;
  params?: Record<string, string>;
  outputs?: string[];
  children?: ProcedureChildNode[];
  raw?: string;
  authorProvided?: boolean;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface ProcedureStepNode {
  type: "step";
  stepId?: string;
  generatedStepId?: boolean;
  family: string;
  stage?: string;
  purpose?: string;
  params?: Record<string, string>;
  inputs?: string[];
  outputs?: string[];
  dependsOn?: string[];
  evidence?: string[];
  confidence?: number | Confidence;
  raw?: string;
  authorProvided?: boolean;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface ObservationNode extends SourceMappedNode {
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
  timepoint?: string;
  severity?: string;
  linkedStepId?: string;
  evidence?: string[];
  confidence?: number | Confidence;
  raw?: string;
  authorProvided?: boolean;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface TraceNode extends SourceMappedNode {
  type: "trace";
  id?: string;
  plan?: string;
  mode?: string;
  events?: TraceEventAuthorNode[];
  children?: Array<TraceEventAuthorNode | MarkdownNode>;
}

export interface TraceEventAuthorNode {
  type: "trace_event";
  eventId?: string;
  eventType: string;
  at?: string;
  stepId?: string;
  controlId?: string;
  artifact?: string;
  analysis?: string;
  result?: string;
  params?: Record<string, string>;
  raw?: string;
  authorProvided?: boolean;
  sourceSpan?: SourceSpan;
  provenance?: ProvenanceInfo;
}

export interface SampleNode extends SourceMappedNode {
  type: "sample";
  id?: string;
  name?: string;
  sample_id?: string;
  batch?: string;
  purity?: string;
  supplier?: string;
  notes?: string; ref?: string;
  derived_from?: string;
  aliquot_of?: string;
  batch_of?: string;
  artifacts?: string[];
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

export interface ArtifactNode extends SourceMappedNode {
  type: "artifact";
  id?: string;
  kind?: string;
  ref?: string;
  path?: string;
  checksum?: string;
  instrument?: string;
  notes?: string;
  chemistryFeatureRefs?: ChemistryFeatureRef[];
}

export interface ConditionVariationDelta {
  field: string;
  raw: string;
  baseline?: string;
  candidate?: string;
}

export interface ConditionVariationVariable {
  field: string;
  raw: string;
  baseline?: string;
  quantityClass?: string;
}

export type ConditionVariationAttemptMode = "partial" | "override";

export interface ConditionVariationAttempt {
  id: string;
  raw: string;
  mode?: ConditionVariationAttemptMode;
  reaction?: string;
  result?: string;
  note?: string;
  factors?: Record<string, string>;
  outcomes?: Record<string, string>;
  changes: ConditionVariationDelta[];
  condition: ConditionVariationDelta[];
}

export interface ConditionVariesNode extends SourceMappedNode {
  type: "condition_varies";
  id?: string;
  reaction?: string;
  standard?: string;
  factors?: ConditionVariationVariable[];
  outcomes?: ConditionVariationVariable[];
  condition?: ConditionVariationVariable[];
  varyFields?: string[];
  changes: ConditionVariationDelta[];
  attempts?: ConditionVariationAttempt[];
  notes?: string;
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
  | MaterialNode
  | BatchNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | TraceNode
  | ObservationNode
  | SampleNode
  | ArtifactNode
  | ConditionVariesNode
  | TemplateNode
  | UseNode
  | ColNode;

export type ObjectNode =
  | MoleculeNode
  | MaterialNode
  | BatchNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | TraceNode
  | ObservationNode
  | SampleNode
  | ArtifactNode
  | ConditionVariesNode;

export type ChemdNode = MarkdownNode | StructuredNode;

export interface ChemdDocument {
  type: "document";
  meta: ChemdMeta;
  children: ChemdNode[];
  diagnostics: Diagnostic[];
  source?: string;
  renderSelection?: RenderSelection;
}
