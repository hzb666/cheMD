import type {
  AgentRunDeclaration,
  ChemdDeclaration,
  ChemdDocComment,
  ChemdDocCommentRef,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement,
  SourceMappedNode
} from "@chemd/core";
import type { CompileResult } from "@chemd/compiler";
import {
  createDocumentRange,
  sourceSpanToRange
} from "./ranges";
import type {
  ChemdOutlineItem,
  ChemdOutlineKind,
  ChemdSourceRange,
  ChemdSymbol
} from "./types";

export interface ChemdProgramReference {
  symbolId: string;
  raw: string;
  range: ChemdSourceRange;
  refKind: ChemdReferenceExpr["refKind"];
  field?: string;
}

const declarationSymbolKinds = new Set<string>([
  "molecule",
  "material",
  "batch",
  "reaction",
  "result",
  "analysis",
  "sample",
  "artifact",
  "condition_screen",
  "procedure",
  "observation",
  "trace",
  "agent_run"
]);

const typedNodeRange = (
  node: CompileResult["typedSemanticGraph"]["nodes"][number],
  fallback: ChemdSourceRange
): ChemdSourceRange =>
  sourceSpanToRange(node.sourceMetadata?.sourceSpan, fallback);

export const rangeForNode = (
  node: SourceMappedNode | undefined,
  fallback: ChemdSourceRange
): ChemdSourceRange => sourceSpanToRange(node?.sourceSpan, fallback);

const docsById = (
  program: ChemdProgramDocument
): Map<string, ChemdDocComment> =>
  new Map(program.docs.map((doc) => [doc.id, doc]));

const docsForRefs = (
  refs: readonly ChemdDocCommentRef[] | undefined,
  docs: Map<string, ChemdDocComment>,
  fallback: ChemdSourceRange
): ChemdOutlineItem[] =>
  (refs ?? []).flatMap((ref) => {
    const doc = docs.get(ref.docId);
    return doc ? [docOutlineItem(doc, fallback)] : [];
  });

const docOutlineItem = (
  doc: ChemdDocComment,
  fallback: ChemdSourceRange
): ChemdOutlineItem => ({
  id: doc.id,
  label: doc.markdown.split(/\r?\n/)[0]?.trim() || doc.id,
  kind: "documentation",
  range: rangeForNode(doc, fallback)
});

const metadataLabel = (program: ChemdProgramDocument): string =>
  program.meta.title || program.meta.id || "metadata";

export const buildProgramOutline = (
  result: CompileResult,
  source: string
): ChemdOutlineItem[] => {
  const fallback = createDocumentRange(source);
  const docs = docsById(result.program);
  const moduleItem: ChemdOutlineItem = {
    id: result.program.module.name || "module",
    label: result.program.module.name || "module",
    kind: "module",
    range: rangeForNode(result.program.module, fallback),
    children: docsForRefs(result.program.module.docs, docs, fallback)
  };
  const metadataItem: ChemdOutlineItem = {
    id: `${result.program.meta.id || result.program.module.name}:metadata`,
    label: metadataLabel(result.program),
    kind: "metadata",
    range: rangeForNode(result.program.meta, fallback),
    children: docsForRefs(result.program.meta.docs, docs, fallback)
  };

  return [
    moduleItem,
    metadataItem,
    ...result.program.declarations.map((declaration) =>
      declarationOutlineItem(declaration, docs, fallback)
    )
  ];
};

const declarationOutlineItem = (
  declaration: ChemdDeclaration,
  docs: Map<string, ChemdDocComment>,
  fallback: ChemdSourceRange
): ChemdOutlineItem => {
  const children = [
    ...docsForRefs(declaration.docs, docs, fallback),
    ...declarationChildren(declaration, docs, fallback)
  ];
  return {
    id: declaration.id,
    label: declaration.id,
    kind: declaration.kind as ChemdOutlineKind,
    range: rangeForNode(declaration, fallback),
    ...(children.length > 0 ? { children } : {})
  };
};

const declarationChildren = (
  declaration: ChemdDeclaration,
  docs: Map<string, ChemdDocComment>,
  fallback: ChemdSourceRange
): ChemdOutlineItem[] => {
  if (declaration.kind === "procedure") {
    return procedureStatements(declaration.children, declaration.id, docs, fallback);
  }
  if (declaration.kind === "agent_run") {
    return agentRunChildren(declaration, docs, fallback);
  }
  return [];
};

