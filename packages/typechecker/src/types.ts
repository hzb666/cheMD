import type {
  AnalysisNode,
  ChemdDocument,
  ChemdNode,
  MoleculeNode,
  ObservationNode,
  ProcedureNode,
  ReactionNode,
  ResultNode,
  SampleNode
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { StepGraph } from "@chemd/step-ontology";

export type QuantityClass =
  | "amount"
  | "mass"
  | "volume"
  | "temperature"
  | "time"
  | "pressure"
  | "concentration"
  | "equivalent"
  | "percent";

export interface QuantityType {
  kind: "quantity";
  quantityClass: QuantityClass;
  raw: string;
  value?: number;
  unit?: string;
  canonicalValue?: number;
  canonicalUnit?: string;
  sourceNodeId?: string;
  sourceField?: string;
}

export type StatusLabel = "success" | "partial" | "failed" | "unknown";

export interface ReferenceType {
  kind: "reference";
  targetKind: "molecule" | "reaction" | "result" | "analysis" | "sample" | "template" | "unknown";
  refId: string;
  resolved: boolean;
}

export type ReferenceOrLiteral = ReferenceType | { kind: "literal"; raw: string };

export interface TypedNodeBase {
  nodeId: string;
  kind: string;
  sourceNodeType: ChemdNode["type"];
  diagnostics?: V03Diagnostic[];
}

export interface TypedMoleculeNode extends TypedNodeBase {
  kind: "molecule";
  smiles?: string;
  name?: string;
  role?: string;
  formula?: string;
  amount?: QuantityType;
  equivalents?: QuantityType;
}

export interface TypedReactionNode extends TypedNodeBase {
  kind: "reaction";
  reactants: ReferenceOrLiteral[];
  products: ReferenceOrLiteral[];
  solvent?: string;
  catalyst?: string;
  reagents?: string;
  atmosphere?: string;
  temperature?: QuantityType;
  time?: QuantityType;
  pressure?: QuantityType;
}

export interface TypedResultNode extends TypedNodeBase {
  kind: "result";
  status?: StatusLabel;
  yield?: QuantityType;
  conversion?: QuantityType;
  selectivity?: QuantityType;
  purity?: QuantityType;
  isolatedMass?: QuantityType;
  notes?: string;
}

export interface TypedAnalysisNode extends TypedNodeBase {
  kind: "analysis";
  analysisType?: string;
  ref?: string;
  result?: string;
  instrument?: string;
  method?: string;
  data?: string;
  notes?: string;
}

export interface TypedProcedureNarrativeNode extends TypedNodeBase {
  kind: "procedure_narrative";
  rawText: string;
  structureHint: "ordered_list" | "paragraph" | "mixed";
}

export interface TypedObservationNarrativeNode extends TypedNodeBase {
  kind: "observation_narrative";
  rawText: string;
  stageHint?: string;
}

export interface TypedSampleNode extends TypedNodeBase {
  kind: "sample";
  name?: string;
  sampleCode?: string;
  purity?: QuantityType;
  supplier?: string;
  notes?: string;
}

export type TypedSemanticNode =
  | TypedMoleculeNode
  | TypedReactionNode
  | TypedResultNode
  | TypedAnalysisNode
  | TypedProcedureNarrativeNode
  | TypedObservationNarrativeNode
  | TypedSampleNode;

export interface TypedSemanticGraph {
  documentId: string;
  nodes: TypedSemanticNode[];
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

export interface TypecheckResult {
  document: ChemdDocument;
  typedGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  diagnostics: V03Diagnostic[];
}

export interface QuantityParseContext {
  sourceNodeType: string;
  sourceNodeId?: string;
  field: string;
}

export type ObjectNode =
  | MoleculeNode
  | ReactionNode
  | ResultNode
  | AnalysisNode
  | ProcedureNode
  | ObservationNode
  | SampleNode;
