import type { V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode } from "@chemd/step-ontology";

import { createStepDiagnostic } from "./step-schema-checker";

export {
  applyStepDefaults,
  isStepFamily,
  normalizeStepParams,
  validateAllowedParams,
  validateRequiredParams
} from "./step-schema-checker";
export { createStepDiagnostic };

export const validateStepIds = (steps: CanonicalStepNode[]): V03Diagnostic[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const step of steps) {
    if (seen.has(step.stepId)) {
      duplicates.add(step.stepId);
    }
    seen.add(step.stepId);
  }

  return [...duplicates].map((stepId) =>
    createStepDiagnostic(
      "E_STEP_ID_DUPLICATE",
      `Duplicate procedure step id: ${stepId}`,
      stepId,
      { step_id: stepId }
    )
  );
};

export const validateDependencyRefs = (
  steps: CanonicalStepNode[],
  controlIds: string[] = []
): V03Diagnostic[] => {
  const knownIds = new Set([...steps.map((step) => step.stepId), ...controlIds]);

  return steps.flatMap((step) =>
    (step.dependsOn ?? [])
      .filter((dependencyId) => !knownIds.has(dependencyId))
      .map((dependencyId) =>
        createStepDiagnostic(
          "E_STEP_INVALID_REFERENCE",
          `Step ${step.stepId} depends on missing step: ${dependencyId}`,
          step.stepId,
          { dependency_id: dependencyId }
        )
      )
  );
};

const collectCycleIds = (steps: CanonicalStepNode[]): string[] => {
  const graph = new Map(steps.map((step) => [step.stepId, step.dependsOn ?? []]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const cyclic = new Set<string>();

  const visit = (stepId: string) => {
    if (active.has(stepId)) {
      cyclic.add(stepId);
      return;
    }
    if (visited.has(stepId)) {
      return;
    }
    visited.add(stepId);
    active.add(stepId);
    for (const dependencyId of graph.get(stepId) ?? []) {
      if (graph.has(dependencyId)) {
        visit(dependencyId);
      }
    }
    active.delete(stepId);
  };

  for (const stepId of graph.keys()) {
    visit(stepId);
  }
  return [...cyclic];
};

export const validateDependencyCycles = (steps: CanonicalStepNode[]): V03Diagnostic[] =>
  collectCycleIds(steps).map((stepId) =>
    createStepDiagnostic(
      "E_STEP_DEPENDENCY_CYCLE",
      `Step dependency cycle includes step: ${stepId}`,
      stepId,
      { step_id: stepId }
    )
  );
