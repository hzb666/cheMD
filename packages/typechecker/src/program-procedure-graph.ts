import type {
  ChemdImportDeclaration,
  ProcedureControlDeclaration,
  ProcedureDeclaration,
  ProcedureStatement
} from "@chemd/core";
import type { V03Diagnostic } from "@chemd/diagnostics";
import type {
  CanonicalProcedureControlNode,
  CanonicalStepNode,
  ProcedureLoweringResult
} from "@chemd/step-ontology";

import {
  buildProgramControl,
  validateProgramControlShape,
  validateProgramProcedure
} from "./program-procedure-controls";
import { createProgramControlDiagnostic } from "./program-procedure-diagnostics";
import {
  buildProgramStep,
  buildTypedStep,
  collectProcedureQuantities
} from "./program-procedure-steps";
import { sourceForDeclaration, type ProgramSymbolTable } from "./program-utils";
import { createExternalTargetIndex } from "./references";
import type {
  ExternalTargetIndex,
  QuantityType,
  TypecheckOptions,
  TypedSemanticNode,
  TypedStepNode
} from "./types";

export interface ProcedureBuildResult {
  lowering: ProcedureLoweringResult;
  typedSteps: TypedStepNode[];
  quantities: QuantityType[];
}

type ProcedureBuildOptions = Pick<
  TypecheckOptions,
  "procedureMode" | "referenceContext" | "reactionRouteContext" | "moduleImports"
>;

interface ProcedureAssembly {
  steps: CanonicalStepNode[];
  typedSteps: TypedStepNode[];
  controls: CanonicalProcedureControlNode[];
  diagnostics: V03Diagnostic[];
}

export const buildProcedureDeclaration = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  options: ProcedureBuildOptions = {}
) => {
  const built = lowerProgramProcedure(declaration, symbols, options);
  const node: TypedSemanticNode = {
    nodeId: declaration.id,
    kind: "procedure_narrative",
    sourceNodeType: "procedure",
    sourceMetadata: sourceForDeclaration(declaration),
    declaredKind: declaration.kind,
    rawText: "",
    structureHint: "explicit_steps"
  };
  return {
    nodes: options.procedureMode === "lowered" ? [] : [node],
    quantities: [],
    diagnostics: [],
    procedure: built
  };
};

const lowerProgramProcedure = (
  declaration: ProcedureDeclaration,
  symbols: ProgramSymbolTable,
  options: ProcedureBuildOptions
): ProcedureBuildResult => {
  const externalTargetIndex = createExternalTargetIndex(
    options.referenceContext,
    options.reactionRouteContext
  );
  const assembly = createProcedureAssembly();
  for (const statement of declaration.children) {
    appendProcedureStatement({
      statement,
      procedure: declaration,
      symbols,
      externalTargetIndex,
      moduleImports: options.moduleImports ?? [],
      assembly,
      controlPath: []
    });
  }
  assembly.diagnostics.push(
    ...validateProgramProcedure(declaration, assembly.steps, assembly.controls, options)
  );
  return {
    lowering: {
      procedureId: declaration.id,
      structureHint: "explicit_steps",
      sourceType: "explicit_steps",
      steps: assembly.steps,
      controls: assembly.controls,
      diagnostics: assembly.diagnostics,
      loweringConfidence: assembly.diagnostics.length > 0 ? 0.5 : 1
    },
    typedSteps: assembly.typedSteps,
    quantities: collectProcedureQuantities(declaration)
  };
};

interface AppendProcedureStatementOptions {
  statement: ProcedureStatement;
  procedure: ProcedureDeclaration;
  symbols: ProgramSymbolTable;
  externalTargetIndex: ExternalTargetIndex;
  moduleImports: ChemdImportDeclaration[];
  assembly: ProcedureAssembly;
  controlPath: string[];
  parentControlKind?: ProcedureControlDeclaration["controlKind"];
}

const createProcedureAssembly = (): ProcedureAssembly => ({
  steps: [],
  typedSteps: [],
  controls: [],
  diagnostics: []
});

const appendProcedureStatement = (
  options: AppendProcedureStatementOptions
): void => {
  const { statement } = options;
  if (statement.kind === "step") {
    appendProcedureStep(options, statement);
    return;
  }
  if (statement.kind === "control") {
    appendProcedureControl(options, statement);
  }
};

const appendProcedureStep = (
  options: AppendProcedureStatementOptions,
  statement: Extract<ProcedureStatement, { kind: "step" }>
): void => {
  const { parentControlKind, procedure, assembly, symbols, externalTargetIndex, controlPath } = options;
  if (parentControlKind === "branch" || parentControlKind === "parallel") {
    assembly.diagnostics.push(createProgramControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONTEXT",
      "error",
      `${parentControlKind} cannot contain direct step entries.`,
      procedure,
      undefined,
      { control_kind: parentControlKind, step_id: statement.id }
    ));
  }
  const step = buildProgramStep(
    statement,
    procedure,
    symbols,
    externalTargetIndex,
    assembly.diagnostics,
    controlPath
  );
  assembly.steps.push(step);
  assembly.typedSteps.push(buildTypedStep(step, procedure, statement.sourceSpan));
};

const appendProcedureControl = (
  options: AppendProcedureStatementOptions,
  statement: ProcedureControlDeclaration
): void => {
  const { procedure, assembly, symbols, externalTargetIndex, moduleImports, parentControlKind } = options;
  const control = buildProgramControl(statement, procedure, options.controlPath);
  assembly.controls.push(control);
  assembly.diagnostics.push(...validateProgramControlShape(
    procedure,
    statement,
    symbols,
    externalTargetIndex,
    parentControlKind,
    moduleImports
  ));
  for (const child of statement.children) {
    appendProcedureStatement({
      ...options,
      statement: child,
      controlPath: control.controlPath,
      parentControlKind: statement.controlKind
    });
  }
};
