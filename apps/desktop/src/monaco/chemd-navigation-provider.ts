import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdOutlineItem,
  ChemdSourceRange
} from "@chemd/language-service";
import {
  findReferences,
  findSymbolDefinitions,
  type WorkspaceReference,
  type WorkspaceSymbol,
  type WorkspaceSymbolIndex
} from "@chemd/workspace-index";

type MonacoDisposable = { dispose: () => void };

type NavigationProviderOptions = {
  getCompileOutput: () => ChemdLanguageCompileOutput | undefined;
  getWorkspaceIndex: () => WorkspaceSymbolIndex | null | undefined;
};

type TemplateParamSpecLike = {
  name: string;
  raw?: string;
  type?: {
    kind: string;
    targetKind?: string;
    quantityClass?: string;
  };
};

type TemplateNodeLike = {
  type: "template";
  name: string;
  params?: string[];
  paramSpecs?: TemplateParamSpecLike[];
  description?: string;
};

let activeNavigationRegistration: {
  id: symbol;
  disposables: MonacoDisposable[];
} | null = null;

const disposeAll = (disposables: readonly MonacoDisposable[]): void => {
  for (const disposable of disposables) {
    disposable.dispose();
  }
};

const wordAtPosition = (
  model: editor.ITextModel,
  position: Position
): string | null => {
  const word = model.getWordAtPosition(position)?.word;
  if (word) {
    return word.replace(/^@/u, "");
  }
  const line = model.getLineContent(position.lineNumber);
  const prefix = line.slice(0, position.column - 1);
  const suffix = line.slice(position.column - 1);
  const match = `${prefix}${suffix}`.match(/(?:@|[A-Za-z0-9_.-]+#)?[A-Za-z0-9_-]+/u);
  return match?.[0]?.replace(/^@/u, "").split("#").pop() ?? null;
};

const toMonacoRange = (
  monaco: Monaco,
  range: WorkspaceSymbol["range"] | WorkspaceReference["range"]
): languages.Location["range"] =>
  new monaco.Range(
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn
  );

const toHoverRange = (
  range: ChemdSourceRange
): languages.Hover["range"] => ({
  startLineNumber: range.startLine,
  startColumn: range.startColumn,
  endLineNumber: range.endLine,
  endColumn: range.endColumn
});

const symbolToLocation = (
  monaco: Monaco,
  symbol: WorkspaceSymbol
): languages.Location => ({
  uri: monaco.Uri.parse(symbol.documentUri),
  range: toMonacoRange(monaco, symbol.range)
});

const referenceToLocation = (
  monaco: Monaco,
  reference: WorkspaceReference
): languages.Location => ({
  uri: monaco.Uri.parse(reference.documentUri),
  range: toMonacoRange(monaco, reference.range)
});

const getMatchingSymbols = (
  index: WorkspaceSymbolIndex | null | undefined,
  model: editor.ITextModel,
  position: Position
): WorkspaceSymbol[] => {
  const target = wordAtPosition(model, position);
  if (!index || !target) {
    return [];
  }
  return findSymbolDefinitions(index, { localId: target });
};

const containsPosition = (
  range: ChemdSourceRange,
  position: Position
): boolean =>
  position.lineNumber >= range.startLine
  && position.lineNumber <= range.endLine
  && (
    position.lineNumber !== range.startLine
    || position.column >= range.startColumn
  )
  && (
    position.lineNumber !== range.endLine
    || position.column <= range.endColumn
  );

const getReferenceAtPosition = (
  index: WorkspaceSymbolIndex | null | undefined,
  model: editor.ITextModel,
  position: Position
): WorkspaceReference | null => {
  if (!index) {
    return null;
  }
  const modelUri = model.uri.toString();
  return index.references.find((reference) =>
    reference.documentUri === modelUri && containsPosition(reference.range, position)
  ) ?? null;
};

const getDiagnosticsForModel = (
  output: ChemdLanguageCompileOutput | undefined,
  index: WorkspaceSymbolIndex | null | undefined,
  model: editor.ITextModel
): ChemdEditorDiagnostic[] => {
  const modelUri = model.uri.toString();
  const outputDiagnostics = output && (!output.documentUri || output.documentUri === modelUri)
    ? output.diagnostics
    : [];
  const indexDiagnostics = index?.diagnostics
    .filter((item) => item.documentUri === modelUri)
    .map((item) => item.diagnostic) ?? [];
  return [...outputDiagnostics, ...indexDiagnostics];
};

const getDiagnosticAtPosition = (
  diagnostics: readonly ChemdEditorDiagnostic[],
  position: Position
): ChemdEditorDiagnostic | null =>
  diagnostics.find((diagnostic) => containsPosition(diagnostic.range, position)) ?? null;

const isTemplateNode = (value: unknown): value is TemplateNodeLike =>
  typeof value === "object"
  && value !== null
  && "type" in value
  && (value as { type?: unknown }).type === "template"
  && "name" in value
  && typeof (value as { name?: unknown }).name === "string";

const getTemplateNameHoverRange = (
  model: editor.ITextModel,
  position: Position
): ChemdSourceRange | null => {
  const line = model.getLineContent(position.lineNumber);
  const match = line.match(/^:::template\s+(\S+)/u);
  if (!match?.[1]) return null;
  const startColumn = line.indexOf(match[1]) + 1;
  const endColumn = startColumn + match[1].length;
  const range = {
    startLine: position.lineNumber,
    startColumn,
    endLine: position.lineNumber,
    endColumn
  };
  return containsPosition(range, position) ? range : null;
};

const getTemplateAtPosition = (
  output: ChemdLanguageCompileOutput | undefined,
  model: editor.ITextModel,
  position: Position
): { node: TemplateNodeLike; outline: ChemdOutlineItem; range: ChemdSourceRange } | null => {
  if (output?.status !== "ok") return null;
  const headerRange = getTemplateNameHoverRange(model, position);
  if (!headerRange) return null;
  const line = model.getLineContent(position.lineNumber);
  const targetName = line.slice(headerRange.startColumn - 1, headerRange.endColumn - 1);
  if (!targetName) return null;
  const outline = output.outline.find((item) =>
    item.kind === "template"
    && item.id === targetName
    && containsPosition(item.range, position)
  );
  const node = (output.result.document.children as readonly unknown[]).find((item): item is TemplateNodeLike =>
    isTemplateNode(item) && item.name === targetName
  );
  return outline && node ? { node, outline, range: headerRange } : null;
};

export const getChemdHoverMarkdown = (
  symbol: WorkspaceSymbol
): string => [
  `**${symbol.label}**`,
  "",
  `kind: \`${symbol.kind}\``,
  `document: \`${symbol.documentPath ?? symbol.documentUri}\``,
  `line: \`${symbol.range.startLine}\``
].join("\n");

export const getChemdReferenceHoverMarkdown = (
  reference: WorkspaceReference
): string => [
  `**${reference.targetText}**`,
  "",
  `status: \`${reference.status}\``,
  `field: \`${reference.field}\``,
  `document: \`${reference.documentPath ?? reference.documentUri}\``
].join("\n");

export const getChemdDiagnosticHoverMarkdown = (
  diagnostic: ChemdEditorDiagnostic
): string => [
  `**${diagnostic.code}**`,
  "",
  diagnostic.message,
  "",
  `severity: \`${diagnostic.severity}\``,
  `quick fixes: \`${diagnostic.quickFixes.length}\``
].join("\n");

const formatParamSpec = (param: TemplateParamSpecLike): string =>
  param.raw ?? (
    param.type?.kind === "ref" && param.type.targetKind
      ? `${param.name}: ref<${param.type.targetKind}>`
      : param.type?.kind === "quantity" && param.type.quantityClass
        ? `${param.name}: quantity<${param.type.quantityClass}>`
        : `${param.name}: ${param.type?.kind ?? "string"}`
  );

export const getChemdTemplateHoverMarkdown = (
  template: TemplateNodeLike
): string => {
  const params = template.paramSpecs && template.paramSpecs.length > 0
    ? template.paramSpecs.map(formatParamSpec)
    : template.params ?? [];
  return [
    `**${template.name}**`,
    "",
    "kind: `template`",
    `params: ${params.length > 0 ? params.map((param) => `\`${param}\``).join(", ") : "`none`"}`,
    ...(template.description ? ["", template.description] : [])
  ].join("\n");
};

const provideHover = (
  model: editor.ITextModel,
  position: Position,
  options: NavigationProviderOptions
): languages.ProviderResult<languages.Hover> => {
  const index = options.getWorkspaceIndex();
  const output = options.getCompileOutput();
  const diagnostic = getDiagnosticAtPosition(
    getDiagnosticsForModel(output, index, model),
    position
  );
  if (diagnostic) {
    return {
      contents: [{ value: getChemdDiagnosticHoverMarkdown(diagnostic) }],
      range: toHoverRange(diagnostic.range)
    };
  }
  const template = getTemplateAtPosition(output, model, position);
  if (template) {
    return {
      contents: [{ value: getChemdTemplateHoverMarkdown(template.node) }],
      range: toHoverRange(template.range)
    };
  }
  const symbol = getMatchingSymbols(index, model, position)[0];
  if (!symbol) {
    const reference = getReferenceAtPosition(index, model, position);
    if (reference?.status === "unresolved") {
      return {
        contents: [{ value: getChemdReferenceHoverMarkdown(reference) }],
        range: toHoverRange(reference.range)
      };
    }
    return null;
  }
  return {
    contents: [{ value: getChemdHoverMarkdown(symbol) }],
    range: {
      startLineNumber: position.lineNumber,
      startColumn: Math.max(1, position.column - symbol.localId.length),
      endLineNumber: position.lineNumber,
      endColumn: position.column
    }
  };
};

const provideDefinition = (
  monaco: Monaco,
  model: editor.ITextModel,
  position: Position,
  options: NavigationProviderOptions
): languages.ProviderResult<languages.Definition> =>
  getMatchingSymbols(options.getWorkspaceIndex(), model, position)
    .map((symbol) => symbolToLocation(monaco, symbol));

const provideReferences = (
  monaco: Monaco,
  model: editor.ITextModel,
  position: Position,
  options: NavigationProviderOptions
): languages.ProviderResult<languages.Location[]> => {
  const index = options.getWorkspaceIndex();
  const symbols = getMatchingSymbols(index, model, position);
  if (!index || symbols.length === 0) {
    return [];
  }
  const locations = symbols.flatMap((symbol) => [
    symbolToLocation(monaco, symbol),
    ...findReferences(index, { symbolId: symbol.symbolId })
      .map((reference) => referenceToLocation(monaco, reference))
  ]);
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.uri.toString()}::${location.range.startLineNumber}:${location.range.startColumn}:${location.range.endLineNumber}:${location.range.endColumn}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const registerChemdNavigationProviders = (
  monaco: Monaco,
  languageId: string,
  options: NavigationProviderOptions
): MonacoDisposable => {
  if (activeNavigationRegistration) {
    disposeAll(activeNavigationRegistration.disposables);
  }

  const id = Symbol(languageId);
  const disposables = [
    monaco.languages.registerHoverProvider(languageId, {
      provideHover: (
        model: editor.ITextModel,
        position: Position
      ) => provideHover(model, position, options)
    }),
    monaco.languages.registerDefinitionProvider(languageId, {
      provideDefinition: (
        model: editor.ITextModel,
        position: Position
      ) =>
        provideDefinition(monaco, model, position, options)
    }),
    monaco.languages.registerReferenceProvider(languageId, {
      provideReferences: (
        model: editor.ITextModel,
        position: Position
      ) =>
        provideReferences(monaco, model, position, options)
    })
  ];
  activeNavigationRegistration = { id, disposables };

  return {
    dispose: () => {
      if (activeNavigationRegistration?.id !== id) {
        return;
      }
      disposeAll(activeNavigationRegistration.disposables);
      activeNavigationRegistration = null;
    }
  };
};
