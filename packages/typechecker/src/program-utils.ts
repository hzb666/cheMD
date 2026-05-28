import type {
  ChemdDeclaration,
  ChemdProgramDeclarationKind,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  ChemdValue,
  SourceSpan
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";

import type {
  ProgramSourceMetadata,
  ReferenceOrLiteral,
  ReferenceType
} from "./types";

const FIELD_DECLARATION_KINDS = new Set<ChemdProgramDeclarationKind>([
  "molecule",
  "material",
  "batch",
  "reaction",
  "result",
  "analysis",
  "sample",
  "artifact",
  "condition_screen",
  "observation",
  "trace"
]);

const TARGET_KIND_BY_DECLARATION: Record<ChemdProgramDeclarationKind, ReferenceType["targetKind"]> = {
  molecule: "molecule",
  material: "material",
  batch: "batch",
  reaction: "reaction",
  result: "result",
  analysis: "analysis",
  sample: "sample",
  artifact: "artifact",
  condition_screen: "condition_varies",
  procedure: "procedure",
  observation: "observation",
  trace: "trace",
  agent_run: "unknown"
};

export type ProgramSymbolTable = Map<string, ChemdDeclaration>;
export type ProgramFieldDeclaration = Extract<ChemdDeclaration, { fields: Record<string, ChemdValue> }>;

export const buildProgramSymbolTable = (
  program: ChemdProgramDocument
): ProgramSymbolTable => {
  const table = new Map(
    program.declarations.flatMap((declaration) => [
      [declaration.id, declaration] as const,
      [declaration.qualifiedId, declaration] as const
    ])
  );
  for (const [kind, reference] of Object.entries(program.meta.primary ?? {})) {
    if (reference.refKind !== "local") continue;
    const declaration = table.get(reference.target);
    if (!declaration) continue;
    table.set(kind, declaration);
    table.set(`primary_${kind}`, declaration);
  }
  return table;
};

export const hasFields = (
  declaration: ChemdDeclaration
): declaration is ProgramFieldDeclaration =>
  FIELD_DECLARATION_KINDS.has(declaration.kind);

export const createProgramDiagnostic = (
  code: string,
  message: string,
  declaration: ChemdDeclaration,
  field?: string,
  severity: V03Diagnostic["severity"] = "error",
  facts: Record<string, unknown> = {}
): V03Diagnostic => ({
  code,
  severity,
  message,
  sourceLayer: "typechecker",
  sourceNodeType: declaration.kind,
  sourceNodeId: declaration.id,
  sourceField: field,
  facts: { declarationKind: declaration.kind, declarationId: declaration.id, ...facts }
});

export const sourceForDeclaration = (
  declaration: ChemdDeclaration,
  field?: string,
  sourceSpan?: SourceSpan
): ProgramSourceMetadata => ({
  sourceKind: declaration.kind === "agent_run" ? "agent_run" : "declaration",
  declarationKind: declaration.kind,
  declarationId: declaration.id,
  ...(field ? { field } : {}),
  sourceSpan: sourceSpan ?? declaration.sourceSpan
});

export const valueToText = (value: ChemdValue | undefined): string | undefined => {
  if (!value) return undefined;
  if (value.type === "string") return value.value;
  if (value.type === "identifier") return value.name;
  if (value.type === "boolean") return String(value.value);
  if (value.type === "number" || value.type === "quantity" || value.type === "percent") {
    return value.raw;
  }
  return value.raw;
};

export const valueToStringList = (value: ChemdValue | undefined): string[] => {
  if (!value) return [];
  if (value.type === "list") {
    return value.items.map(valueToText).filter((item): item is string => Boolean(item));
  }
  const text = valueToText(value);
  return text ? [text] : [];
};

export const normalizeRef = (value: string): string => value.trim().replace(/^@/, "");

export const referenceToTyped = (
  reference: ChemdReferenceExpr,
  symbols: ProgramSymbolTable
): ReferenceType => {
  const refId = reference.refKind === "external_document"
    ? `${reference.externalDocumentId}#${reference.target}`
    : normalizeRef(reference.target);
  const target = symbols.get(refId);
  return {
    kind: "reference",
    refId,
    targetKind: target ? TARGET_KIND_BY_DECLARATION[target.kind] : "unknown",
    resolved: Boolean(target)
  };
};

export const valueToReferenceOrLiteral = (
  value: ChemdValue | undefined,
  symbols: ProgramSymbolTable
): ReferenceOrLiteral | undefined => {
  if (!value) return undefined;
  if (value.type === "reference") return referenceToTyped(value, symbols);
  return { kind: "literal", raw: valueToText(value) ?? value.raw };
};

export const valueToReferenceList = (
  value: ChemdValue | undefined,
  symbols: ProgramSymbolTable
): ReferenceOrLiteral[] => {
  if (!value) return [];
  if (value.type === "list") {
    return value.items
      .map((item) => valueToReferenceOrLiteral(item, symbols))
      .filter((item): item is ReferenceOrLiteral => Boolean(item));
  }
  const single = valueToReferenceOrLiteral(value, symbols);
  return single ? [single] : [];
};
