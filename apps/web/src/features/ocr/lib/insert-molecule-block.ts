export const insertMoleculeBlock = (source: string, blockId: string, smiles: string): string => {
  const trimmed = source.trimEnd();
  const segment = `:::chemd #${blockId}\nsmiles: ${smiles}\n:::`;
  return trimmed.length === 0 ? segment : `${trimmed}\n\n${segment}\n`;
};
