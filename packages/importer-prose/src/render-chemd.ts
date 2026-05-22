import type {
  ObservationFrame,
  ProseImportCandidate,
  RenderChemdDraftOptions,
  StepFrame
} from "./types";

const sanitizeValue = (value: unknown): string =>
  String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "/")
    .trim();

const todayIsoDate = (): string =>
  new Date().toISOString().slice(0, 10);

const formatParam = ([key, value]: [string, unknown]): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return `${key}=${sanitizeValue(value)}`;
};

const renderStepLine = (step: StepFrame, index: number): string => {
  const params = Object.entries({
    id: `s${index + 1}`,
    ...step.params
  })
    .map(formatParam)
    .filter((item): item is string => Boolean(item));

  return [`step: ${step.family}`, ...params].join(" | ");
};

const findLinkedStepId = (
  observation: ObservationFrame,
  steps: readonly StepFrame[]
): string | undefined => {
  if (observation.linkedStepId) {
    return observation.linkedStepId;
  }

  const stepIndex = steps.findIndex((step) => step.family === observation.linkedStepFamily);
  return stepIndex >= 0 ? `s${stepIndex + 1}` : undefined;
};

const renderObservationEvent = (
  observation: ObservationFrame,
  steps: readonly StepFrame[],
  index: number
): string | undefined => {
  if (!observation.eventType) {
    return undefined;
  }

  const linkedStep = findLinkedStepId(observation, steps);
  const params = Object.entries({
    id: `e${index + 1}`,
    ...(linkedStep ? { linkedStep } : {}),
    confidence: observation.confidence
  })
    .map(formatParam)
    .filter((item): item is string => Boolean(item));

  return [`event: ${observation.eventType}`, ...params].join(" | ");
};

const renderProcedureBlock = (candidate: ProseImportCandidate): string[] => {
  if (candidate.steps.length === 0) {
    return [];
  }

  return [
    ":::procedure #import-procedure",
    ...candidate.steps.map(renderStepLine),
    ":::"
  ];
};

const renderObservationBlock = (candidate: ProseImportCandidate): string[] => {
  if (candidate.observations.length === 0) {
    return [];
  }

  const lines = candidate.observations.map((observation, index) =>
    renderObservationEvent(observation, candidate.steps, index) ?? observation.rawText
  );

  return [
    ":::observation #import-observation",
    ...lines,
    ":::"
  ];
};

export const renderChemdDraft = (
  candidate: ProseImportCandidate,
  options: RenderChemdDraftOptions = {}
): string => {
  const frontmatter = [
    "---",
    `id: ${options.documentId ?? "imported-prose"}`,
    `title: ${options.title ?? "Imported prose"}`,
    `date: ${options.date ?? todayIsoDate()}`,
    "---"
  ];
  const blocks = [
    ...renderProcedureBlock(candidate),
    ...renderObservationBlock(candidate)
  ];

  return [
    ...frontmatter,
    "",
    ...blocks
  ].join("\n");
};
