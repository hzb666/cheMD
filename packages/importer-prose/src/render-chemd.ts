import type {
  ObservationFrame,
  ProseImportCandidate,
  ReactionCandidate,
  ReactionFactCandidate,
  ReactionFactRole,
  RenderChemdDraftOptions,
  StepFrame
} from "./types";

const RENDER_CONFIDENCE_THRESHOLD = 0.75;
const REACTION_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

const REACTION_ROLE_FIELDS: Record<ReactionFactRole, string> = {
  reactant: "reactants",
  product: "products",
  reagent: "reagents",
  solvent: "solvent",
  temperature: "temperature",
  time: "time",
  pressure: "pressure",
  atmosphere: "atmosphere",
  yield: "yield"
};

const sanitizeValue = (value: unknown): string =>
  String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "/")
    .trim();

const renderStringValue = (value: unknown): string =>
  JSON.stringify(sanitizeValue(value));

const renderProgramValue = (value: unknown): string => {
  const text = sanitizeValue(value).replace(/\s*°C\b/g, " C");
  return /^-?\d+(?:\.\d+)?\s*(?:%|[A-Za-z]+)$/.test(text)
    ? text
    : renderStringValue(text);
};

const sanitizeReactionValue = (value: string): string =>
  value
    .replace(/\r?\n/g, " ")
    .replace(/;;/g, ";")
    .replace(/\|/g, "/")
    .trim();

const renderableFactValue = (fact: ReactionFactCandidate): string | undefined => {
  const value = sanitizeReactionValue(fact.normalized?.trim() || fact.raw);
  return value.length > 0 ? value : undefined;
};

const formatReactionId = (id: string): string => {
  const cleaned = id.replace(/^[#@]+/, "").replace(/[^a-zA-Z0-9_]/g, "_");
  if (REACTION_ID_PATTERN.test(cleaned)) {
    return cleaned;
  }

  const fallback = cleaned.length > 0 ? cleaned : "reaction";
  return `rxn_${fallback}`;
};

const getReactionFieldForRole = (role: ReactionFactRole): string | undefined => {
  return REACTION_ROLE_FIELDS[role];
};

const getRenderableFacts = (
  candidate: ReactionCandidate,
  role: ReactionFactRole
): ReactionFactCandidate[] =>
  candidate.facts.filter((fact) =>
    fact.role === role
    && fact.confidence >= RENDER_CONFIDENCE_THRESHOLD
    && getReactionFieldForRole(fact.role) !== undefined
    && renderableFactValue(fact) !== undefined
  );

const pickHighestConfidenceFact = (
  candidate: ReactionCandidate,
  role: ReactionFactRole
): ReactionFactCandidate | undefined =>
  getRenderableFacts(candidate, role).reduce<ReactionFactCandidate | undefined>(
    (best, fact) => !best || fact.confidence > best.confidence ? fact : best,
    undefined
  );

const todayIsoDate = (): string =>
  new Date().toISOString().slice(0, 10);

const formatParam = ([key, value]: [string, unknown]): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return `${key}: ${renderProgramValue(value)}`;
};

const renderStepLine = (step: StepFrame, index: number): string => {
  const params = Object.entries(step.params)
    .map(formatParam)
    .filter((item): item is string => Boolean(item));

  return `  step s${index + 1} = ${step.family}(${params.join(", ")})`;
};

const renderListRoleLines = (
  candidate: ReactionCandidate,
  role: "reactant" | "product"
): string[] => {
  const field = getReactionFieldForRole(role);
  if (!field) {
    return [];
  }

  const values = getRenderableFacts(candidate, role)
    .map(renderableFactValue)
    .filter((item): item is string => Boolean(item));
  return values.length > 0
    ? [`  ${field}: [${values.map(renderStringValue).join(", ")}]`]
    : [];
};

const renderReagentsLine = (candidate: ReactionCandidate): string[] => {
  const field = getReactionFieldForRole("reagent");
  if (!field) {
    return [];
  }

  const values = getRenderableFacts(candidate, "reagent")
    .map(renderableFactValue)
    .filter((item): item is string => Boolean(item));

  if (values.length === 0) {
    return [];
  }
  return values.length === 1
    ? [`  ${field}: ${renderStringValue(values[0])}`]
    : [`  ${field}: [${values.map(renderStringValue).join(", ")}]`];
};

const renderScalarRoleLine = (
  candidate: ReactionCandidate,
  role: Exclude<ReactionFactRole, "reactant" | "product" | "reagent">
): string[] => {
  const field = getReactionFieldForRole(role);
  const fact = pickHighestConfidenceFact(candidate, role);
  const value = fact ? renderableFactValue(fact) : undefined;

  return field && value ? [`  ${field}: ${renderProgramValue(value)}`] : [];
};

export const renderReactionBlock = (candidate: ReactionCandidate): string[] => {
  const fieldLines = [
    ...renderListRoleLines(candidate, "reactant"),
    ...renderListRoleLines(candidate, "product"),
    ...renderReagentsLine(candidate),
    ...renderScalarRoleLine(candidate, "solvent"),
    ...renderScalarRoleLine(candidate, "temperature"),
    ...renderScalarRoleLine(candidate, "time"),
    ...renderScalarRoleLine(candidate, "pressure"),
    ...renderScalarRoleLine(candidate, "atmosphere"),
    ...renderScalarRoleLine(candidate, "yield")
  ];
  if (fieldLines.length === 0) {
    return [];
  }

  return [
    `reaction ${formatReactionId(candidate.id)} {`,
    ...fieldLines,
    "}"
  ];
};

const renderLinkedReactionBlocks = (
  candidates: readonly ReactionCandidate[]
): { lines: string[]; firstReactionId?: string } => {
  const rendered = candidates
    .map((candidate) => ({
      reactionId: formatReactionId(candidate.id),
      lines: renderReactionBlock(candidate)
    }))
    .filter((item) => item.lines.length > 0);

  return {
    lines: rendered.flatMap((item) => item.lines),
    firstReactionId: rendered[0]?.reactionId
  };
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

  return `  event_${index + 1}: ${renderStringValue([
    observation.eventType,
    ...params
  ].join(" | "))}`;
};

const renderProcedureBlock = (
  candidate: ProseImportCandidate,
  reactionId?: string
): string[] => {
  if (candidate.steps.length === 0) {
    return [];
  }

  return [
    `procedure import_procedure${reactionId ? ` for @${reactionId}` : ""} {`,
    ...candidate.steps.map(renderStepLine),
    "}"
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
    "observation import_observation {",
    `  notes: ${renderStringValue(lines.join("; "))}`,
    "}"
  ];
};

export const renderChemdDraft = (
  candidate: ProseImportCandidate,
  options: RenderChemdDraftOptions = {}
): string => {
  const moduleName = (options.documentId ?? "imported-prose")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[^a-zA-Z_]+/, "exp_") || "imported_prose";
  const programHeader = [
    `module ${moduleName}`,
    "",
    "meta {",
    `  id: ${renderStringValue(options.documentId ?? "imported-prose")}`,
    `  title: ${renderStringValue(options.title ?? "Imported prose")}`,
    `  date: ${renderStringValue(options.date ?? todayIsoDate())}`,
    "}"
  ];
  const reactionBlocks = renderLinkedReactionBlocks(candidate.reactionCandidates);
  const blocks = [
    ...reactionBlocks.lines,
    ...renderProcedureBlock(candidate, reactionBlocks.firstReactionId),
    ...renderObservationBlock(candidate)
  ];

  return [
    ...programHeader,
    "",
    ...blocks
  ].join("\n");
};
