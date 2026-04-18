export type ChemdBlockKind = "molecule" | "reaction";

const KIND_FIELD_RE = /^\s*kind\s*:\s*(molecule|reaction)\s*$/i;

export const readChemdBlockKind = (blockLines: string[]): ChemdBlockKind | undefined => {
  for (const line of blockLines) {
    const match = line.match(KIND_FIELD_RE);
    if (match) {
      return match[1].toLowerCase() as ChemdBlockKind;
    }
  }

  return undefined;
};
