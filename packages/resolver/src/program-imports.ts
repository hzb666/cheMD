import type { ChemdImportDeclaration, Diagnostic } from "@chemd/core";

export interface ImportedModuleSymbols {
  moduleName: string;
  from: string;
  alias?: string;
  importDeclaration: ChemdImportDeclaration;
}

export const buildImportSymbolMap = (
  imports: ChemdImportDeclaration[],
  diagnostics: Diagnostic[] = []
): Map<string, ImportedModuleSymbols> => {
  const symbols = new Map<string, ImportedModuleSymbols>();

  for (const item of imports) {
    const imported: ImportedModuleSymbols = {
      moduleName: item.moduleName,
      from: item.from,
      ...(item.alias ? { alias: item.alias } : {}),
      importDeclaration: item
    };
    addImportSymbol(symbols, item.moduleName, imported, diagnostics, "module");
    if (item.alias) {
      addImportSymbol(symbols, item.alias, imported, diagnostics, "alias");
    }
  }

  return symbols;
};

const addImportSymbol = (
  symbols: Map<string, ImportedModuleSymbols>,
  key: string,
  imported: ImportedModuleSymbols,
  diagnostics: Diagnostic[],
  keyKind: "module" | "alias"
): void => {
  if (!symbols.has(key)) {
    symbols.set(key, imported);
    return;
  }
  diagnostics.push({
    code: keyKind === "alias" ? "E_DUPLICATE_IMPORT_ALIAS" : "E_DUPLICATE_IMPORT_MODULE",
    severity: "error",
    message: `Duplicate import ${keyKind}: ${key}`,
    nodeId: key,
    sourceLayer: "resolver",
    sourceNodeType: "import",
    sourceNodeId: key,
    sourceSpan: imported.importDeclaration.sourceSpan
  });
};
