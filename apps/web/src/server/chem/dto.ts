export interface StructurePayload {
  smiles: string;
  molfile?: string;
}

export interface OcrResponse {
  status: "ok" | "partial" | "failed";
  structure?: StructurePayload;
  confidence?: number;
  warnings: string[];
}

export interface ReactionPayload {
  reactants: string[];
  products: string[];
  conditions: string[];
}

export interface ReactionOcrResponse {
  status: "ok" | "partial" | "failed";
  reaction?: ReactionPayload;
  confidence?: number;
  warnings: string[];
}

export interface NormalizeRequest {
  smiles?: string;
  molfile?: string;
}

export interface NormalizeResponse {
  canonicalSmiles: string;
  normalizedMolfile?: string;
  warnings: string[];
}

export interface RenderRequest {
  kind: "molecule";
  smiles?: string;
  molfile?: string;
  renderOptions?: Record<string, unknown>;
}

export interface ReactionRenderRequest {
  kind: "reaction";
  reactants: string[];
  products: string[];
  conditions?: string[];
  renderOptions?: Record<string, unknown>;
}

export interface RenderResponse {
  svg: string;
  warnings: string[];
  canonicalSmiles?: string;
  normalizedMolfile?: string;
}

export interface ReactionRenderResponse extends RenderResponse {
  renderer?: string;
  reaction?: ReactionPayload;
}

interface StructureRecordBase {
  documentId: string;
  blockId: string;
  sessionId: string;
  source: "ocr" | "ketcher" | "manual";
  confidence?: number;
  updatedAt: string;
  expiresAt: string;
}

export interface MoleculeStructureRecord extends StructureRecordBase {
  kind: "molecule";
  smiles: string;
  molfile?: string;
  reactants?: never;
  products?: never;
  conditions?: never;
}

export interface ReactionStructureRecord extends StructureRecordBase {
  kind: "reaction";
  reactants: string[];
  products: string[];
  conditions?: string[];
  smiles?: never;
  molfile?: never;
}

export type RenderRouteRequest = RenderRequest | ReactionRenderRequest;

export type StructureRecord = MoleculeStructureRecord | ReactionStructureRecord;

export type SaveStructureRecordInput =
  | (Omit<MoleculeStructureRecord, "updatedAt" | "expiresAt" | "kind"> & { kind?: "molecule" })
  | Omit<ReactionStructureRecord, "updatedAt" | "expiresAt">;