const procedureStatements = (
  statements: readonly ProcedureStatement[],
  procedureId: string,
  docs: Map<string, ChemdDocComment>,
  fallback: ChemdSourceRange
): ChemdOutlineItem[] =>
  statements.flatMap((statement) => {
    if (statement.kind === "doc") {
      return docsForRefs([statement.doc], docs, fallback);
    }
    if (statement.kind === "step") {
      return [{
        id: `${procedureId}.${statement.id}`,
        label: statement.id,
        kind: "step",
        range: rangeForNode(statement, fallback),
        children: docsForRefs(statement.docs, docs, fallback)
      }];
    }
    return [procedureControlItem(statement, procedureId, docs, fallback)];
  });

const procedureControlItem = (
  control: ProcedureControlDeclaration,
  procedureId: string,
  docs: Map<string, ChemdDocComment>,
  fallback: ChemdSourceRange
): ChemdOutlineItem => {
  const id = control.id ?? `${procedureId}.${control.controlKind}`;
  const children = [
    ...docsForRefs(control.docs, docs, fallback),
    ...procedureStatements(control.children, procedureId, docs, fallback)
  ];
  return {
    id,
    label: control.id ?? control.controlKind,
    kind: "control",
    range: rangeForNode(control, fallback),
    ...(children.length > 0 ? { children } : {})
  };
};

const agentRunChildren = (
  declaration: AgentRunDeclaration,
  docs: Map<string, ChemdDocComment>,
  fallback: ChemdSourceRange
): ChemdOutlineItem[] => [
  ...declaration.evidence.map((item) =>
    outlineChild(item.id, "agent_evidence", item, fallback)
  ),
  ...declaration.toolCalls.map((item) =>
    outlineChild(item.id, "agent_tool", item, fallback, docsForRefs(item.docs, docs, fallback))
  ),
  ...declaration.patches.map((item) =>
    outlineChild(item.id, "agent_patch", item, fallback, docsForRefs(item.docs, docs, fallback))
  ),
  ...declaration.decisions.map((item) =>
    outlineChild(item.id, "agent_decision", item, fallback)
  ),
  ...declaration.auditTimeline.map((item) =>
    outlineChild(item.id, "agent_timeline", item, fallback)
  )
];

const outlineChild = (
  id: string,
  kind: ChemdOutlineKind,
  node: SourceMappedNode,
  fallback: ChemdSourceRange,
  children: ChemdOutlineItem[] = []
): ChemdOutlineItem => ({
  id,
  label: id,
  kind,
  range: rangeForNode(node, fallback),
  ...(children.length > 0 ? { children } : {})
});

export const buildProgramSymbols = (
  result: CompileResult,
  source: string
): ChemdSymbol[] => {
  const fallback = createDocumentRange(source);
  const symbols = new Map<string, ChemdSymbol>();

  addSymbol(symbols, {
    id: result.program.module.name || "module",
    label: result.program.module.name || "module",
    kind: "module",
    range: rangeForNode(result.program.module, fallback),
    sourceNodeType: "module"
  });
  if (result.program.meta.id) {
    addSymbol(symbols, {
      id: result.program.meta.id,
      label: result.program.meta.id,
      kind: "meta",
      range: rangeForNode(result.program.meta, fallback),
      sourceNodeType: "meta"
    });
  }

  for (const declaration of result.program.declarations) {
    collectDeclarationSymbols(declaration, symbols, fallback);
  }
  for (const doc of result.program.docs) {
    addSymbol(symbols, {
      id: doc.id,
      label: doc.id,
      kind: "documentation",
      range: rangeForNode(doc, fallback),
      sourceNodeType: "doc_comment"
    });
  }
  for (const node of result.typedSemanticGraph.nodes) {
    const existing = symbols.get(node.nodeId);
    addSymbol(symbols, {
      id: node.nodeId,
      label: node.nodeId,
      kind: existing?.kind ?? node.kind,
      range: existing?.range ?? typedNodeRange(node, fallback),
      sourceNodeType: node.sourceNodeType
    });
  }

  return [...symbols.values()].sort(compareSymbols);
};

const addSymbol = (
  symbols: Map<string, ChemdSymbol>,
  symbol: ChemdSymbol
): void => {
  const existing = symbols.get(symbol.id);
  symbols.set(symbol.id, existing ? { ...existing, ...symbol } : symbol);
};

