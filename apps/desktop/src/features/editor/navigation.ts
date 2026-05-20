import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";

import {
  getChemdDefinition,
  getChemdHover,
  type ChemdDefinitionLocation,
  type ChemdHoverResult,
  type ChemdLanguageCompileOutput,
  type ChemdSourceRange
} from "@chemd/language-service";

type MonacoModel = editor.ITextModel;
type MonacoDisposable = { dispose: () => void };

const chemdNavigationOutputsByUri = new Map<string, ChemdLanguageCompileOutput>();
let chemdNavigationProviderDisposables: MonacoDisposable[] | null = null;

export const updateChemdNavigationOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  chemdNavigationOutputsByUri.set(documentUri, compileOutput);
};

export const cleanupChemdNavigationOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  if (chemdNavigationOutputsByUri.get(documentUri) === compileOutput) {
    chemdNavigationOutputsByUri.delete(documentUri);
  }
};

export const registerChemdNavigationProviders = (
  monaco: Monaco,
  languageId: string
): void => {
  if (chemdNavigationProviderDisposables) {
    return;
  }

  chemdNavigationProviderDisposables = [
    monaco.languages.registerHoverProvider(
      languageId,
      createChemdHoverProvider(monaco)
    ),
    monaco.languages.registerDefinitionProvider(
      languageId,
      createChemdDefinitionProvider(monaco)
    )
  ];
};

const createChemdHoverProvider = (
  monaco: Monaco
): languages.HoverProvider => ({
  provideHover: (model, position) => {
    try {
      const hover = getChemdHover(
        createNavigationRequest(model, position),
        { compileOutput: getCompileOutputForModel(model) }
      );

      return hover ? {
        contents: [{ value: getChemdHoverMarkdown(hover) }],
        range: toMonacoRange(monaco, hover.range)
      } : null;
    } catch {
      return null;
    }
  }
});

const createChemdDefinitionProvider = (
  monaco: Monaco
): languages.DefinitionProvider => ({
  provideDefinition: (model, position) => {
    try {
      return getChemdDefinition(
        createNavigationRequest(model, position),
        { compileOutput: getCompileOutputForModel(model) }
      ).map((location) => toMonacoLocation(monaco, model, location));
    } catch {
      return [];
    }
  }
});

const createNavigationRequest = (
  model: MonacoModel,
  position: Position
) => ({
  source: model.getValue(),
  documentUri: model.uri.toString(),
  documentPath: model.uri.path,
  cursorOffset: model.getOffsetAt(position),
  position: {
    line: position.lineNumber,
    column: position.column
  }
});

const getCompileOutputForModel = (
  model: MonacoModel
): ChemdLanguageCompileOutput | undefined =>
  chemdNavigationOutputsByUri.get(model.uri.toString());

export const getChemdHoverMarkdown = (
  hover: ChemdHoverResult
): string => {
  const sections = [
    hover.referenceTarget
      ? createReferenceTargetMarkdown(hover)
      : null,
    hover.symbol && hover.symbol.id !== hover.referenceTarget?.id
      ? createSymbolMarkdown(hover)
      : null,
    hover.diagnostic
      ? createDiagnosticMarkdown(hover)
      : null
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n\n");
};

const createReferenceTargetMarkdown = (
  hover: ChemdHoverResult
): string => {
  const target = hover.referenceTarget;
  if (!target) {
    return "";
  }

  return [
    `**${target.label}**`,
    "",
    `kind: \`${target.kind}\``,
    `target: \`${target.id}\``,
    `reference: \`${target.explicitReference ? "explicit" : "bare"}\``
  ].join("\n");
};

const createSymbolMarkdown = (
  hover: ChemdHoverResult
): string => {
  const symbol = hover.symbol;
  if (!symbol) {
    return "";
  }

  const lines = [
    `**${symbol.label}**`,
    "",
    `kind: \`${symbol.kind}\``,
    `symbol: \`${symbol.id}\``
  ];
  if (symbol.sourceNodeType) {
    lines.push(`source: \`${symbol.sourceNodeType}\``);
  }
  if (symbol.canonicalQuantities?.length) {
    lines.push("");
    lines.push("quantities:");
    for (const quantity of symbol.canonicalQuantities) {
      const canonical = quantity.canonicalValue !== undefined && quantity.canonicalUnit
        ? `${quantity.canonicalValue} ${quantity.canonicalUnit}`
        : quantity.raw;
      lines.push(`- \`${quantity.field ?? "quantity"}\`: ${canonical}`);
    }
  }
  if (symbol.interopStatus) {
    lines.push("");
    lines.push(`interop: \`${symbol.interopStatus.verified ? "verified" : "unverified"}\``);
    lines.push(`fields: \`${symbol.interopStatus.fields.join(", ")}\``);
    if (symbol.interopStatus.diagnostics.length > 0) {
      lines.push(`diagnostics: \`${symbol.interopStatus.diagnostics.join(", ")}\``);
    }
  }

  return lines.join("\n");
};

const createDiagnosticMarkdown = (
  hover: ChemdHoverResult
): string => {
  const diagnostic = hover.diagnostic;
  if (!diagnostic) {
    return "";
  }

  const lines = [
    `**${diagnostic.code}**`,
    "",
    `severity: \`${diagnostic.severity}\``,
    diagnostic.message
  ];
  if (diagnostic.sourceNodeId) {
    lines.push(`source node: \`${diagnostic.sourceNodeId}\``);
  }

  return lines.join("\n");
};

const toMonacoRange = (
  monaco: Monaco,
  range: ChemdSourceRange
) =>
  new monaco.Range(
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn
  );

const toMonacoLocation = (
  monaco: Monaco,
  model: MonacoModel,
  location: ChemdDefinitionLocation
): languages.Location => ({
  uri: monaco.Uri.parse(location.uri ?? model.uri.toString()),
  range: toMonacoRange(monaco, location.range)
});
