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

export interface RenderResponse {
  svg: string;
  warnings: string[];
}

export interface StructureRecord {
  documentId: string;
  blockId: string;
  kind: "molecule";
  smiles: string;
  molfile?: string;
  source: "ocr" | "ketcher" | "manual";
  confidence?: number;
  updatedAt: string;
  expiresAt: string;
}
