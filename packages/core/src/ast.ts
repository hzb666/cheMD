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
  smiles?: string;
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
  notes?: string;
}

export interface AnalysisNode {
  type: "analysis";
  id?: string;
  type_name?: string;
  instrument?: string;
  solvent?: string;
  frequency?: string;
  method?: string;
  data?: string;
  notes?: string;
}

export interface SampleNode {
  type: "sample";
  id?: string;
  name?: string;
  sample_id?: string;
  batch?: string;
  purity?: string;
  supplier?: string;
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
  description?: string;
  body: Array<MarkdownNode | StructuredNode>;
}

export type StructuredNode =
  | MoleculeNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | SampleNode
  | TemplateNode
  | UseNode
  | ColNode;

export type ObjectNode = MoleculeNode | ReactionNode | ResultNode | AnalysisNode | SampleNode;

export type ChemdNode = MarkdownNode | StructuredNode;

export interface ChemdDocument {
  type: "document";
  meta: ChemdMeta;
  children: ChemdNode[];
  diagnostics: Diagnostic[];
  source?: string;
  renderSelection?: RenderSelection;
}

export interface CreateDocumentOptions {
  children?: ChemdNode[];
  diagnostics?: Diagnostic[];
  renderSelection?: RenderSelection;
  source?: string;
}

export const createReferenceToken = (
  input: Omit<ReferenceToken, "type">
): ReferenceToken => ({
  type: "reference",
  ...input
});

export const createInlineChemToken = (
  input: Omit<InlineChemToken, "type">
): InlineChemToken => ({
  type: "inline_chem",
  ...input
});

export const createInlineCodeToken = (
  input: Omit<InlineCodeToken, "type">
): InlineCodeToken => ({
  type: "inline_code",
  ...input
});

export const createMarkdownLinkToken = (
  input: Omit<MarkdownLinkToken, "type">
): MarkdownLinkToken => ({
  type: "markdown_link",
  ...input
});

export const createMarkdownNode = (
  value: string,
  references: ReferenceToken[] = [],
  inlineChem: InlineChemToken[] = [],
  inlineCode: InlineCodeToken[] = [],
  links: MarkdownLinkToken[] = []
): MarkdownNode => ({
  type: "markdown",
  value,
  references,
  inlineChem,
  inlineCode,
  links
});

export const createDocument = (
  meta: ChemdMeta,
  options: CreateDocumentOptions = {}
): ChemdDocument => ({
  type: "document",
  meta,
  children: options.children ?? [],
  diagnostics: options.diagnostics ?? [],
  source: options.source,
  renderSelection: options.renderSelection
});
