export type ChemProgramDeclarationKind = "molecule" | "reaction";

export interface ChemProgramDeclaration {
  blockId: string;
  bodyLines: string[];
  endLine: number;
  kind: ChemProgramDeclarationKind;
  startLine: number;
}

const DECLARATION_RE = /^\s*(molecule|reaction)\s+([A-Za-z_][\w-]*)\s*\{\s*$/;
const CLOSE_RE = /^\s*}\s*$/;

export const quoteProgramString = (value: string): string => JSON.stringify(value);

export const serializeProgramStringList = (values: readonly string[]): string =>
  `[${values.map(quoteProgramString).join(", ")}]`;

export const parseFieldKey = (line: string): string | null => {
  const match = line.match(/^\s*([a-z][a-z0-9_]*)\s*:/i);
  return match?.[1]?.toLowerCase() ?? null;
};

export const pickPreservedLines = (
  lines: readonly string[],
  allowedKeys: ReadonlySet<string>
): string[] =>
  lines.filter((line) => {
    const key = parseFieldKey(line);
    return !key || allowedKeys.has(key);
  });

const findDeclarationEnd = (lines: readonly string[], startLine: number): number => {
  for (let scan = startLine + 1; scan < lines.length; scan += 1) {
    if (CLOSE_RE.test(lines[scan] ?? "")) {
      return scan;
    }
  }

  return lines.length;
};

export const listChemProgramDeclarations = (
  source: string,
  kind?: ChemProgramDeclarationKind
): ChemProgramDeclaration[] => {
  const lines = source.split(/\r?\n/);
  const declarations: ChemProgramDeclaration[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(DECLARATION_RE);
    if (!match) {
      continue;
    }

    const declarationKind = match[1] as ChemProgramDeclarationKind;
    const endLine = findDeclarationEnd(lines, index);
    if (!kind || declarationKind === kind) {
      declarations.push({
        blockId: match[2] ?? "",
        bodyLines: lines.slice(index + 1, endLine),
        endLine,
        kind: declarationKind,
        startLine: index
      });
    }
    index = endLine;
  }

  return declarations;
};

export const findChemProgramDeclaration = (
  source: string,
  blockId: string,
  kind?: ChemProgramDeclarationKind
): ChemProgramDeclaration | null =>
  listChemProgramDeclarations(source, kind)
    .find((declaration) => declaration.blockId === blockId) ?? null;

export const replaceChemProgramDeclaration = (
  source: string,
  declaration: ChemProgramDeclaration,
  nextLines: readonly string[]
): string => {
  const lines = source.split(/\r?\n/);
  const hasClosingBrace = declaration.endLine < lines.length
    && CLOSE_RE.test(lines[declaration.endLine] ?? "");
  const deleteCount = hasClosingBrace
    ? declaration.endLine - declaration.startLine + 1
    : declaration.endLine - declaration.startLine;
  lines.splice(declaration.startLine, deleteCount, ...nextLines);
  return lines.join("\n");
};
