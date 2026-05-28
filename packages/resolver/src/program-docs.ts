import type {
  ChemdDocComment,
  ChemdProgramDocument,
  Diagnostic,
  ReferenceResolution,
  ReferenceToken
} from "@chemd/core";

import type { ProgramSymbolTable } from "./program-index";

export const resolveProgramDocs = (
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdProgramDocument => ({
  ...program,
  docs: program.docs.map((doc) => resolveDocComment(doc, symbols, diagnostics))
});

const resolveDocComment = (
  doc: ChemdDocComment,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdDocComment => ({
  ...doc,
  references: doc.references.map((token) =>
    resolveDocReference(token, doc, symbols, diagnostics)
  )
});

const resolveDocReference = (
  token: ReferenceToken,
  doc: ChemdDocComment,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ReferenceToken => {
  const resolution = resolveReferenceToken(token, symbols);
  if (resolution.status === "unresolved" && doc.exportPolicy !== "audit_only") {
    diagnostics.push({
      code: "W_UNRESOLVED_DOC_REFERENCE",
      severity: "warning",
      message: resolution.message ?? `Unable to resolve documentation reference ${token.raw}`,
      nodeId: token.source,
      sourceLayer: "resolver",
      sourceNodeType: "doc_comment",
      sourceNodeId: doc.id,
      sourceSpan: token
    });
  }
  return {
    ...token,
    resolution
  };
};

const resolveReferenceToken = (
  token: ReferenceToken,
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  if (token.kind === "object") {
    return resolveObjectToken(token, symbols);
  }
  if (token.kind === "object_field" || token.kind === "alias_field") {
    return resolveFieldToken(token, symbols);
  }
  if (token.kind === "meta") {
    const target = symbols.primaryAliases.get(token.field ?? "");
    return target
      ? { status: "resolved", value: target }
      : unresolved(token);
  }
  return unresolved(token);
};

const resolveObjectToken = (
  token: ReferenceToken,
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  const targetId = symbols.primaryAliases.get(token.source) ?? token.source;
  const declaration = symbols.declarationsById.get(targetId);
  return declaration
    ? { status: "resolved", value: declaration }
    : unresolved(token);
};

const resolveFieldToken = (
  token: ReferenceToken,
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  const targetId = symbols.primaryAliases.get(token.source) ?? token.source;
  const declaration = symbols.declarationsById.get(targetId);
  if (!declaration || !("fields" in declaration) || !token.field) {
    return unresolved(token);
  }
  const value = declaration.fields[token.field];
  return value === undefined
    ? unresolved(token)
    : { status: "resolved", value };
};

const unresolved = (token: ReferenceToken): ReferenceResolution => ({
  status: "unresolved",
  message: `Unable to resolve documentation reference ${token.raw}`
});