const collectDeclarationSymbols = (
  declaration: ChemdDeclaration,
  symbols: Map<string, ChemdSymbol>,
  fallback: ChemdSourceRange
): void => {
  addSymbol(symbols, {
    id: declaration.id,
    label: declaration.id,
    kind: declaration.kind,
    range: rangeForNode(declaration, fallback),
    sourceNodeType: declaration.kind
  });
  if (declaration.kind === "procedure") {
    collectProcedureSymbols(declaration, symbols, fallback);
  } else if (declaration.kind === "agent_run") {
    collectAgentSymbols(declaration, symbols, fallback);
  }
};

const collectProcedureSymbols = (
  declaration: ProcedureDeclaration,
  symbols: Map<string, ChemdSymbol>,
  fallback: ChemdSourceRange
): void => {
  for (const statement of declaration.children) {
    if (statement.kind === "step") {
      addSymbol(symbols, {
        id: statement.id,
        label: statement.id,
        kind: "step",
        range: rangeForNode(statement, fallback),
        sourceNodeType: "procedure"
      });
    } else if (statement.kind === "control") {
      const id = statement.id ?? `${declaration.id}.${statement.controlKind}`;
      addSymbol(symbols, {
        id,
        label: id,
        kind: "control",
        range: rangeForNode(statement, fallback),
        sourceNodeType: "procedure"
      });
      collectProcedureSymbols({ ...declaration, children: statement.children }, symbols, fallback);
    }
  }
};

const collectAgentSymbols = (
  declaration: AgentRunDeclaration,
  symbols: Map<string, ChemdSymbol>,
  fallback: ChemdSourceRange
): void => {
  const addAgent = (id: string, kind: string, node: SourceMappedNode): void =>
    addSymbol(symbols, {
      id,
      label: id,
      kind,
      range: rangeForNode(node, fallback),
      sourceNodeType: "agent_run"
    });
  declaration.toolCalls.forEach((item) => addAgent(item.id, "agent_tool", item));
  declaration.evidence.forEach((item) => addAgent(item.id, "agent_evidence", item));
  declaration.patches.forEach((item) => addAgent(item.id, "agent_patch", item));
  declaration.decisions.forEach((item) => addAgent(item.id, "agent_decision", item));
  declaration.auditTimeline.forEach((item) => addAgent(item.id, "agent_timeline", item));
};

export const isReferenceableSymbolKind = (kind: string): boolean =>
  declarationSymbolKinds.has(kind);

export const collectProgramReferences = (
  result: CompileResult,
  source: string
): ChemdProgramReference[] => {
  const fallback = createDocumentRange(source);
  return [
    ...Object.entries(result.program.meta.primary ?? {}).flatMap(([field, value]) =>
      collectValueReferences(value, fallback, field)
    ),
    ...Object.entries(result.program.meta.fields).flatMap(([field, value]) =>
      collectValueReferences(value, fallback, field)
    ),
    ...result.program.declarations.flatMap((declaration) =>
      collectDeclarationReferences(declaration, fallback)
    ),
    ...result.program.docs.flatMap((doc) =>
      doc.references.map((reference) => ({
        symbolId: reference.source.replace(/^@/, ""),
        raw: reference.raw,
        refKind: "local" as const,
        range: sourceSpanToRange(reference, fallback),
        field: "doc_comment_reference"
      }))
    )
  ].sort((left, right) =>
    left.range.startLine - right.range.startLine ||
    left.range.startColumn - right.range.startColumn
  );
};

export const findProgramReferenceAtPosition = (
  result: CompileResult,
  source: string,
  position: { line: number; column: number }
): ChemdProgramReference | undefined =>
  collectProgramReferences(result, source)
    .filter((reference) => rangeContains(reference.range, position))
    .sort((left, right) => rangeArea(left.range) - rangeArea(right.range))[0];

const collectDeclarationReferences = (
  declaration: ChemdDeclaration,
  fallback: ChemdSourceRange
): ChemdProgramReference[] => {
  const references: ChemdProgramReference[] = [];
  if ("target" in declaration && declaration.target) {
    references.push(...collectValueReferences(declaration.target, fallback, "target"));
  }
  if (declaration.kind === "procedure" && declaration.evidence) {
    references.push(...declaration.evidence.flatMap((value) =>
      collectValueReferences(value, fallback, "evidence")
    ));
  }
  if ("fields" in declaration) {
    references.push(...Object.entries(declaration.fields).flatMap(([field, value]) =>
      collectValueReferences(value, fallback, field)
    ));
  }
  if (declaration.kind === "procedure") {
    references.push(...declaration.children.flatMap((statement) =>
      collectProcedureStatementReferences(statement, fallback)
    ));
  }
  if (declaration.kind === "agent_run") {
    references.push(...collectAgentReferences(declaration, fallback));
  }
  return references;
};

