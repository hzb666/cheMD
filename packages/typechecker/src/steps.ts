import type {
  ProcedureChildNode,
  ProcedureControlKind,
  ProcedureControlNode,
  ProcedureNode,
  ProcedureStepNode
} from "@chemd/core/compat";
import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import {
  lowerProcedureToSteps,
  type CanonicalProcedureControlNode,
  type CanonicalStepNode,
  type ProcedureLoweringResult,
  type StepInputNode,
  type StepFamily
} from "@chemd/step-ontology";

import {
  applyStepDefaults,
  createStepDiagnostic,
  isStepFamily,
  normalizeStepParams,
  validateAllowedParams,
  validateDependencyCycles,
  validateDependencyRefs,
  validateRequiredParams,
  validateStepIds
} from "./step-rules";
import { resolveStepInputs, resolveStepOutputs, resolveStepParamReferences } from "./step-references";
import type { ExternalTargetIndex, ObjectNode, ProcedureMode, QuantityType } from "./types";

interface ExplicitProcedureResult {
  result: ProcedureLoweringResult;
  quantities: QuantityType[];
}

interface ExplicitStepContext {
  node: ProcedureNode;
  controlPath?: string[];
  dependsOn?: string[];
  explicitStepId?: string;
  stepIndex: number;
  step: NonNullable<ProcedureNode["steps"]>[number];
  objectIndex?: Map<string, ObjectNode>;
  externalTargetIndex?: ExternalTargetIndex;
}

interface ControlFlattenState {
  diagnostics: V03Diagnostic[];
  objectIndex?: Map<string, ObjectNode>;
  externalTargetIndex?: ExternalTargetIndex;
  procedure: ProcedureNode;
  quantities: QuantityType[];
  steps: CanonicalStepNode[];
  controls: CanonicalProcedureControlNode[];
}

interface ControlScope {
  controlPath: string[];
  idPrefix: string;
  knownIds: Map<string, string>;
  previousIds: string[];
}

interface ExplicitStepInputs {
  inputs?: StepInputNode[];
  diagnostics: V03Diagnostic[];
}

