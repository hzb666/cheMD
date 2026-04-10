import type { NormalizedReactionConditions } from "@chemd/core";

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
  reactionSmiles?: string;
  rxnfile?: string;
}

export interface ReactionOcrResponse {
  status: "ok" | "partial" | "failed";
  reaction?: ReactionPayload;
  normalized_conditions?: NormalizedReactionConditions;
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

export interface MoleculeRenderRouteInput {
  type: "molecule";
  smiles?: string;
  molfile?: string;
  renderOptions?: Record<string, unknown>;
}

export interface ReactionRenderRouteInput {
  type: "reaction";
  reactants: string[];
  products: string[];
  conditions: string[];
  renderOptions?: Record<string, unknown>;
}

export type ParsedRenderRouteInput = MoleculeRenderRouteInput | ReactionRenderRouteInput;

export interface MoleculeSaveRouteInput {
  documentId: string;
  blockId: string;
  sessionId: string;
  type: "molecule";
  smiles?: string;
  molfile?: string;
}

export interface ReactionSaveRouteInput {
  documentId: string;
  blockId: string;
  sessionId: string;
  type: "reaction";
  reactants: string[];
  products: string[];
  conditions: string[];
  reactionSmiles?: string;
  rxnfile?: string;
}

export type ParsedSaveRouteInput = MoleculeSaveRouteInput | ReactionSaveRouteInput;

export interface WritebackTargetFields {
  blockId?: string;
  fallbackBlockId?: string;
  moleculeBlockId?: string;
  reactionBlockId?: string;
}

export interface ResolvedWritebackTarget {
  blockId: string;
  action: "update_existing" | "create_new";
}

export interface OcrWritebackInput {
  documentId: string;
  sessionId: string;
  image: File;
  targets: WritebackTargetFields;
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
  normalized_conditions?: NormalizedReactionConditions;
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
  reactionSmiles?: string;
  rxnfile?: string;
  smiles?: never;
  molfile?: never;
}

export type RenderRouteRequest = RenderRequest | ReactionRenderRequest;

export type StructureRecord = MoleculeStructureRecord | ReactionStructureRecord;

export type SaveStructureRecordInput =
  | (Omit<MoleculeStructureRecord, "updatedAt" | "expiresAt" | "kind"> & { kind?: "molecule" })
  | Omit<ReactionStructureRecord, "updatedAt" | "expiresAt">;

export interface ChemServiceStructureLookupResponse {
  found: boolean;
  record?: StructureRecord;
}
