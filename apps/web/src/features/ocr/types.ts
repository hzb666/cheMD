export interface OcrApplyResult {
  nextSource: string;
  blockId: string;
  action: "update_existing" | "create_new";
  smiles: string;
}
