export type OcrApplyAction = "update_existing" | "create_new";

export interface MoleculeOcrApplyResult {
  nextSource: string;
  blockId: string;
  action: OcrApplyAction;
  kind: "molecule";
  smiles: string;
}

export interface ReactionOcrApplyResult {
  nextSource: string;
  blockId: string;
  action: OcrApplyAction;
  kind: "reaction";
  reaction: {
    reactants: string[];
    products: string[];
    conditions: string[];
  };
}

export type OcrApplyResult = MoleculeOcrApplyResult | ReactionOcrApplyResult;

export interface MoleculeOcrRouteResponse {
  status: "ok" | "partial" | "failed";
  kind?: "molecule";
  blockId?: string;
  action?: OcrApplyAction;
  structure?: {
    smiles: string;
    molfile?: string;
  };
  confidence?: number;
  warnings?: string[];
}

export interface ReactionOcrRouteResponse {
  status: "ok" | "partial" | "failed";
  kind?: "reaction";
  blockId?: string;
  action?: OcrApplyAction;
  reaction?: {
    reactants: string[];
    products: string[];
    conditions: string[];
  };
  confidence?: number;
  warnings?: string[];
}

export type UnifiedOcrRouteResponse = MoleculeOcrRouteResponse | ReactionOcrRouteResponse;
