import type { ChemdImportDeclaration } from "@chemd/core";

export interface ImportedModuleSymbols {
  moduleName: string;
  from: string;
  alias?: string;
  importDeclaration: ChemdImportDeclaration;
}

export const buildImportSymbolMap = (
  imports: ChemdImportDeclaration[]
): Map<string, ImportedModuleSymbols> => {
  const symbols = new Map<string, ImportedModuleSymbols>();

  for (const item of imports) {
    const imported: ImportedModuleSymbols = {
      moduleName: item.moduleName,
      from: item.from,
      ...(item.alias ? { alias: item.alias } : {}),
      importDeclaration: item
    };
    symbols.set(item.moduleName, imported);
    if (item.alias) {
      symbols.set(item.alias, imported);
    }
  }

  return symbols;
};