interface ResolvedStepParams {
  family: StepFamily;
  params: Record<string, unknown>;
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

interface ResolvedStepIo {
  inputs?: StepInputNode[];
  outputs?: CanonicalStepNode["outputs"];
  diagnostics: V03Diagnostic[];
}

const readStepId = (node: ProcedureNode, index: number, stepId: string | undefined): string =>
  stepId ?? `${node.id ?? "procedure"}:s${index + 1}`;

const buildExplicitStepInputs = (
  rawInputs: string[] | undefined,
  objectIndex: Map<string, ObjectNode> | undefined,
  externalTargetIndex: ExternalTargetIndex | undefined,
  stepId: string
): ExplicitStepInputs => {
  if (!rawInputs) {
    return { diagnostics: [] };
  }

  if (!objectIndex) {
    return { inputs: rawInputs.map((raw) => ({ raw })), diagnostics: [] };
  }

  return resolveStepInputs(rawInputs, objectIndex, externalTargetIndex, stepId);
};

const buildExplicitStepOutputs = (
  rawOutputs: string[] | undefined,
  objectIndex: Map<string, ObjectNode> | undefined,
  externalTargetIndex: ExternalTargetIndex | undefined,
  stepId: string
): { outputs?: CanonicalStepNode["outputs"]; diagnostics: V03Diagnostic[] } => {
  if (!rawOutputs) {
    return { diagnostics: [] };
  }

  if (!objectIndex) {
    return { outputs: rawOutputs.map((raw) => ({ raw })), diagnostics: [] };
  }

  return resolveStepOutputs(rawOutputs, objectIndex, externalTargetIndex, stepId);
};

const resolveExplicitStepParams = (
  stepId: string,
  step: NonNullable<ProcedureNode["steps"]>[number],
  objectIndex: Map<string, ObjectNode> | undefined,
  externalTargetIndex: ExternalTargetIndex | undefined
): ResolvedStepParams | { diagnostics: V03Diagnostic[]; quantities: QuantityType[] } => {
  if (!isStepFamily(step.family)) {
    return {
      quantities: [],
      diagnostics: [
        createStepDiagnostic(
          "E_STEP_INVALID_FAMILY",
          `Invalid procedure step family: ${step.family}`,
          stepId,
          { family: step.family }
        )
      ]
    };
  }

  const family: StepFamily = step.family;
  const normalized = normalizeStepParams(stepId, family, step.params);
  const defaultedParams = applyStepDefaults(family, normalized.params);
  const resolvedParams = objectIndex
    ? resolveStepParamReferences(defaultedParams, objectIndex, externalTargetIndex, stepId)
    : { params: defaultedParams, diagnostics: [] };

  return {
    family,
    params: resolvedParams.params,
    quantities: normalized.quantities,
    diagnostics: [
      ...normalized.diagnostics,
      ...resolvedParams.diagnostics,
      ...validateAllowedParams(stepId, family, resolvedParams.params)
    ]
  };
};

const resolveExplicitStepIo = (
  stepId: string,
  step: NonNullable<ProcedureNode["steps"]>[number],
  objectIndex: Map<string, ObjectNode> | undefined,
  externalTargetIndex: ExternalTargetIndex | undefined
): ResolvedStepIo => {
  const stepInputs = buildExplicitStepInputs(step.inputs, objectIndex, externalTargetIndex, stepId);
  const stepOutputs = buildExplicitStepOutputs(step.outputs, objectIndex, externalTargetIndex, stepId);

  return {
    ...(stepInputs.inputs ? { inputs: stepInputs.inputs } : {}),
    ...(stepOutputs.outputs ? { outputs: stepOutputs.outputs } : {}),
    diagnostics: [...stepInputs.diagnostics, ...stepOutputs.diagnostics]
  };
};

const toExplicitStep = ({
  node,
  controlPath,
  dependsOn,
  explicitStepId,
  stepIndex,
  step,
  objectIndex,
  externalTargetIndex
}: ExplicitStepContext): { step?: CanonicalStepNode; quantities: QuantityType[]; diagnostics: V03Diagnostic[] } => {
  const stepId = explicitStepId ?? readStepId(node, stepIndex, step.stepId);
  const resolvedParams = resolveExplicitStepParams(stepId, step, objectIndex, externalTargetIndex);
  if (!("family" in resolvedParams)) {
    return resolvedParams;
  }

  const resolvedIo = resolveExplicitStepIo(stepId, step, objectIndex, externalTargetIndex);
  const diagnostics = [
    ...resolvedParams.diagnostics,
    ...resolvedIo.diagnostics,
    ...validateRequiredParams(stepId, resolvedParams.family, {
      params: resolvedParams.params,
      inputs: step.inputs,
      outputs: step.outputs
    })
  ];

  return {
    quantities: resolvedParams.quantities,
    diagnostics,
    step: {
      stepId,
      family: resolvedParams.family,
      ...(step.stage ? { stage: step.stage } : {}),
      ...(step.purpose ? { purpose: step.purpose } : {}),
      params: resolvedParams.params,
      ...(resolvedIo.inputs ? { inputs: resolvedIo.inputs } : {}),
      ...(resolvedIo.outputs ? { outputs: resolvedIo.outputs } : {}),
      ...(dependsOn ?? step.dependsOn ? { dependsOn: dependsOn ?? step.dependsOn } : {}),
      ...(step.evidence ? { evidence: step.evidence } : {}),
      ...(controlPath && controlPath.length > 0 ? { controlPath } : {}),
      source: {
        sourceNodeType: "procedure",
        sourceNodeId: node.id,
        sourceType: "explicit_step",
        sentenceIndex: stepIndex,
        rawText: step.raw ?? `step: ${step.family}`,
        ...(step.sourceSpan ? { sourceSpan: step.sourceSpan } : {}),
        ...(step.provenance ? { provenance: step.provenance } : {})
      },
      ...(step.provenance ? { provenance: step.provenance } : {}),
      loweringConfidence: typeof step.confidence === "number" ? step.confidence : 1
    }
  };
};

const hasControlChildren = (node: ProcedureNode): boolean =>
  node.children?.some((child) => child.type === "control") === true;

const isProcedureStep = (child: ProcedureChildNode): child is ProcedureStepNode =>
  child.type === "step";

const isProcedureControl = (child: ProcedureChildNode): child is ProcedureControlNode =>
  child.type === "control";

const createControlDiagnostic = (
  code: string,
  severity: V03Diagnostic["severity"],
  message: string,
  node: ProcedureNode,
  control: ProcedureControlNode | undefined,
  facts: Record<string, unknown> = {}
): V03Diagnostic =>
  createV03Diagnostic({
    code,
    severity,
    message,
    sourceLayer: "typechecker",
    sourceNodeType: "procedure",
    sourceNodeId: node.id,
    sourceField: control?.kind ?? "control",
    facts
  });

const readControlId = (control: ProcedureControlNode): string | undefined =>
  control.kind === "default" ? "default" : control.controlId;

const resolveDependencyIds = (
  dependencies: string[] | undefined,
  scope: ControlScope
): string[] | undefined =>
  dependencies?.map((dependencyId) => scope.knownIds.get(dependencyId) ?? dependencyId);

const localStepId = (
  step: ProcedureStepNode,
  fallbackIndex: number
): string =>
  step.generatedStepId ? `${step.family}${fallbackIndex > 0 ? `-${fallbackIndex + 1}` : ""}` : step.stepId ?? step.family;

const canonicalStepId = (
  step: ProcedureStepNode,
  stepIndex: number,
  scope: ControlScope
): string =>
  scope.idPrefix ? `${scope.idPrefix}${localStepId(step, stepIndex)}` : step.stepId ?? localStepId(step, stepIndex);

const isDynamicControl = (kind: ProcedureControlKind): boolean =>
  ["until", "branch", "wait", "abort_if"].includes(kind);

const createCanonicalControl = (
  node: ProcedureNode,
  control: ProcedureControlNode,
  scope: ControlScope,
  children?: CanonicalProcedureControlNode[]
): CanonicalProcedureControlNode => {
  const controlId = scope.idPrefix
    ? `${scope.idPrefix}${readControlId(control) ?? control.kind}`
    : readControlId(control) ?? control.kind;
  const controlPath = [...scope.controlPath, controlId];

  return {
    controlId,
    kind: control.kind,
    params: control.params ?? {},
    controlPath,
    dynamic: isDynamicControl(control.kind),
    ...(children && children.length > 0 ? { children } : {}),
    source: {
      sourceNodeType: "procedure",
      sourceNodeId: node.id,
      rawText: control.raw ?? `${control.kind}: ${control.controlId ?? ""}`,
      ...(control.sourceSpan ? { sourceSpan: control.sourceSpan } : {}),
      ...(control.provenance ? { provenance: control.provenance } : {})
    },
    ...(control.provenance ? { provenance: control.provenance } : {})
  };
};

const validateControlShape = (
  node: ProcedureNode,
  control: ProcedureControlNode
): V03Diagnostic[] => {
  const diagnostics: V03Diagnostic[] = [];
  const children = control.children?.filter((child) => child.type !== "markdown") ?? [];

  if (!readControlId(control) && !["case", "default", "path"].includes(control.kind)) {
    diagnostics.push(createControlDiagnostic(
      "E_PROCEDURE_CONTROL_ID",
      "error",
      `Procedure control ${control.kind} requires an id.`,
      node,
      control,
      { control_kind: control.kind }
    ));
  }

  if (control.kind === "repeat") {
    const count = Number(control.params?.count);
    if (!Number.isInteger(count) || count <= 0) {
      diagnostics.push(createControlDiagnostic(
        "E_PROCEDURE_CONTROL_COUNT",
        "error",
        "repeat control requires a positive integer count.",
        node,
        control,
        { count: control.params?.count }
      ));
    }
    if (children.length === 0) {
      diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_BODY", "error", "repeat body cannot be empty.", node, control));
    }
  }

  if (control.kind === "until") {
    if (!control.params?.condition) {
      diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_CONDITION", "error", "until requires condition.", node, control));
    }
    if (children.length === 0) {
      diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_BODY", "error", "until body cannot be empty.", node, control));
    }
    if (!control.params?.max_iterations) {
      diagnostics.push(createControlDiagnostic(
        "W_PROCEDURE_CONTROL_DYNAMIC",
        "warning",
        "until without max_iterations requires runtime review.",
        node,
        control
      ));
    }
  }

  if (control.kind === "branch") {
    const cases = children.filter((child): child is ProcedureControlNode => isProcedureControl(child) && child.kind === "case");
    const defaults = children.filter((child): child is ProcedureControlNode => isProcedureControl(child) && child.kind === "default");
    if (cases.length === 0 || defaults.length !== 1) {
      diagnostics.push(createControlDiagnostic(
        "E_PROCEDURE_CONTROL_BRANCH",
        "error",
        "branch requires at least one case and exactly one default.",
        node,
        control
      ));
    }
    const defaultIndex = children.findIndex((child) => isProcedureControl(child) && child.kind === "default");
    if (defaultIndex >= 0 && defaultIndex !== children.length - 1) {
      diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_BRANCH", "error", "branch default must be last.", node, control));
    }
    diagnostics.push(...validateSiblingControlIds(node, cases));
  }

  if (control.kind === "case" && !control.params?.condition) {
    diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_CONDITION", "error", "case requires condition.", node, control));
  }
  if (control.kind === "default" && control.params?.condition) {
    diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_CONDITION", "error", "default cannot define condition.", node, control));
  }

  if (control.kind === "parallel") {
    const paths = children.filter((child): child is ProcedureControlNode => isProcedureControl(child) && child.kind === "path");
    if (paths.length < 2) {
      diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_PARALLEL", "error", "parallel requires at least two path blocks.", node, control));
    }
    for (const path of paths) {
      if (!path.children?.some((child) => child.type !== "markdown")) {
        diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_BODY", "error", "parallel path body cannot be empty.", node, path));
      }
    }
    diagnostics.push(...validateSiblingControlIds(node, paths));
  }

  if (control.kind === "wait" && !control.params?.condition) {
    diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_CONDITION", "error", "wait requires condition.", node, control));
  }
  if (control.kind === "abort_if" && !control.params?.condition) {
    diagnostics.push(createControlDiagnostic("E_PROCEDURE_CONTROL_CONDITION", "error", "abort_if requires condition.", node, control));
  }

  return diagnostics;
};

const validateSiblingControlIds = (
  node: ProcedureNode,
  controls: ProcedureControlNode[]
): V03Diagnostic[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const control of controls) {
    const id = readControlId(control);
    if (!id) {
      continue;
    }
    if (seen.has(id)) {
      duplicates.add(id);
    }
    seen.add(id);
  }