const collectProcedureStatementReferences = (
  statement: ProcedureStatement,
  fallback: ChemdSourceRange
): ChemdProgramReference[] => {
  if (statement.kind === "doc") return [];
  const own = Object.entries(statement.args).flatMap(([field, value]) =>
    collectValueReferences(value, fallback, field)
  );
  const direct = [
    ...((statement.kind === "step" ? statement.inputs ?? [] : []) as ChemdValue[])
      .flatMap((value) => collectValueReferences(value, fallback, "inputs")),
    ...((statement.kind === "step" ? statement.outputs ?? [] : []) as ChemdValue[])
      .flatMap((value) => collectValueReferences(value, fallback, "outputs")),
    ...((statement.kind === "step" ? statement.evidence ?? [] : []) as ChemdValue[])
      .flatMap((value) => collectValueReferences(value, fallback, "evidence"))
  ];
  return statement.kind === "control"
    ? [
        ...own,
        ...statement.children.flatMap((child) =>
          collectProcedureStatementReferences(child, fallback)
        )
      ]
    : [...own, ...direct];
};

const collectAgentReferences = (
  declaration: AgentRunDeclaration,
  fallback: ChemdSourceRange
): ChemdProgramReference[] => [
  ...declaration.evidence.flatMap((item) =>
    item.refs?.flatMap((value) => collectValueReferences(value, fallback, "evidence")) ?? []
  ),
  ...declaration.toolCalls.flatMap((item) => [
    ...(item.evidence?.flatMap((value) => collectValueReferences(value, fallback, "evidence")) ?? []),
    ...(item.args
      ? Object.entries(item.args).flatMap(([field, value]) =>
          collectValueReferences(value, fallback, field)
        )
      : []),
    ...(item.output ? collectValueReferences(item.output, fallback, "output") : [])
  ]),
  ...declaration.patches.flatMap((item) => [
    ...(item.evidence?.flatMap((value) => collectValueReferences(value, fallback, "evidence")) ?? []),
    ...item.edits.flatMap((edit) => collectValueReferences(edit.value, fallback, edit.target.kind))
  ]),
  ...declaration.auditTimeline.flatMap((item) =>
    item.evidence?.flatMap((value) => collectValueReferences(value, fallback, "evidence")) ?? []
  )
];

const collectValueReferences = (
  value: ChemdValue | undefined,
  fallback: ChemdSourceRange,
  field?: string
): ChemdProgramReference[] => {
  if (!value) return [];
  if (value.type === "reference") {
    return [{
      symbolId: value.refKind === "external_document"
        ? `${value.externalDocumentId}#${value.target}`
        : value.target,
      raw: value.raw,
      refKind: value.refKind,
      range: sourceSpanToRange(value.sourceSpan, fallback),
      ...(field ? { field } : {})
    }];
  }
  if (value.type === "list") {
    return value.items.flatMap((item) => collectValueReferences(item, fallback, field));
  }
  if (value.type === "record") {
    return value.fields.flatMap((recordField) =>
      collectValueReferences(recordField.value, fallback, recordField.key)
    );
  }
  if (value.type === "call") {
    return value.args.flatMap((arg) => collectValueReferences(arg.value, fallback, arg.name));
  }
  if (value.type === "patch") {
    return collectValueReferences(value.value, fallback, value.target.kind);
  }
  return [];
};

const compareSymbols = (left: ChemdSymbol, right: ChemdSymbol): number =>
  left.range.startLine - right.range.startLine ||
  left.range.startColumn - right.range.startColumn ||
  left.id.localeCompare(right.id);

const rangeContains = (
  range: ChemdSourceRange,
  position: { line: number; column: number }
): boolean => {
  if (position.line < range.startLine || position.line > range.endLine) {
    return false;
  }
  if (position.line === range.startLine && position.column < range.startColumn) {
    return false;
  }
  return position.line !== range.endLine || position.column <= range.endColumn;
};

const rangeArea = (range: ChemdSourceRange): number =>
  (range.endLine - range.startLine) * 1000 + range.endColumn - range.startColumn;
