import type {
  CapabilityRule,
  ConfirmationRule,
  StepCapability,
  StepFamilySchema,
  StepParamSchema
} from "./step-schema-types";
import type { CanonicalStepNode, StepFamily } from "./types";

const quantity = (
  name: string,
  quantityClass: NonNullable<StepParamSchema["quantityClass"]>,
  aliases: string[] = []
): StepParamSchema => ({
  name,
  type: "quantity",
  quantityClass,
  ...(aliases.length > 0 ? { aliases } : {})
});

const stringParam = (name: string, aliases: string[] = []): StepParamSchema => ({
  name,
  type: "string",
  ...(aliases.length > 0 ? { aliases } : {})
});

const enumParam = (name: string, values: string[], aliases: string[] = []): StepParamSchema => ({
  name,
  type: "enum",
  values,
  ...(aliases.length > 0 ? { aliases } : {})
});

const baseParams = [
  stringParam("materials", ["material", "reagent", "agent"]),
  stringParam("solvent"),
  stringParam("vessel"),
  stringParam("atmosphere"),
  quantity("amount", "amount"),
  quantity("mass", "mass"),
  quantity("volume", "volume"),
  quantity("temperature", "temperature", ["target_temperature"]),
  quantity("duration", "time", ["time"]),
  quantity("pressure", "pressure"),
  quantity("rate", "rate"),
  quantity("rpm", "rpm"),
  quantity("ph", "ph"),
  quantity("concentration", "concentration"),
  quantity("equivalent", "equivalent", ["equiv", "equivalents"]),
  quantity("percent", "percent"),
  stringParam("method"),
  stringParam("medium"),
  stringParam("wash"),
  stringParam("location"),
  stringParam("sample"),
  stringParam("ref"),
  stringParam("artifact"),
  stringParam("message"),
  stringParam("condition"),
  stringParam("adapter"),
  stringParam("resource"),
  stringParam("output"),
  stringParam("outputs"),
  stringParam("column"),
  stringParam("eluent"),
  stringParam("fraction"),
  stringParam("technique"),
  stringParam("addition_method", ["mode"]),
  quantity("ramp", "rate"),
  stringParam("cycles"),
  stringParam("repeats")
] satisfies StepParamSchema[];

const manualConfirmation: ConfirmationRule = { strategy: "manual_required" };

const schema = (input: StepFamilySchema): StepFamilySchema => ({
  unknownParams: "allow",
  ...input
});