  return [...duplicates].map((controlId) => createControlDiagnostic(
    "E_PROCEDURE_CONTROL_ID_DUPLICATE",
    "error",
    `Duplicate sibling control id: ${controlId}`,
    node,
    undefined,
    { control_id: controlId }
  ));
};

const validateControlCondition = (
  control: ProcedureControlNode,
  state: ControlFlattenState,
  scope: ControlScope
): V03Diagnostic[] => {
  const condition = control.params?.condition;
  if (!condition) {
    return [];
  }

  const diagnostics: V03Diagnostic[] = [];
  const hasOperator = /(?:==|!=|<=|>=|<|>|\bexists\b|\bin\b|\bmatches\b|\band\b|\bor\b|\bnot\b)/.test(condition);
  const isRuntimeBoolean = /^(?:operator|sensor|time|run)\.[A-Za-z0-9_.-]+$/.test(condition.trim());
  if (!hasOperator && !isRuntimeBoolean) {
    diagnostics.push(createControlDiagnostic(
      "E_PROCEDURE_CONTROL_CONDITION",
      "error",
      `Control condition must be structured: ${condition}`,
      state.procedure,
      control,
      { condition }
    ));
  }

  const refs = Array.from(condition.matchAll(/@([A-Za-z0-9_.#:-]+)/g), (match) => match[1] ?? "");
  for (const ref of refs) {
    const baseRef = ref.includes(".") ? ref.split(".")[0] : ref;
    if (!state.objectIndex?.has(baseRef) && !scope.knownIds.has(baseRef)) {
      diagnostics.push(createControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONDITION",
        "error",
        `Control condition references unknown target: @${ref}`,
        state.procedure,
        control,
        { condition, ref }
      ));
    }
  }

  const conditionWithoutRefs = condition.replace(/@[A-Za-z0-9_.#:-]+/g, "");
  const runtimeNamespaces = Array.from(
    conditionWithoutRefs.matchAll(/\b([A-Za-z][A-Za-z0-9_]*)\.[A-Za-z0-9_.-]+/g),
    (match) => match[1] ?? ""
  );
  for (const namespace of runtimeNamespaces) {
    if (!["operator", "sensor", "time", "run"].includes(namespace)) {
      diagnostics.push(createControlDiagnostic(
        "E_PROCEDURE_CONTROL_CONDITION",
        "error",
        `Unknown runtime condition namespace: ${namespace}`,
        state.procedure,
        control,
        { condition, namespace }
      ));
    }
  }

  return diagnostics;
};

const appendStepFromControl = (
  state: ControlFlattenState,
  step: ProcedureStepNode,
  stepIndex: number,
  scope: ControlScope
): string[] => {
  const stepId = canonicalStepId(step, stepIndex, scope);
  const dependencies = resolveDependencyIds(step.dependsOn, scope) ?? scope.previousIds;
  const converted = toExplicitStep({
    node: state.procedure,
    controlPath: scope.controlPath,
    dependsOn: dependencies.length > 0 ? dependencies : undefined,
    explicitStepId: stepId,
    stepIndex,
    step,
    objectIndex: state.objectIndex,
    externalTargetIndex: state.externalTargetIndex
  });

  state.diagnostics.push(...converted.diagnostics);
  state.quantities.push(...converted.quantities);
  if (converted.step) {
    state.steps.push(converted.step);
    scope.knownIds.set(step.stepId ?? localStepId(step, stepIndex), stepId);
    scope.knownIds.set(localStepId(step, stepIndex), stepId);
  }

  return converted.step ? [stepId] : [];
};

const flattenChildren = (
  children: ProcedureChildNode[] | undefined,
  state: ControlFlattenState,
  scope: ControlScope
): string[] => {
  let previousIds = [...scope.previousIds];
  let stepIndex = 0;

  for (const child of children ?? []) {
    if (isProcedureStep(child)) {
      previousIds = appendStepFromControl(state, child, stepIndex, { ...scope, previousIds });
      stepIndex += 1;
      continue;
    }

    if (isProcedureControl(child)) {
      previousIds = flattenControl(child, state, { ...scope, previousIds });
    }
  }

  return previousIds;
};

const flattenControl = (
  control: ProcedureControlNode,
  state: ControlFlattenState,
  scope: ControlScope
): string[] => {
  state.diagnostics.push(...validateControlShape(state.procedure, control));
  state.diagnostics.push(...validateControlCondition(control, state, scope));
  const rawControlId = readControlId(control) ?? control.kind;
  const controlId = scope.idPrefix ? `${scope.idPrefix}${rawControlId}` : rawControlId;
  const nextKnownIds = new Map(scope.knownIds);
  nextKnownIds.set(rawControlId, controlId);

  if (control.kind === "repeat") {
    const count = Number(control.params?.count);
    let previousIds = [...scope.previousIds];
    for (let iteration = 1; Number.isInteger(count) && iteration <= count; iteration += 1) {
      previousIds = flattenChildren(control.children, state, {
        controlPath: [...scope.controlPath, controlId],
        idPrefix: `${controlId}[${iteration}].`,
        knownIds: new Map(nextKnownIds),
        previousIds
      });
    }
    state.controls.push(createCanonicalControl(state.procedure, control, scope));
    return previousIds.length > 0 ? previousIds : [controlId];
  }

  if (control.kind === "parallel") {
    const pathLastIds = (control.children ?? [])
      .filter((child): child is ProcedureControlNode => isProcedureControl(child) && child.kind === "path")
      .flatMap((path) => flattenControl(path, state, {
        controlPath: [...scope.controlPath, controlId],
        idPrefix: `${controlId}.`,
        knownIds: new Map(nextKnownIds),
        previousIds: scope.previousIds
      }));
    state.controls.push(createCanonicalControl(state.procedure, control, scope));
    return pathLastIds.length > 0 ? pathLastIds : [controlId];
  }

  if (control.kind === "path") {
    const previousIds = flattenChildren(control.children, state, {
      controlPath: [...scope.controlPath, controlId],
      idPrefix: `${controlId}.`,
      knownIds: new Map(nextKnownIds),
      previousIds: scope.previousIds
    });
    state.controls.push(createCanonicalControl(state.procedure, control, scope));
    return previousIds.length > 0 ? previousIds : [controlId];
  }

  const nestedControls = (control.children ?? [])
    .filter(isProcedureControl)
    .map((child) => {
      const childScope = {
        controlPath: [...scope.controlPath, controlId],
        idPrefix: `${controlId}.`,
        knownIds: nextKnownIds,
        previousIds: []
      };
      state.diagnostics.push(
        ...validateControlShape(state.procedure, child),
        ...validateControlCondition(child, state, childScope)
      );
      return createCanonicalControl(state.procedure, child, childScope);
    });
  state.controls.push(createCanonicalControl(state.procedure, control, scope, nestedControls));
  return [controlId];
};

const buildMissingExplicitProcedureResult = (node: ProcedureNode): ProcedureLoweringResult => ({
  procedureId: node.id,
  structureHint: "explicit_steps",
  sourceType: "explicit_steps",
  steps: [],
  diagnostics: [
    createV03Diagnostic({
      code: "E_STEP_MISSING_FIELD",
      severity: "error",
      message: "procedureMode=explicit requires procedure step entries.",
      sourceLayer: "typechecker",
      sourceNodeType: "procedure",
      sourceNodeId: node.id,
      sourceField: "step",
      facts: { field: "step" }
    })
  ],
  loweringConfidence: 0
});

const buildExplicitProcedureResult = (
  node: ProcedureNode,
  objectIndex?: Map<string, ObjectNode>,
  externalTargetIndex?: ExternalTargetIndex
): ExplicitProcedureResult => {
  const diagnostics: V03Diagnostic[] = [];
  const quantities: QuantityType[] = [];
  const steps: CanonicalStepNode[] = [];

  node.steps?.forEach((step, index) => {
    const converted = toExplicitStep({ node, stepIndex: index, step, objectIndex, externalTargetIndex });
    diagnostics.push(...converted.diagnostics);
    quantities.push(...converted.quantities);
    if (converted.step) {
      steps.push(converted.step);
    }
  });
  diagnostics.push(...validateStepIds(steps), ...validateDependencyRefs(steps), ...validateDependencyCycles(steps));

  return {
    quantities,
    result: {
      procedureId: node.id,
      structureHint: "explicit_steps",
      sourceType: "explicit_steps",
      steps,
      diagnostics,
      loweringConfidence: steps.length > 0 ? 1 : 0
    }
  };
};

const validateControlIds = (
  node: ProcedureNode,
  controls: CanonicalProcedureControlNode[]
): V03Diagnostic[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const control of controls) {
    if (seen.has(control.controlId)) {
      duplicates.add(control.controlId);
    }
    seen.add(control.controlId);
  }

  return [...duplicates].map((controlId) =>
    createControlDiagnostic(
      "E_PROCEDURE_CONTROL_ID_DUPLICATE",
      "error",
      `Duplicate procedure control id: ${controlId}`,
      node,
      undefined,
      { control_id: controlId }
    )
  );
};

const validateStepControlIdCollisions = (
  node: ProcedureNode,
  steps: CanonicalStepNode[],
  controls: CanonicalProcedureControlNode[]
): V03Diagnostic[] => {
  const stepIds = new Set(steps.map((step) => step.stepId));
  return controls
    .filter((control) => stepIds.has(control.controlId))
    .map((control) => createControlDiagnostic(
      "E_PROCEDURE_CONTROL_ID_DUPLICATE",
      "error",
      `Procedure step and control share id: ${control.controlId}`,
      node,
      undefined,
      { control_id: control.controlId }
    ));
};

const buildControlProcedureResult = (
  node: ProcedureNode,
  objectIndex?: Map<string, ObjectNode>,
  externalTargetIndex?: ExternalTargetIndex
): ExplicitProcedureResult => {
  const state: ControlFlattenState = {
    diagnostics: [],
    objectIndex,
    externalTargetIndex,
    procedure: node,
    quantities: [],
    steps: [],
    controls: []
  };

  flattenChildren(node.children, state, {
    controlPath: [],
    idPrefix: "",
    knownIds: new Map(),
    previousIds: []
  });
  state.diagnostics.push(
    ...validateStepIds(state.steps),
    ...validateControlIds(node, state.controls),
    ...validateStepControlIdCollisions(node, state.steps, state.controls),
    ...validateDependencyRefs(state.steps, state.controls.map((control) => control.controlId)),
    ...validateDependencyCycles(state.steps)
  );

  return {
    quantities: state.quantities,
    result: {
      procedureId: node.id,
      structureHint: "explicit_steps",
      sourceType: "explicit_steps",
      steps: state.steps,
      controls: state.controls,
      diagnostics: state.diagnostics,
      loweringConfidence: state.steps.length > 0 || state.controls.length > 0 ? 1 : 0
    }
  };
};

export const resolveProcedureSteps = (
  node: ProcedureNode,
  procedureMode: ProcedureMode,
  objectIndex?: Map<string, ObjectNode>,
  externalTargetIndex?: ExternalTargetIndex
): ExplicitProcedureResult => {
  if (procedureMode === "lowered") {
    return { result: lowerProcedureToSteps({ procedureId: node.id, body: node.body }), quantities: [] };
  }

  if (hasControlChildren(node)) {
    return buildControlProcedureResult(node, objectIndex, externalTargetIndex);
  }

  if (node.steps && node.steps.length > 0) {
    return buildExplicitProcedureResult(node, objectIndex, externalTargetIndex);
  }

  if (procedureMode === "explicit") {
    return { result: buildMissingExplicitProcedureResult(node), quantities: [] };
  }

  return { result: lowerProcedureToSteps({ procedureId: node.id, body: node.body }), quantities: [] };
};
