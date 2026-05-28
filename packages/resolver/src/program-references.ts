import type {
  AgentPatchEditDeclaration,
  AgentRunDeclaration,
  AgentToolCallDeclaration,
  ChemdDeclaration,
  ChemdFieldDeclarationBase,
  ChemdMetaDeclaration,
  ChemdProgramDocument,
  ChemdReferenceExpr,
  Diagnostic,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement,
  ProcedureStepDeclaration,
  ReferenceResolution
} from "@chemd/core";

import type { ProgramSymbolTable } from "./program-index";
import {
  resolveReference,
  resolveReferenceList,
  resolveValue,
  resolveValueRecord
} from "./program-reference-values";

export const resolveProgramReferences = (
  program: ChemdProgramDocument,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdProgramDocument => ({
  ...program,
  meta: resolveMeta(program.meta, symbols, diagnostics),
  declarations: program.declarations.map((declaration) =>
    resolveDeclaration(declaration, symbols, diagnostics)
  )
});

export const resolveProgramReference = (
  reference: ChemdReferenceExpr,
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  if (reference.refKind === "local") {
    return resolveLocalReference(reference, symbols);
  }
  if (reference.refKind === "field") {
    return resolveFieldReference(reference, symbols);
  }
  if (reference.refKind === "module") {
    return resolveModuleReference(reference, symbols);
  }
  return {
    status: "resolved",
    value: {
      kind: "external_document",
      externalDocumentId: reference.externalDocumentId,
      target: reference.target,
      ...(reference.field ? { field: reference.field } : {})
    }
  };
};

const resolveMeta = (
  meta: ChemdMetaDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdMetaDeclaration => ({
  ...meta,
  fields: resolveValueRecord(meta.fields, symbols, diagnostics),
  ...(meta.primary
    ? {
        primary: {
          ...meta.primary,
          ...(meta.primary.molecule ? { molecule: resolveReference(meta.primary.molecule, symbols, diagnostics) } : {}),
          ...(meta.primary.reaction ? { reaction: resolveReference(meta.primary.reaction, symbols, diagnostics) } : {}),
          ...(meta.primary.result ? { result: resolveReference(meta.primary.result, symbols, diagnostics) } : {}),
          ...(meta.primary.analysis ? { analysis: resolveReference(meta.primary.analysis, symbols, diagnostics) } : {}),
          ...(meta.primary.sample ? { sample: resolveReference(meta.primary.sample, symbols, diagnostics) } : {})
        }
      }
    : {})
});

const resolveDeclaration = (
  declaration: ChemdDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ChemdDeclaration => {
  if (declaration.kind === "procedure") {
    return resolveProcedure(declaration, symbols, diagnostics);
  }
  if (declaration.kind === "agent_run") {
    return resolveAgentRun(declaration, symbols, diagnostics);
  }
  return resolveFieldDeclaration(declaration, symbols, diagnostics);
};

const resolveFieldDeclaration = <TDeclaration extends ChemdFieldDeclarationBase>(
  declaration: TDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): TDeclaration => {
  const target = readDeclarationTarget(declaration);
  return {
    ...declaration,
    fields: resolveValueRecord(declaration.fields, symbols, diagnostics),
    ...(target ? { target: resolveReference(target, symbols, diagnostics) } : {})
  };
};

const readDeclarationTarget = (
  declaration: ChemdFieldDeclarationBase
): ChemdReferenceExpr | undefined => (
  "target" in declaration
    ? (declaration as ChemdFieldDeclarationBase & { target?: ChemdReferenceExpr }).target
    : undefined
);

const resolveProcedure = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ProcedureDeclaration => ({
  ...declaration,
  ...(declaration.target ? { target: resolveReference(declaration.target, symbols, diagnostics) } : {}),
  ...(declaration.evidence ? { evidence: resolveReferenceList(declaration.evidence, symbols, diagnostics) } : {}),
  children: declaration.children.map((child) =>
    resolveProcedureStatement(child, symbols, diagnostics)
  )
});

const resolveProcedureStatement = (
  statement: ProcedureStatement,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ProcedureStatement => {
  if (statement.kind === "step") {
    return resolveProcedureStep(statement, symbols, diagnostics);
  }
  if (statement.kind === "control") {
    return resolveProcedureControl(statement, symbols, diagnostics);
  }
  return statement;
};

const resolveProcedureStep = (
  step: ProcedureStepDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ProcedureStepDeclaration => ({
  ...step,
  args: resolveValueRecord(step.args, symbols, diagnostics),
  ...(step.inputs ? { inputs: resolveReferenceList(step.inputs, symbols, diagnostics) } : {}),
  ...(step.outputs ? { outputs: resolveReferenceList(step.outputs, symbols, diagnostics) } : {}),
  ...(step.evidence ? { evidence: resolveReferenceList(step.evidence, symbols, diagnostics) } : {})
});

const resolveProcedureControl = (
  control: ProcedureControlDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): ProcedureControlDeclaration => ({
  ...control,
  args: resolveValueRecord(control.args, symbols, diagnostics),
  children: control.children.map((child) =>
    resolveProcedureStatement(child, symbols, diagnostics)
  )
});

const resolveAgentRun = (
  declaration: AgentRunDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): AgentRunDeclaration => ({
  ...declaration,
  toolCalls: declaration.toolCalls.map((tool) =>
    resolveAgentTool(tool, symbols, diagnostics)
  ),
  evidence: declaration.evidence.map((item) => ({
    ...item,
    ...(item.refs ? { refs: resolveReferenceList(item.refs, symbols, diagnostics) } : {})
  })),
  patches: declaration.patches.map((patch) => ({
    ...patch,
    edits: patch.edits.map((edit) => resolvePatchEdit(edit, symbols, diagnostics)),
    ...(patch.evidence ? { evidence: resolveReferenceList(patch.evidence, symbols, diagnostics) } : {})
  })),
  auditTimeline: declaration.auditTimeline.map((event) => ({
    ...event,
    ...(event.evidence ? { evidence: resolveReferenceList(event.evidence, symbols, diagnostics) } : {})
  }))
});

const resolveAgentTool = (
  tool: AgentToolCallDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): AgentToolCallDeclaration => ({
  ...tool,
  ...(tool.args ? { args: resolveValueRecord(tool.args, symbols, diagnostics) } : {}),
  ...(tool.evidence ? { evidence: resolveReferenceList(tool.evidence, symbols, diagnostics) } : {}),
  ...(tool.output ? { output: resolveValue(tool.output, symbols, diagnostics) } : {})
});

const resolvePatchEdit = (
  edit: AgentPatchEditDeclaration,
  symbols: ProgramSymbolTable,
  diagnostics: Diagnostic[]
): AgentPatchEditDeclaration => ({
  ...edit,
  value: resolveValue(edit.value, symbols, diagnostics)
});

const resolveLocalReference = (
  reference: ChemdReferenceExpr & { refKind: "local" },
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  const targetId = symbols.primaryAliases.get(reference.target) ?? reference.target;
  const declaration = symbols.declarationsById.get(targetId);
  return declaration ? { status: "resolved", value: declaration } : unresolved(reference);
};

const resolveFieldReference = (
  reference: ChemdReferenceExpr & { refKind: "field" },
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  const targetId = symbols.primaryAliases.get(reference.target) ?? reference.target;
  const declaration = symbols.declarationsById.get(targetId);
  if (!declaration || !("fields" in declaration)) {
    return unresolved(reference);
  }
  const value = declaration.fields[reference.field];
  return value === undefined ? unresolved(reference) : { status: "resolved", value };
};

const resolveModuleReference = (
  reference: ChemdReferenceExpr & { refKind: "module" },
  symbols: ProgramSymbolTable
): ReferenceResolution => {
  if (reference.moduleName === symbols.moduleName) {
    const declaration = symbols.declarationsByQualifiedId.get(
      `${reference.moduleName}.${reference.target}`
    );
    return declaration ? { status: "resolved", value: declaration } : unresolved(reference);
  }

  const imported = symbols.imports.get(reference.moduleName);
  return imported
    ? { status: "resolved", value: { kind: "imported_module_reference", moduleName: imported.moduleName, from: imported.from, target: reference.target } }
    : unresolved(reference);
};

const unresolved = (reference: ChemdReferenceExpr): ReferenceResolution => ({
  status: "unresolved",
  message: `Unable to resolve reference ${reference.raw}`
});