export const STEP_FAMILY_SCHEMAS: readonly StepFamilySchema[] = [
  schema({
    family: "charge",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["inputs", "materials"] }],
    safetyTags: ["inventory", "vessel"],
    robotRunnable: true
  }),
  schema({
    family: "add",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["inputs", "materials"] }],
    confirmation: manualConfirmation,
    safetyTags: ["hazardous_reagent"],
    robotRunnable: true
  }),
  schema({
    family: "transfer",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["inputs", "materials"] }],
    robotRunnable: true
  }),
  schema({
    family: "mix",
    params: baseParams,
    required: [],
    capabilities: [{ capability: "stirring" }],
    robotRunnable: true
  }),
  schema({
    family: "cool",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["temperature", "method"] }],
    capabilities: [{ capability: "cooling" }],
    confirmation: manualConfirmation,
    robotRunnable: true
  }),
  schema({
    family: "heat",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["temperature", "duration"] }],
    capabilities: [{ capability: "heating" }],
    confirmation: manualConfirmation,
    safetyTags: ["exotherm"],
    robotRunnable: true
  }),
  schema({
    family: "hold",
    params: baseParams,
    required: [{ kind: "field", field: "duration" }],
    robotRunnable: true
  }),
  schema({
    family: "purge",
    params: baseParams,
    required: [{ kind: "field", field: "atmosphere" }],
    defaults: [{ field: "atmosphere", value: "nitrogen", reason: "standard inert purge" }],
    capabilities: [{ capability: "inert_gas" }],
    confirmation: manualConfirmation,
    safetyTags: ["inert_requirement"],
    robotRunnable: true
  }),
  schema({
    family: "quench",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["materials", "inputs"] }],
    confirmation: manualConfirmation,
    safetyTags: ["quench", "exotherm", "gas_evolution"],
    robotRunnable: false
  }),
  schema({
    family: "extract",
    params: baseParams,
    required: [{ kind: "field", field: "solvent" }],
    safetyTags: ["biphasic_system"],
    robotRunnable: true
  }),
  schema({
    family: "wash",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["solvent", "inputs"] }],
    robotRunnable: true
  }),
  schema({
    family: "separate_layers",
    params: baseParams,
    required: [],
    safetyTags: ["biphasic_system"],
    robotRunnable: true
  }),
  schema({
    family: "filter",
    params: [stringParam("medium"), stringParam("wash")],
    required: [{ kind: "field", field: "medium" }],
    capabilities: [{ capability: "filtration" }],
    robotRunnable: true,
    unknownParams: "error"
  }),
  schema({
    family: "dry",
    params: baseParams,
    required: [],
    capabilities: [{ capability: "vacuum" }],
    robotRunnable: true
  }),
  schema({
    family: "concentrate",
    params: baseParams,
    required: [],
    capabilities: [{ capability: "vacuum" }],
    robotRunnable: true
  }),
  schema({
    family: "purify",
    params: baseParams,
    required: [{ kind: "anyOf", fields: ["method", "technique"] }],
    capabilities: [{ capability: "chromatography" }],
    robotRunnable: true
  }),
  schema({
    family: "sample",
    params: baseParams,
    required: [],
    robotRunnable: true
  }),
  schema({
    family: "analyze",
    params: [
      enumParam("type", ["tlc", "nmr", "hplc", "uplc", "gc", "lcms", "gcms", "ms", "hrms", "ir", "uv"], [
        "analysisType",
        "analysis_type"
      ]),
      ...baseParams
    ],
    required: [{ kind: "field", field: "type" }],
    capabilities: [
      { capability: "analytical_tlc", when: { param: "type", equals: ["tlc"] } },
      { capability: "nmr", when: { param: "type", equals: ["nmr"] } },
      { capability: "hplc", when: { param: "type", equals: ["hplc", "uplc"] } }
    ],
    robotRunnable: true
  }),
  schema({
    family: "observe",
    params: baseParams,
    required: [],
    robotRunnable: true
  }),
  schema({
    family: "store",
    params: baseParams,
    required: [{ kind: "field", field: "location" }],
    safetyTags: ["storage"],
    robotRunnable: true
  })
];

const SCHEMA_BY_FAMILY = new Map(STEP_FAMILY_SCHEMAS.map((item) => [item.family, item]));

export const STEP_FAMILIES = new Set<StepFamily>(STEP_FAMILY_SCHEMAS.map((item) => item.family));

export const getStepFamilySchema = (family: StepFamily): StepFamilySchema =>
  SCHEMA_BY_FAMILY.get(family) as StepFamilySchema;

export const getStepParamSchema = (
  family: StepFamily,
  field: string
): StepParamSchema | undefined => {
  const schema = getStepFamilySchema(family);
  return schema.params.find((param) => param.name === field || param.aliases?.includes(field));
};

export const normalizeStepParamName = (
  family: StepFamily,
  field: string
): string => getStepParamSchema(family, field)?.name ?? field;

export const getCapabilitiesForStep = (step: Pick<CanonicalStepNode, "family" | "params">): StepCapability[] =>
  (getStepFamilySchema(step.family).capabilities ?? [])
    .filter((rule) => matchesCapabilityRule(step.params, rule))
    .map((rule) => rule.capability);

export const getSafetyTagsForStep = (family: StepFamily): string[] =>
  getStepFamilySchema(family).safetyTags ?? [];

export const isRobotRunnableStep = (family: StepFamily): boolean =>
  getStepFamilySchema(family).robotRunnable !== false;

export const getConfirmationRuleForStep = (family: StepFamily): ConfirmationRule =>
  getStepFamilySchema(family).confirmation ?? { strategy: "none" };

const matchesCapabilityRule = (
  params: Record<string, unknown>,
  rule: CapabilityRule
): boolean => {
  if (!rule.when) {
    return true;
  }

  const value = params[rule.when.param];
  return typeof value === "string" && rule.when.equals.includes(value.toLowerCase());
};
