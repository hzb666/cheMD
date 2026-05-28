import type {
  AgentRunDeclaration,
  ChemdDeclaration,
  ChemdDocComment,
  ChemdReferenceExpr,
  ChemdValue,
  Diagnostic
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type { StepGraph } from "@chemd/step-ontology";
import type { TypedSemanticNode } from "@chemd/typechecker";

import type {
  BuildLnfInput,
  LnfAgentSection,
  LnfDeclarationIndexEntry,
  LnfDocumentationLink,
  LnfEntityBase,
  LnfProcedure,
  LnfSourceCompletenessSummary
} from "./types";

type FieldDeclaration = ChemdDeclaration & { fields: Record<string, ChemdValue> };

const hasFields = (declaration: ChemdDeclaration): declaration is FieldDeclaration =>
  "fields" in declaration;

const isAgentRun = (declaration: ChemdDeclaration): declaration is AgentRunDeclaration =>
  declaration.kind === "agent_run";

const isReferenceValue = (value: ChemdValue): value is ChemdReferenceExpr =>
  value.type === "reference";

export const getDocIds = (declaration: Pick<ChemdDeclaration, "docs">): string[] =>
  declaration.docs.map((doc) => doc.docId);

export const toDeclarationIndexEntry = (
  declaration: ChemdDeclaration
): LnfDeclarationIndexEntry => ({
  declarationId: declaration.id,
  qualifiedId: declaration.qualifiedId,
  declarationKind: declaration.kind,
  sourceSpan: declaration.sourceSpan,
  docIds: getDocIds(declaration)
});

export const toDocumentInfo = (input: BuildLnfInput) => ({
  id: input.document.meta.id,
  title: input.document.meta.title,
  date: input.document.meta.date,
  moduleName: input.document.module.name,
  sourceLanguage: input.document.sourceLanguage
});

export const toDocumentationLink = (doc: ChemdDocComment): LnfDocumentationLink => ({
  docId: doc.id,
  attachment: doc.attachment,
  references: doc.references,
  links: doc.links
});

const typedNodeMatchesDeclaration = (
  node: TypedSemanticNode,
  declaration: ChemdDeclaration
): boolean =>
  node.sourceMetadata?.declarationId === declaration.id
  || node.sourceMetadata?.declarationId === declaration.qualifiedId
  || node.nodeId === declaration.id
  || node.nodeId === declaration.qualifiedId;

const findTypedNode = <Node extends TypedSemanticNode>(
  nodes: TypedSemanticNode[],
  declaration: ChemdDeclaration,
  kind: Node["kind"]
): Node | undefined =>
  nodes.find((node): node is Node =>
    node.kind === kind && typedNodeMatchesDeclaration(node, declaration)
  );

export const toLnfEntity = <
  Declaration extends ChemdDeclaration,
  Node extends TypedSemanticNode
>(
  declaration: Declaration,
  nodes: TypedSemanticNode[],
  kind: Node["kind"]
): LnfEntityBase<Declaration, Node> => ({
  declarationId: declaration.id,
  qualifiedId: declaration.qualifiedId,
  declarationKind: declaration.kind,
  fields: hasFields(declaration) ? declaration.fields : {},
  annotations: declaration.annotations,
  sourceSpan: declaration.sourceSpan,
  docIds: getDocIds(declaration),
  declaration,
  typedNode: findTypedNode<Node>(nodes, declaration, kind)
});

export const declarationsOfKind = <Kind extends ChemdDeclaration["kind"]>(
  input: BuildLnfInput,
  kind: Kind
): Array<Extract<ChemdDeclaration, { kind: Kind }>> =>
  input.document.declarations.filter(
    (declaration): declaration is Extract<ChemdDeclaration, { kind: Kind }> =>
      declaration.kind === kind
  );

export const toProcedures = (stepGraph: StepGraph): LnfProcedure[] =>
  stepGraph.procedures.map((procedure) => ({
    procedureId: procedure.procedureId,
    lowering: procedure
  }));

export const toAgentSection = (document: BuildLnfInput["document"]): LnfAgentSection | undefined => {
  const runs = document.declarations.filter(isAgentRun);

  if (runs.length === 0) {
    return undefined;
  }

  return {
    runs,
    patches: runs.flatMap((run) =>
      run.patches.map((patch) => ({
        runId: run.id,
        patch
      }))
    ),
    decisions: runs.flatMap((run) =>
      run.decisions.map((decision) => ({
        runId: run.id,
        decision
      }))
    )
  };
};

const countDocUnresolvedReferences = (docs: ChemdDocComment[]): number =>
  docs.reduce((count, doc) =>
    count + doc.references.filter((reference) =>
      reference.resolution?.status === "unresolved"
    ).length,
  0);

const countValueUnresolvedReferences = (value: ChemdValue): number => {
  if (isReferenceValue(value)) {
    return value.resolved?.status === "unresolved" ? 1 : 0;
  }

  if (value.type === "list") {
    return value.items.reduce((count, item) => count + countValueUnresolvedReferences(item), 0);
  }

  if (value.type === "record") {
    return value.fields.reduce(
      (count, field) => count + countValueUnresolvedReferences(field.value),
      0
    );
  }

  if (value.type === "call") {
    return value.args.reduce(
      (count, arg) => count + countValueUnresolvedReferences(arg.value),
      0
    );
  }

  return value.type === "patch" ? countValueUnresolvedReferences(value.value) : 0;
};

const countDeclarationUnresolvedReferences = (declaration: ChemdDeclaration): number =>
  hasFields(declaration)
    ? Object.values(declaration.fields).reduce(
        (count, value) => count + countValueUnresolvedReferences(value),
        0
      )
    : 0;

const diagnosticReferencesDeclaration = (
  diagnostic: Diagnostic | V03Diagnostic,
  declarationIds: Set<string>
): boolean =>
  diagnostic.severity === "error"
  && Boolean(
    (diagnostic.sourceNodeId && declarationIds.has(diagnostic.sourceNodeId))
    || (diagnostic.nodeId && declarationIds.has(diagnostic.nodeId))
  );

export const buildSourceCompleteness = (input: BuildLnfInput): LnfSourceCompletenessSummary => {
  const declarationIds = new Set(input.document.declarations.flatMap((declaration) => [
    declaration.id,
    declaration.qualifiedId
  ]));
  const incompleteDeclarationIds = new Set(
    input.diagnostics
      .filter((diagnostic) => diagnosticReferencesDeclaration(diagnostic, declarationIds))
      .map((diagnostic) => diagnostic.sourceNodeId ?? diagnostic.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId))
  );

  return {
    declarationCount: input.document.declarations.length,
    documentationCount: input.document.docs.length,
    unresolvedReferenceCount:
      Object.values(input.document.meta.fields).reduce(
        (count, value) => count + countValueUnresolvedReferences(value),
        0
      )
      + input.document.declarations.reduce(
        (count, declaration) => count + countDeclarationUnresolvedReferences(declaration),
        0
      )
      + countDocUnresolvedReferences(input.document.docs),
    incompleteDeclarationCount: incompleteDeclarationIds.size,
    agentAuditRunCount: input.document.declarations.filter(isAgentRun).length
  };
};
